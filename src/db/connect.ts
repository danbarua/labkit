import { traced } from "./trace";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { directPostgresBackend, pgliteBackend, type LabKitDBConnection } from "./backend";

export type { LabKitDBConnection };

/**
 * Where the embedded database lives, when the caller does not say.
 *
 * `LABKIT_HOME` names the directory that holds `.labkit/`, not the `.labkit`
 * directory itself — so it is the *project root* by another route, and one
 * value means the same thing whether it arrives as an argument, an environment
 * variable or `--db`.
 *
 * It exists so a script can be hermetic. A temporary directory gets its own
 * database file *and* its own lock, so a run against one cannot contend with a
 * developer's working database -- the two share nothing. That is what
 * `examples/full-lifecycle.sh` and `scripts/smoke-cli.sh` use.
 *
 * An explicit argument still wins: `connectDb(dir)` means that directory,
 * because a caller that named one has already made the decision this is here
 * to guess at.
 *
 * ## Two rules, and they point in opposite directions on purpose
 *
 * **`LABKIT_HOME` must exist.** It used to be enough that it *could* — the lock
 * directory was created with `{ recursive: true }`, so a typo built the whole
 * path and yielded a fresh empty database. An empty record and a mistyped one
 * are indistinguishable to a reader, and "this project has no history" is a
 * confident wrong answer rather than an error. Naming a directory is a claim
 * that it is there; it is not a request to create one.
 *
 * **With `LABKIT_HOME` unset, an existing record above the working directory is
 * found.** A client launched from `packages/foo` of a project whose `.labkit/`
 * sits at the root would otherwise report an empty record for a project full of
 * work — the case that survives shipping one binary, because an MCP client's
 * working directory is chosen by the editor and not by the user.
 *
 * The walk **only ever finds, never decides where to create**. With no
 * `.labkit/` anywhere above, the answer is the working directory, exactly as
 * before. That asymmetry is what keeps this from reintroducing the implicitness
 * three review rounds removed: discovering something already there is not the
 * same as guessing where a new one belongs.
 */
export function resolveProjectRoot(
  cwd: string = process.cwd(),
  named: string | undefined = process.env.LABKIT_HOME,
): string {
  if (named !== undefined) {
    if (!existsSync(named)) {
      throw new Error(
        `LABKIT_HOME names a directory that does not exist: ${named}\n` +
          `  It must be the project root — the directory that holds .labkit/ — and it is ` +
          `not created for you, because a typo would look exactly like a new project.`,
      );
    }
    return named;
  }
  return gitProjectRoot(cwd) ?? discoverProjectRoot(cwd);
}

/**
 * The repository's own directory, which is **not** the working tree's.
 *
 * `git rev-parse --git-common-dir` names the one `.git` a repository has,
 * whichever worktree you ask from — its parent is the project root. That is the
 * whole fix: a worktree is a **sibling** of the main checkout, not a
 * descendant, so no amount of walking up from
 * `…/labkit.worktrees/feat-mcp-server` ever passes through `…/labkit`. The walk
 * finds nothing, and the first command run in a fresh worktree therefore
 * *creates* a database instead of finding the project's.
 *
 * That is not hypothetical. Measured 2026-08-27, three `.labkit/` directories
 * existed on this machine for one project — 41M, 60M and 41M, last written on
 * three different days — and nobody decided that. Every session in this project
 * runs in a worktree, so it is the normal case rather than an edge one.
 *
 * **A branch is not a project.** The record — questions, claims, gates, what is
 * unresolved — belongs to the programme. A record per worktree means
 * `labkit known` silently answers about whichever branch you happen to be
 * standing in. It is the README wiring defect arriving from the opposite
 * direction: there, every project shared one record; here, one project
 * fragments into several.
 *
 * `--show-toplevel` names the *worktree* and would reintroduce the bug. This is
 * the same distinction `.claude/skills/wrap/wrap-hook.sh` drew when it stopped
 * resolving from `$CLAUDE_PROJECT_DIR`, one level further out.
 *
 * Returns `undefined` outside a repository — `git rev-parse` fails, and
 * LabKit does not require git — so {@link discoverProjectRoot} stays as the
 * fallback rather than being replaced. In an ordinary checkout the two agree,
 * so there is no special case beside a normal one.
 *
 * It also **subsumes the `packages/foo` case** at no extra cost: it is correct
 * from any depth, with no walk at all.
 */
function gitProjectRoot(cwd: string): string | undefined {
  if (!existsSync(cwd)) return undefined;
  // `--path-format=absolute` because the bare form returns a *relative* path
  // when you are already at the top of a normal checkout — it prints `.git`,
  // whose dirname is `.`, which would resolve every project to the process's
  // working directory. Requires git 2.31+; older git fails the flag and this
  // returns undefined, which is the correct behaviour rather than a wrong root.
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
    // Never let git's own stderr reach a caller's terminal: "not a git
    // repository" is an ordinary outcome here, not a failure to report.
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (r.status !== 0 || typeof r.stdout !== "string") return undefined;
  const gitDir = r.stdout.trim();
  if (gitDir === "") return undefined;
  const root = dirname(gitDir);
  // A bare repository has no working tree and therefore no project root to
  // speak of; its `--git-common-dir` is the repository itself, whose parent is
  // wherever it happens to be filed. Refuse rather than guess.
  return existsSync(join(root, ".git")) ? root : undefined;
}

/**
 * Walks up from `from` for a directory already containing `.labkit/`.
 *
 * Returns `from` unchanged when there is none, which is the create-here case.
 * `dirname` of the filesystem root is the root itself, and that is what ends
 * the loop — no depth limit is needed and none is guessed at.
 */
function discoverProjectRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, ".labkit"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return from;
    dir = parent;
  }
}

/**
 * Picks a `DbBackend` (src/db/backend.ts) and connects through it.
 * `LABKIT_DB_URL` set → connect directly to that Postgres, which is its own
 * arbiter. Otherwise → the default: an embedded, per-project PGlite file at
 * `<projectRoot>/.labkit/pglite`, held under an exclusive lock for the
 * duration of the work, since PGlite is single-writer/single-process.
 *
 * `projectRoot` defaults to {@link resolveProjectRoot}, so `LABKIT_HOME` is read here
 * and not by every caller. **`LABKIT_DB_URL` still wins over both** — a caller
 * pointed at a real Postgres is not asking for a file, and silently building
 * one beside it would be worse than ignoring the flag.
 */
export async function connectDb(projectRoot = resolveProjectRoot()): Promise<LabKitDBConnection> {
  const url = process.env.LABKIT_DB_URL;
  if (url) {
    return withTrace(await directPostgresBackend({ connectionString: url }).connect(), "postgres");
  }

  const labkitDir = join(projectRoot, ".labkit");
  const connection = await pgliteBackend({
    dataDir: join(labkitDir, "pglite"),
    lockPath: join(labkitDir, "pglite.lock"),
  }).connect();
  return withTrace(connection, "pglite");
}

/**
 * Threads the connection through `traced()` while keeping whatever else the
 * backend hung off it (`close`, and anything a backend adds later).
 *
 * A no-op unless `LABKIT_TRACE` is set — `traced()` returns the same object it
 * was given, so the spread below copies a connection that was never wrapped.
 */
function withTrace(connection: LabKitDBConnection, label: string): LabKitDBConnection {
  const db = traced(connection.db, label);
  return db === connection.db ? connection : { ...connection, db };
}
