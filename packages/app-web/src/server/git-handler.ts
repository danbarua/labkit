import { createTwoFilesPatch } from "diff";
import {
  type Blob,
  type Commit,
  type DiffDelta,
  type Repository,
  RevwalkSort,
  type Tree,
  type TreeEntry,
} from "es-git";
import {
  BRANCH_SLUG,
  BRANCH_TYPE,
  COMMIT_SLUG,
  COMMIT_TYPE,
  DIFF_TYPE,
  DIRECTORY_TYPE,
  FILE_SLUG,
  FILE_TYPE,
  SUBMODULE_TYPE,
  TIMELINE_SLUG,
} from "./collection-paths";
import { DEFAULT_LIMIT, halJson, MAX_LIMIT, pageParam, pagingLinks } from "./collections-handler";
import { problem, publicOrigin } from "./graph-handler";
import { summaryOf } from "./commit-summary";
import { actItem, actsRanAgainst, RAN_AGAINST } from "./events-handler";
import { isNotFound } from "./repositories";
import type { TenantScope } from "./runtime";

/** The longest diff of one file a commit is served with, in characters. A longer one is cut and flagged. */
export const PATCH_LIMIT = 20_000;
/** The most line edits a file's diff is computed with. A file needing more is served without its lines. */
const EDIT_LIMIT = 20_000;
/** The longest text a file is served with, in characters. A longer one is cut and flagged. */
export const FILE_LIMIT = 100_000;

const COMMITS = /^\/commit\/?$/;
// The branches, `/branch`, one branch, `/branch/{name}` with its name as one encoded segment, and
// every branch's commits, `/timeline`.
const BRANCHES = /^\/branch\/?$/;
const ONE_BRANCH = /^\/branch\/([^/]+)$/;
const TIMELINE = /^\/timeline\/?$/;
const ONE_COMMIT = /^\/commit\/([0-9a-f]{40}|[0-9a-f]{64})$/;
// A commit's changed files, `/commit/{id}/changes`, and the acts that ran against it,
// `/commit/{id}/acts`.
const CHANGES = /^\/commit\/([0-9a-f]{40}|[0-9a-f]{64})\/changes\/?$/;
const ACTS = /^\/commit\/([0-9a-f]{40}|[0-9a-f]{64})\/acts\/?$/;
// A commit's diff, one resource per changed file: `/commit/{id}/diff` lists them, and
// `/commit/{id}/diff/{path}` is one.
const DIFFS = /^\/commit\/([0-9a-f]{40}|[0-9a-f]{64})\/diff\/?$/;
const ONE_DIFF = /^\/commit\/([0-9a-f]{40}|[0-9a-f]{64})\/diff\/(.+)$/;
// The commits that changed a file, from HEAD, `/history/{path}`, or from a commit,
// `/commit/{id}/history/{path}`.
const HISTORY = /^(?:\/commit\/([0-9a-f]{40}|[0-9a-f]{64}))?\/history\/(.+)$/;
// The tree at HEAD, `/file/{path}`, or at a commit, `/commit/{id}/file/{path}`.
const IN_TREE = /^(?:\/commit\/([0-9a-f]{40}|[0-9a-f]{64}))?\/file(?:\/(.*))?$/;

/** Whether `rest`, the path after `/workspace/{slug}`, names the workspace's files or history. */
export function isGitPath(rest: string): boolean {
  return /^\/(commit|file|history|branch|timeline)(\/|$)/.test(rest);
}

/**
 * The relations a commit and a file have, named as the graph's are: `<edge>:<type>` out, and
 * `<type>:<edge>` in. Each lists at most DEFAULT_LIMIT resources, the page size of every
 * collection; a collection link (`changes`, `acts`, `diff`, `history`) has the rest.
 */
export const REL = {
  parent: "parent:commit",
  tip: "points_to:commit",
  changes: "changes:file",
  changedBy: "commit:changes",
} as const;

