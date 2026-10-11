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
  COMMIT_SLUG,
  COMMIT_TYPE,
  DIRECTORY_TYPE,
  FILE_SLUG,
  FILE_TYPE,
  SUBMODULE_TYPE,
} from "./collection-paths";
import { DEFAULT_LIMIT, halJson, MAX_LIMIT, pageParam, pagingLinks } from "./collections-handler";
import { problem, publicOrigin } from "./graph-handler";
import type { TenantScope } from "./runtime";

/** The longest diff a commit is served with, in characters. A longer one is cut and flagged. */
export const DIFF_LIMIT = 100_000;
/** The most line edits a file's diff is computed with. A file needing more is served without its lines. */
const EDIT_LIMIT = 20_000;
/** The longest text a file is served with, in characters. A longer one is cut and flagged. */
export const FILE_LIMIT = 100_000;

const COMMITS = /^\/commit\/?$/;
const ONE_COMMIT = /^\/commit\/([0-9a-f]{40}|[0-9a-f]{64})$/;
// The tree at HEAD, `/file/{path}`, or at a commit, `/commit/{id}/file/{path}`.
const IN_TREE = /^(?:\/commit\/([0-9a-f]{40}|[0-9a-f]{64}))?\/file(?:\/(.*))?$/;

/** Whether `rest`, the path after `/workspace/{slug}`, names the workspace's files or history. */
export function isGitPath(rest: string): boolean {
  return /^\/(commit|file)(\/|$)/.test(rest);
}

/** How entries are ordered by name: case aside, and numbers by value, so `f2` comes before `f10`. */
const BY_NAME = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Git's mode for a symbolic link, whose blob holds the path it points to. */
const SYMLINK_MODE = 0o120000;
const EXECUTABLE_MODE = 0o100755;

/** Whether `err` is libgit2 reporting that what was asked for does not exist. */
function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.includes("code=NotFound");
}

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

/** A commit as an item of the history: its id, first line, author and time. */
function summaryOf(base: string, commit: Commit) {
  return {
    id: commit.id(),
    type: COMMIT_TYPE,
    name: commit.summary() ?? "",
    author: commit.author().name,
    at: commit.time().toISOString(),
    _links: { self: { href: `${base}/${COMMIT_SLUG}/${commit.id()}`, type: COMMIT_TYPE } },
  };
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

/**
 * `/commit/{id}`: one commit, with the files it changed and its diff from its first parent, as
 * `git show --first-parent` gives it. A root commit's diff adds every file.
 */
function oneCommit(req: Request, repo: Repository, base: string, id: string, slug: string) {
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
  // Files are diffed in order until the limit is passed; the rest are not read.
  let patch = "";
  for (const delta of deltas) {
    if (patch.length > DIFF_LIMIT) break;
    patch += patchOf(repo, delta);
  }
  const truncated = patch.length > DIFF_LIMIT;
  const summary = summaryOf(base, commit);
  const before = first === undefined ? undefined : `${base}/${COMMIT_SLUG}/${first}`;
  // Each changed file, at this commit, or for a deleted file at the first parent.
  const changed = changes.map((change) => {
    const at = change.status === "Deleted" ? before : `${base}/${COMMIT_SLUG}/${id}`;
    return {
      id: change.path,
      type: FILE_TYPE,
      name: change.path.split("/").pop(),
      path: change.path,
      status: change.status,
      _links: { self: { href: `${at}/${FILE_SLUG}/${pathHref(change.path)}`, type: FILE_TYPE } },
    };
  });
  return halJson(req, {
    ...summary,
    message: commit.message(),
    files_changed: Number(stats.filesChanged),
    insertions: Number(stats.insertions),
    deletions: Number(stats.deletions),
    changes,
    diff: truncated ? patch.slice(0, DIFF_LIMIT) : patch,
    diff_truncated: truncated,
    _links: {
      ...summary._links,
      index: { href: `${base}/${COMMIT_SLUG}` },
      parent: parents.map((p) => ({ href: `${base}/${COMMIT_SLUG}/${p}`, type: COMMIT_TYPE })),
      tree: { href: `${base}/${COMMIT_SLUG}/${id}/${FILE_SLUG}` },
      changed: changed.map((file) => ({ ...file._links.self, title: file.status })),
    },
    _embedded: { changed },
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
  const links = {
    self: { href: self, type: FILE_TYPE },
    index: { href: parent },
    commit: { href: `${base}/${COMMIT_SLUG}/${commit}`, type: COMMIT_TYPE },
  };
  const blob = entry.toObject(repo).peelToBlob();
  const size = Number(blob.size());
  if (blob.isBinary()) return halJson(req, { ...fields, size, binary: true, _links: links });
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(blob.content());
  } catch {
    return halJson(req, { ...fields, size, binary: false, utf8: false, _links: links });
  }
  const truncated = text.length > FILE_LIMIT;
  return halJson(req, {
    ...fields,
    size,
    binary: false,
    content: truncated ? text.slice(0, FILE_LIMIT) : text,
    content_truncated: truncated,
    _links: links,
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
  const path = encoded
    .split("/")
    .filter((s) => s !== "")
    .map(decodeURIComponent)
    .join("/");
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
 * The workspace's files and git history, read from `repo`, the repository mapped to it:
 * `/commit`, `/commit/{id}`, `/file/{path}` and `/commit/{id}/file/{path}`, where `rest` is the
 * path after `/workspace/{slug}`. Without a repository, every such path is not found.
 */
export function gitHandler(
  req: Request,
  scope: TenantScope,
  repo: Repository | undefined,
  rest: string,
): Response {
  if (repo === undefined)
    return problem(404, "Not Found", `${scope.slug} has no git repository mapped to it`);
  const base = `${publicOrigin(req).origin}${scope.prefix}`;
  if (COMMITS.test(rest)) return history(req, repo, base);
  const id = ONE_COMMIT.exec(rest)?.[1];
  if (id !== undefined) return oneCommit(req, repo, base, id, scope.slug);
  const tree = IN_TREE.exec(rest);
  if (tree !== null) return inTree(req, repo, base, scope.slug, tree[1], tree[2] ?? "");
  return problem(404, "Not Found", `${rest} names no commit or file in ${scope.slug}`);
}
