import { createTwoFilesPatch } from "diff";
import { type Blob, type Commit, type DiffDelta, type Repository, RevwalkSort } from "es-git";
import { COMMIT_SLUG, COMMIT_TYPE } from "./collection-paths";
import { DEFAULT_LIMIT, halJson, MAX_LIMIT, pageParam, pagingLinks } from "./collections-handler";
import { problem, publicOrigin } from "./graph-handler";
import type { TenantScope } from "./runtime";

/** The longest diff a commit is served with, in characters. A longer one is cut and flagged. */
export const DIFF_LIMIT = 100_000;
/** The most line edits a file's diff is computed with. A file needing more is served without its lines. */
const EDIT_LIMIT = 20_000;

const COMMITS = /^\/commit\/?$/;
const ONE_COMMIT = /^\/commit\/([0-9a-f]{40}|[0-9a-f]{64})$/;

/** Whether `rest`, the path after `/workspace/{slug}`, names the workspace's git history. */
export function isGitPath(rest: string): boolean {
  return /^\/commit(\/|$)/.test(rest);
}

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
    },
  });
}

/**
 * The workspace's git history, read from `repo`, the repository mapped to it: `/commit` and
 * `/commit/{id}`, where `rest` is the path after `/workspace/{slug}`. Without a repository, every
 * such path is not found.
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
  return problem(404, "Not Found", `${rest} names no commit in ${scope.slug}`);
}
