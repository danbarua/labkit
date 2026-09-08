import { traced } from "./trace";
import { dirname, join, sep } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { directPostgresBackend, pgliteBackend, type LabKitDBConnection } from "./backend";

export type { LabKitDBConnection };

/**
 * Where the embedded database lives, when the caller does not say.
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
  return gitProjectRoot(cwd) ?? dotGitProjectRoot(cwd) ?? discoverProjectRoot(cwd);
}

/**
 * The repository's own directory, which is **not** the working tree's.
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
  // A bare repository has no working tree and therefore no project root to speak of; its
  // `--git-common-dir` is the repository itself, whose parent is wherever it happens to be
  // filed. Refuse rather than guess.
  return existsSync(join(root, ".git")) ? root : undefined;
}

/**
 * The same answer as {@link gitProjectRoot}, read off the filesystem, for when there is no git
 * to ask.
 */
export function dotGitProjectRoot(from: string): string | undefined {
  let dir = from;
  for (;;) {
    const dotGit = join(dir, ".git");
    if (existsSync(dotGit)) {
      if (statSync(dotGit).isDirectory()) return dir;
      const named = readFileSync(dotGit, "utf8").trim();
      const prefix = "gitdir:";
      if (named.startsWith(prefix)) {
        const gitDir = named.slice(prefix.length).trim();
        // `…/.git/worktrees/<name>` -> `…/.git` -> `…`. Anything else is a
        // layout this cannot read a working tree out of; see above.
        const marker = `${sep}.git${sep}worktrees${sep}`;
        const at = gitDir.lastIndexOf(marker);
        if (at !== -1) return gitDir.slice(0, at);
      }
      return undefined;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Walks up from `from` for a directory already containing `.labkit/`.
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
 * Picks a `DbBackend` (src/db/backend.ts) and connects through it. `LABKIT_DB_URL` set →
 * connect directly to that Postgres, which is its own arbiter.
 */
export async function connectDb(projectRoot?: string): Promise<LabKitDBConnection> {
  const url = process.env.LABKIT_DB_URL;
  if (url) {
    return withTrace(await directPostgresBackend({ connectionString: url }).connect(), "postgres");
  }

  const labkitDir = join(projectRoot ?? resolveProjectRoot(), ".labkit");
  announceNewRecord(labkitDir);
  const connection = await pgliteBackend({
    dataDir: join(labkitDir, "pglite"),
    lockPath: join(labkitDir, "pglite.lock"),
  }).connect();
  return withTrace(connection, "pglite");
}

/**
 * Opens a throwaway database in `dir`, and never anything else.
 */
export async function connectScratch(dir: string): Promise<LabKitDBConnection> {
  const connection = await pgliteBackend({
    dataDir: join(dir, "pglite"),
    lockPath: join(dir, "pglite.lock"),
  }).connect();
  return withTrace(connection, "pglite");
}

/**
 * Threads the connection through `traced()` while keeping whatever else the backend hung off it
 * (`close`, and anything a backend adds later).
 */
function withTrace(connection: LabKitDBConnection, label: string): LabKitDBConnection {
  const db = traced(connection.db, label);
  return db === connection.db ? connection : { ...connection, db };
}

/**
 * Says so, once, when a command is about to bring a new record into existence.
 */
function announceNewRecord(labkitDir: string): void {
  if (existsSync(labkitDir)) return;
  process.stderr.write(`labkit: creating a new record at ${labkitDir}\n`);
}