/** `path` decoded from its URL form, each segment, with empty segments dropped. */
function decodedPath(encoded: string): string {
  return encoded
    .split("/")
    .filter((s) => s !== "")
    .map(decodeURIComponent)
    .join("/");
}

/**
 * The ids of the commits, from `from` back along first parents, that changed `path`: that added
 * it, changed its content, or removed it. Newest first, at most `count`. A rename is not
 * followed: the file's history starts where it took this path.
 */
function changesTo(repo: Repository, from: string, path: string, count: number): string[] {
  const found: string[] = [];
  const entryAt = (id: string) => repo.getCommit(id).tree().getPath(path)?.id() ?? null;
  const walk = repo.revwalk().simplifyFirstParent().push(from);
  let id = walk.next();
  let here = id === null ? null : entryAt(id);
  while (id !== null && found.length < count) {
    const parent = walk.next();
    const before = parent === null ? null : entryAt(parent);
    if (here !== before) found.push(id);
    id = parent;
    here = before;
  }
  return found;
}

/** A page of `items` as a collection named `slug` at `self`, by the request's `limit` and `offset`. */
function collectionPage(
  req: Request,
  up: string,
  self: string,
  slug: string,
  items: (offset: number, limit: number) => { page: unknown[]; more: boolean },
): Response {
  const url = new URL(req.url);
  const limit = pageParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = pageParam(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const { page, more } = items(offset, limit);
  return halJson(req, {
    _links: {
      self: { href: `${self}?limit=${limit}&offset=${offset}` },
      ...Object.fromEntries(
        pagingLinks(up, self, limit, offset, more).map((l) => [l.rel, { href: l.href }]),
      ),
    },
    offset,
    limit,
    count: page.length,
    _embedded: { [slug]: page },
  });
}

/** How entries are ordered by name: case aside, and numbers by value, so `f2` comes before `f10`. */
const BY_NAME = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Git's mode for a symbolic link, whose blob holds the path it points to. */
const SYMLINK_MODE = 0o120000;
const EXECUTABLE_MODE = 0o100755;

/**
 * One changed file as a unified diff, `git diff` style, built from the two versions of the file:
 * es-git's own patch text leaves out each line's `+`, `-` or space.
 */
function patchOf(repo: Repository, delta: DiffDelta): string {
  const before = delta.oldFile();
  const after = delta.newFile();
  const a = before.path() ?? after.path() ?? "";
  const b = after.path() ?? a;
  const head = `diff --git a/${a} b/${b}\n`;
  const blob = (exists: boolean, id: string) =>
    exists ? repo.getObject(id).peelToBlob() : undefined;
  const old = blob(before.exists(), before.id());
  const now = blob(after.exists(), after.id());
  if (old?.isBinary() || now?.isBinary()) return `${head}Binary files differ\n`;
  const text = (version: Blob | undefined) =>
    version === undefined ? "" : Buffer.from(version.content()).toString("utf8");
  const patch = createTwoFilesPatch(
    old === undefined ? "/dev/null" : `a/${a}`,
    now === undefined ? "/dev/null" : `b/${b}`,
    text(old),
    text(now),
    undefined,
    undefined,
    { context: 3, maxEditLength: EDIT_LIMIT },
  );
  if (patch === undefined)
    return `${head}The diff needs more than ${EDIT_LIMIT} line edits and is not shown.\n`;
  // jsdiff opens with a rule of `=` signs; `git diff` does not.
  return head + patch.replace(/^=+\n/, "");
}

/** The ids of commit `id`'s parents, first parent first; none for a root commit. */
function parentsOf(repo: Repository, id: string): string[] {
  const parents: string[] = [];
  for (let n = 1; ; n++) {
    try {
      parents.push(repo.revparseSingle(`${id}^${n}`));
    } catch (err) {
      if (isNotFound(err)) return parents;
      throw err;
    }
  }
}

/** `/commit`: the history from HEAD, newest first, by `limit` and `offset`. */
function history(req: Request, repo: Repository, base: string): Response {
  const url = new URL(req.url);
  const limit = pageParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = pageParam(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const ids: string[] = [];
  if (!repo.isEmpty()) {
    // Newest first, and never a parent before its child, as `git log` lists them.
    const walk = repo
      .revwalk()
      .setSorting(RevwalkSort.Topological | RevwalkSort.Time)
      .pushHead();
    for (let id = walk.next(); id !== null && ids.length <= offset + limit; id = walk.next())
      ids.push(id);
  }
  const page = ids.slice(offset, offset + limit);
  const self = `${base}/${COMMIT_SLUG}`;
  return halJson(req, {
    _links: {
      self: { href: `${self}?limit=${limit}&offset=${offset}` },
      timeline: { href: `${base}/${TIMELINE_SLUG}` },
      branches: { href: `${base}/${BRANCH_SLUG}` },
      ...Object.fromEntries(
        pagingLinks(base, self, limit, offset, ids.length > offset + limit).map((l) => [
          l.rel,
          { href: l.href },
        ]),
      ),
    },
    offset,
    limit,
    count: page.length,
    _embedded: { [COMMIT_SLUG]: page.map((id) => summaryOf(base, repo.getCommit(id))) },
  });
}

type BranchTip = { name: string; remote: boolean; current: boolean; tip: string };

/**
 * The repository's branches: local ones, then remote-tracking ones, each in BY_NAME order. The
 * branch HEAD is on is `current`. A remote's `HEAD`, such as `origin/HEAD`, points at another
 * branch rather than at a commit, so it is not a branch and is left out.
 */
function branchesOf(repo: Repository): BranchTip[] {
  const head = repo.isEmpty() || repo.headDetached() ? undefined : repo.head().shorthand();
  const tips: BranchTip[] = [];
  for (const { name, type } of repo.branches()) {
    const tip = repo.getBranch(name, type).referenceTarget();
    if (tip === null) continue;
    const remote = type === "Remote";
    tips.push({ name, remote, current: !remote && name === head, tip });
  }
  return tips.sort(
    (a, b) => Number(a.remote) - Number(b.remote) || BY_NAME.compare(a.name, b.name),
  );
}

/** A branch as a resource: its name, whether it is remote or HEAD's, and the commit it points to. */
function branchOf(repo: Repository, base: string, branch: BranchTip) {
  const tip = { href: `${base}/${COMMIT_SLUG}/${branch.tip}`, type: COMMIT_TYPE };
  return {
    id: branch.name,
    type: BRANCH_TYPE,
    name: branch.name,
    remote: branch.remote,
    current: branch.current,
    tip: branch.tip,
    _links: {
      self: {
        href: `${base}/${BRANCH_SLUG}/${encodeURIComponent(branch.name)}`,
        type: BRANCH_TYPE,
      },
      index: { href: `${base}/${BRANCH_SLUG}` },
      [REL.tip]: { ...tip, dir: "out" },
    },
    _embedded: { [REL.tip]: { ...summaryOf(base, repo.getCommit(branch.tip)), dir: "out" } },
  };
}

/** `/branch`: the branches, by `limit` and `offset`. */
function branches(req: Request, repo: Repository, base: string): Response {
  const all = branchesOf(repo);
  return collectionPage(req, base, `${base}/${BRANCH_SLUG}`, BRANCH_SLUG, (offset, limit) => ({
    page: all.slice(offset, offset + limit).map((b) => branchOf(repo, base, b)),
    more: all.length > offset + limit,
  }));
}

/** `/branch/{name}`: one branch, by its name, local or remote-tracking. */
function oneBranch(req: Request, repo: Repository, base: string, encoded: string, slug: string) {
  const name = decodeURIComponent(encoded);
  const branch = branchesOf(repo).find((b) => b.name === name);
  if (branch === undefined) return problem(404, "Not Found", `${name} is not a branch in ${slug}`);
  return halJson(req, branchOf(repo, base, branch));
}

/**
 * `/timeline`: every commit reachable from a branch or HEAD, newest first and never a parent
 * before its child, by `limit` and `offset`. Each carries its parents' ids and the names of the
 * branches that point to it, so a page can draw the branches' lines.
 */
function timeline(req: Request, repo: Repository, base: string): Response {
  const tips = branchesOf(repo);
  const at = new Map<string, string[]>();
  for (const b of tips) at.set(b.tip, [...(at.get(b.tip) ?? []), b.name]);
  const head = repo.isEmpty() ? undefined : repo.revparseSingle("HEAD");
  const self = `${base}/${TIMELINE_SLUG}`;
  return collectionPage(req, base, self, TIMELINE_SLUG, (offset, limit) => {
    const ids: string[] = [];
    if (!repo.isEmpty()) {
      const walk = repo.revwalk().setSorting(RevwalkSort.Topological | RevwalkSort.Time);
      walk.pushGlob("refs/heads/*");
      walk.pushGlob("refs/remotes/*");
      walk.pushHead();
      for (let id = walk.next(); id !== null && ids.length <= offset + limit; id = walk.next())
        ids.push(id);
    }
    return {
      page: ids.slice(offset, offset + limit).map((id) => ({
        ...summaryOf(base, repo.getCommit(id)),
        parents: parentsOf(repo, id),
        branches: at.get(id) ?? [],
        head: id === head,
      })),
      more: ids.length > offset + limit,
    };
  });
}

/**
 * `/commit/{id}`: one commit, with the files it changed and its diff from its first parent, as
 * `git show --first-parent` gives it. A root commit's diff adds every file.
 */
async function oneCommit(
  req: Request,
  repo: Repository,
  scope: TenantScope,
  base: string,
  id: string,
) {
  const slug = scope.slug;
  let commit: Commit;
  try {
    commit = repo.getCommit(id);
  } catch (err) {
    if (isNotFound(err)) return problem(404, "Not Found", `${id} is not a commit in ${slug}`);
    throw err;
  }
  const parents = parentsOf(repo, id);
  const first = parents[0];
  const diff = repo.diffTreeToTree(
    first === undefined ? undefined : repo.getCommit(first).tree(),
    commit.tree(),
  );
  const deltas = [...diff.deltas()];
  const changes = deltas.map((delta) => {
    const path = delta.newFile().path() ?? delta.oldFile().path() ?? "";
    const before = delta.oldFile().path();
    return {
      path,
      status: delta.status(),
      ...(before !== null && before !== path ? { previous_path: before } : {}),
    };
  });
  const stats = diff.stats();
  const summary = summaryOf(base, commit);
  const files = changedFiles(base, id, first, changes);
  const shown = files.slice(0, DEFAULT_LIMIT);
  const ran = await actsRanAgainst(scope, id, DEFAULT_LIMIT);
  const origin = new URL(base).origin;
  const actItems = ran.acts.map((event) => ({ ...actItem(origin, scope, event), dir: "in" }));
  return halJson(req, {
    ...summary,
    message: commit.message(),
    files_changed: Number(stats.filesChanged),
    insertions: Number(stats.insertions),
    deletions: Number(stats.deletions),
    _links: {
      ...summary._links,
      index: { href: `${base}/${COMMIT_SLUG}` },
      tree: { href: `${base}/${COMMIT_SLUG}/${id}/${FILE_SLUG}` },
      changes: { href: `${base}/${COMMIT_SLUG}/${id}/changes` },
      acts: { href: `${base}/${COMMIT_SLUG}/${id}/acts` },
      diff: { href: `${base}/${COMMIT_SLUG}/${id}/diff` },
      [REL.parent]: parents.map((p) => ({
        href: `${base}/${COMMIT_SLUG}/${p}`,
        type: COMMIT_TYPE,
        dir: "out",
      })),
      [REL.changes]: shown.map((file) => ({
        href: file._links.self.href,
        type: FILE_TYPE,
        dir: "out",
        props: { status: file.status },
      })),
      [RAN_AGAINST.in]: actItems.map((item) => ({ ...item._links.self, dir: "in" })),
    },
    _embedded: {
      [REL.parent]: parents.map((p) => ({ ...summaryOf(base, repo.getCommit(p)), dir: "out" })),
      [REL.changes]: shown.map(({ status: _, ...file }) => ({ ...file, dir: "out" })),
      [RAN_AGAINST.in]: actItems,
    },
  });
}

/**
 * Commit `id`'s changed files as items, each at the commit, or for a deleted file at `first`, the
 * first parent, where it last was.
 */
function changedFiles(
  base: string,
  id: string,
  first: string | undefined,
  changes: { path: string; status: string }[],
) {
  return changes.map((change) => {
    const at = `${base}/${COMMIT_SLUG}/${change.status === "Deleted" ? (first ?? id) : id}`;
    return {
      id: change.path,
      type: FILE_TYPE,
      name: change.path.split("/").pop() ?? change.path,
      path: change.path,
      status: change.status,
      _links: { self: { href: `${at}/${FILE_SLUG}/${pathHref(change.path)}`, type: FILE_TYPE } },
    };
  });
}

/** `/commit/{id}/changes`: the files commit `id` changed, by `limit` and `offset`. */
function commitChanges(req: Request, repo: Repository, base: string, id: string, slug: string) {
  let commit: Commit;
  try {
    commit = repo.getCommit(id);
  } catch (err) {
    if (isNotFound(err)) return problem(404, "Not Found", `${id} is not a commit in ${slug}`);
    throw err;
  }
  const first = parentsOf(repo, id)[0];
  const diff = repo.diffTreeToTree(
    first === undefined ? undefined : repo.getCommit(first).tree(),
    commit.tree(),
  );
  const changes = [...diff.deltas()].map((delta) => ({
    path: delta.newFile().path() ?? delta.oldFile().path() ?? "",
    status: delta.status(),
  }));
  const files = changedFiles(base, id, first, changes);
  const self = `${base}/${COMMIT_SLUG}/${id}/changes`;
  return collectionPage(req, `${base}/${COMMIT_SLUG}/${id}`, self, "changes", (offset, limit) => ({
    page: files.slice(offset, offset + limit),
    more: files.length > offset + limit,
  }));
}

/**
 * Commit `id`'s parents' first, and the changes from it: each delta of the diff from the first
 * parent's tree, or from nothing for a root commit. Undefined when the repository holds no
 * commit `id`.
 */
function deltasOf(
  repo: Repository,
  id: string,
): { first?: string; deltas: DiffDelta[] } | undefined {
  let commit: Commit;
  try {
    commit = repo.getCommit(id);
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw err;
  }
  const first = parentsOf(repo, id)[0];
  const diff = repo.diffTreeToTree(
    first === undefined ? undefined : repo.getCommit(first).tree(),
    commit.tree(),
  );
  return { ...(first === undefined ? {} : { first }), deltas: [...diff.deltas()] };
}

/**
 * One changed file's diff in commit `id`, as a resource: the file's path and status, and its
 * unified diff, cut at PATCH_LIMIT characters and flagged when it is.
 */
function diffOf(
  repo: Repository,
  base: string,
  id: string,
  first: string | undefined,
  delta: DiffDelta,
) {
  const path = delta.newFile().path() ?? delta.oldFile().path() ?? "";
  const status = delta.status();
  const patch = patchOf(repo, delta);
  const truncated = patch.length > PATCH_LIMIT;
  const at = `${base}/${COMMIT_SLUG}/${status === "Deleted" ? (first ?? id) : id}`;
  return {
    id: path,
    type: DIFF_TYPE,
    name: path.split("/").pop() ?? path,
    path,
    status,
    patch: truncated ? patch.slice(0, PATCH_LIMIT) : patch,
    patch_truncated: truncated,
    _links: {
      self: { href: `${base}/${COMMIT_SLUG}/${id}/diff/${pathHref(path)}`, type: DIFF_TYPE },
      index: { href: `${base}/${COMMIT_SLUG}/${id}/diff` },
      file: { href: `${at}/${FILE_SLUG}/${pathHref(path)}`, type: FILE_TYPE },
    },
  };
}

/** `/commit/{id}/diff`: commit `id`'s diff, one resource per changed file, by `limit` and `offset`. */
function commitDiffs(req: Request, repo: Repository, base: string, id: string, slug: string) {
  const of = deltasOf(repo, id);
  if (of === undefined) return problem(404, "Not Found", `${id} is not a commit in ${slug}`);
  const self = `${base}/${COMMIT_SLUG}/${id}/diff`;
  // Only the page's files are diffed.
  return collectionPage(req, `${base}/${COMMIT_SLUG}/${id}`, self, "diff", (offset, limit) => ({
    page: of.deltas
      .slice(offset, offset + limit)
      .map((delta) => diffOf(repo, base, id, of.first, delta)),
    more: of.deltas.length > offset + limit,
  }));
}

/** `/commit/{id}/diff/{path}`: the diff of the one file `path` that commit `id` changed. */
function oneDiff(
  req: Request,
  repo: Repository,
  base: string,
  id: string,
  encoded: string,
  slug: string,
) {
  const of = deltasOf(repo, id);
  if (of === undefined) return problem(404, "Not Found", `${id} is not a commit in ${slug}`);
  const path = decodedPath(encoded);
  const delta = of.deltas.find((d) => (d.newFile().path() ?? d.oldFile().path()) === path);
  if (delta === undefined)
    return problem(404, "Not Found", `${id} does not change ${path} in ${slug}`);
  return halJson(req, diffOf(repo, base, id, of.first, delta));
}

/** `/commit/{id}/acts`: the acts that ran against commit `id`, oldest first, by `limit` and `offset`. */
async function commitActs(req: Request, scope: TenantScope, base: string, id: string) {
  const url = new URL(req.url);
  const limit = pageParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = pageParam(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const { acts, more } = await actsRanAgainst(scope, id, limit, offset);
  const origin = new URL(base).origin;
  const items = acts.map((event) => actItem(origin, scope, event));
  const self = `${base}/${COMMIT_SLUG}/${id}/acts`;
  return collectionPage(req, `${base}/${COMMIT_SLUG}/${id}`, self, "acts", () => ({
    page: items,
    more,
  }));
}

/**
 * `/history/{path}` or `/commit/{id}/history/{path}`: the commits that changed file `path`, from
 * HEAD or from commit `id`, newest first, by `limit` and `offset`.
 */
function fileHistory(
  req: Request,
  repo: Repository,
  base: string,
  slug: string,
  id: string | undefined,
  encoded: string,
): Response {
  let from: string;
  try {
    from = id ?? repo.revparseSingle("HEAD");
    repo.getCommit(from);
  } catch (err) {
    if (isNotFound(err)) return problem(404, "Not Found", `no commit ${id ?? "HEAD"} in ${slug}`);
    throw err;
  }
  const path = decodedPath(encoded);
  const self =
    id === undefined
      ? `${base}/history/${pathHref(path)}`
      : `${base}/${COMMIT_SLUG}/${id}/history/${pathHref(path)}`;
  const at =
    id === undefined ? `${base}/${FILE_SLUG}` : `${base}/${COMMIT_SLUG}/${id}/${FILE_SLUG}`;
  return collectionPage(req, `${at}/${pathHref(path)}`, self, COMMIT_SLUG, (offset, limit) => {
    const ids = changesTo(repo, from, path, offset + limit + 1);
    return {
      page: ids.slice(offset, offset + limit).map((c) => summaryOf(base, repo.getCommit(c))),
      more: ids.length > offset + limit,
    };
  });
}

/** A path in the tree as it goes in a URL: each segment encoded. */
function pathHref(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** What a tree entry is served as: a directory, a submodule, or a file. */
function typeOf(entry: TreeEntry): string {
  const kind = entry.type();
  return kind === "Tree" ? DIRECTORY_TYPE : kind === "Commit" ? SUBMODULE_TYPE : FILE_TYPE;
}

/**
 * Directory `path` of `tree`, by `limit` and `offset`: its directories, then its files, each in
 * BY_NAME order. `at` is the tree's address, `/file` or `/commit/{id}/file`; `up` is the parent
 * directory's, or the workspace's for the top.
 */
function directory(req: Request, tree: Tree, at: string, path: string, up: string): Response {
  const url = new URL(req.url);
  const limit = pageParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = pageParam(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const entries = [...tree.iter()].sort(
    (a, b) =>
      Number(b.type() === "Tree") - Number(a.type() === "Tree") ||
      BY_NAME.compare(a.name(), b.name()),
  );
  const page = entries.slice(offset, offset + limit);
  const self = path === "" ? at : `${at}/${pathHref(path)}`;
  const links = pagingLinks(up, self, limit, offset, entries.length > offset + limit);
  return halJson(req, {
    _links: {
      self: { href: `${self}?limit=${limit}&offset=${offset}` },
      ...Object.fromEntries(links.map((l) => [l.rel, { href: l.href }])),
    },
    path,
    offset,
    limit,
    count: page.length,
    total: entries.length,
    _embedded: {
      [FILE_SLUG]: page.map((entry) => {
        const child = path === "" ? entry.name() : `${path}/${entry.name()}`;
        const type = typeOf(entry);
        return {
          id: child,
          type,
          name: entry.name(),
          path: child,
          _links: { self: { href: `${at}/${pathHref(child)}`, type } },
        };
      }),
    },
  });
}

/**
 * File `path`, a blob at commit `commit`: its size and mode, and its text when it is UTF-8 text. A
 * binary file, by git's own test, has no content; text longer than FILE_LIMIT is cut and flagged.
 * A symbolic link's content is the path it points to, which is not followed.
 */
function file(
  req: Request,
  repo: Repository,
  entry: TreeEntry,
  at: string,
  path: string,
  commit: string,
  base: string,
): Response {
  const self = `${at}/${pathHref(path)}`;
  const mode = entry.filemode();
  const fields = {
    id: path,
    type: FILE_TYPE,
    name: entry.name(),
    path,
    commit,
    mode: mode === SYMLINK_MODE ? "symlink" : mode === EXECUTABLE_MODE ? "executable" : "file",
  };
  const parent = path.includes("/")
    ? `${at}/${pathHref(path.slice(0, path.lastIndexOf("/")))}`
    : at;
  // The commits that changed the file, newest first, from the commit it is read at.
  const changedBy = changesTo(repo, commit, path, DEFAULT_LIMIT).map((c) => ({
    ...summaryOf(base, repo.getCommit(c)),
    dir: "in",
  }));
  const history = at.endsWith(`/${COMMIT_SLUG}/${commit}/${FILE_SLUG}`)
    ? `${base}/${COMMIT_SLUG}/${commit}/history/${pathHref(path)}`
    : `${base}/history/${pathHref(path)}`;
  const links = {
    self: { href: self, type: FILE_TYPE },
    index: { href: parent },
    commit: { href: `${base}/${COMMIT_SLUG}/${commit}`, type: COMMIT_TYPE },
    history: { href: history },
    [REL.changedBy]: changedBy.map((c) => ({ ...c._links.self, dir: "in" })),
  };
  const embedded = { [REL.changedBy]: changedBy };
  const blob = entry.toObject(repo).peelToBlob();
  const size = Number(blob.size());
  if (blob.isBinary())
    return halJson(req, { ...fields, size, binary: true, _links: links, _embedded: embedded });
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(blob.content());
  } catch {
    return halJson(req, {
      ...fields,
      size,
      binary: false,
      utf8: false,
      _links: links,
      _embedded: embedded,
    });
  }
  const truncated = text.length > FILE_LIMIT;
  return halJson(req, {
    ...fields,
    size,
    binary: false,
    content: truncated ? text.slice(0, FILE_LIMIT) : text,
    content_truncated: truncated,
    _links: links,
    _embedded: embedded,
  });
}

/**
 * `/file/{path}` at HEAD or `/commit/{id}/file/{path}` at a commit: a directory as a collection
 * of its entries, a file as a resource. A path is looked up in the commit's tree only, never on
 * disk, so it cannot name anything git does not hold.
 */
function inTree(
  req: Request,
  repo: Repository,
  base: string,
  slug: string,
  id: string | undefined,
  encoded: string,
): Response {
  let commitId: string;
  try {
    commitId = id ?? repo.revparseSingle("HEAD");
  } catch (err) {
    if (isNotFound(err)) return problem(404, "Not Found", `${slug}'s repository has no commits`);
    throw err;
  }
  let tree: Tree;
  try {
    tree = repo.getCommit(commitId).tree();
  } catch (err) {
    if (isNotFound(err)) return problem(404, "Not Found", `${commitId} is not a commit in ${slug}`);
    throw err;
  }
  const at =
    id === undefined ? `${base}/${FILE_SLUG}` : `${base}/${COMMIT_SLUG}/${id}/${FILE_SLUG}`;
  const path = decodedPath(encoded);
  if (path === "") return directory(req, tree, at, "", base);
  const entry = tree.getPath(path);
  if (entry === null) return problem(404, "Not Found", `${path} is not in ${slug} at ${commitId}`);
  const type = typeOf(entry);
  const up = path.includes("/") ? `${at}/${pathHref(path.slice(0, path.lastIndexOf("/")))}` : at;
  if (type === DIRECTORY_TYPE) return directory(req, repo.getTree(entry.id()), at, path, up);
  if (type === SUBMODULE_TYPE)
    return halJson(req, {
      id: path,
      type,
      name: entry.name(),
      path,
      commit: entry.id(),
      _links: { self: { href: `${at}/${pathHref(path)}`, type }, index: { href: up } },
    });
  return file(req, repo, entry, at, path, commitId, base);
}

/**
 * The workspace's files, git history and branches, read from `repo`, the repository mapped to it,
 * at the paths `isGitPath` names, where `rest` is the path after `/workspace/{slug}`. Without a
 * repository, every such path is not found.
 */
export async function gitHandler(
  req: Request,
  scope: TenantScope,
  repo: Repository | undefined,
  rest: string,
): Promise<Response> {
  if (repo === undefined)
    return problem(404, "Not Found", `${scope.slug} has no git repository mapped to it`);
  const base = `${publicOrigin(req).origin}${scope.prefix}`;
  if (COMMITS.test(rest)) return history(req, repo, base);
  if (BRANCHES.test(rest)) return branches(req, repo, base);
  const branchName = ONE_BRANCH.exec(rest)?.[1];
  if (branchName !== undefined) return oneBranch(req, repo, base, branchName, scope.slug);
  if (TIMELINE.test(rest)) return timeline(req, repo, base);
  const id = ONE_COMMIT.exec(rest)?.[1];
  if (id !== undefined) return oneCommit(req, repo, scope, base, id);
  const changed = CHANGES.exec(rest)?.[1];
  if (changed !== undefined) return commitChanges(req, repo, base, changed, scope.slug);
  const actsOf = ACTS.exec(rest)?.[1];
  if (actsOf !== undefined) return commitActs(req, scope, base, actsOf);
  const diffs = DIFFS.exec(rest)?.[1];
  if (diffs !== undefined) return commitDiffs(req, repo, base, diffs, scope.slug);
  const diff = ONE_DIFF.exec(rest);
  if (diff !== null && diff[1] !== undefined)
    return oneDiff(req, repo, base, diff[1], diff[2] ?? "", scope.slug);
  const fileHistoryOf = HISTORY.exec(rest);
  if (fileHistoryOf !== null)
    return fileHistory(req, repo, base, scope.slug, fileHistoryOf[1], fileHistoryOf[2] ?? "");
  const tree = IN_TREE.exec(rest);
  if (tree !== null) return inTree(req, repo, base, scope.slug, tree[1], tree[2] ?? "");
  return problem(404, "Not Found", `${rest} names no commit or file in ${scope.slug}`);
}
