import { traced } from "./trace";
import { dirname, join, sep } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
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
  return gitProjectRoot(cwd) ?? dotGitProjectRoot(cwd) ?? discoverProjectRoot(cwd);
}

/**
 * The repository's own directory, which is **not** the working tree's.
 *
 * `git rev-parse --git-common-dir` names the one `.git` a repository has,
 * whichever worktree you ask from — its parent is the project root. That is the
 * whole fix, and it holds **wherever the worktree sits**, which is the part to
 * get right: `git worktree add` takes any path.
 *
 * This repository's worktrees are **siblings** — `…/labkit.worktrees/feat-mcp-server`
 * beside `…/labkit` — so walking up from one never passes through the checkout,
 * the walk finds nothing, and the first command run in a fresh worktree
 * *creates* a database instead of finding the project's.
 *
 * **Claude Code puts them at `<repo>/.claude/worktrees/<name>`, inside the
 * repository**, and there the walk *does* find the parent's `.labkit/` — the
 * same answer this function gives, so the two agree rather than the fallback
 * being wrong. Measured 2026-08-28 in both layouts.
 *
 * So the property that decides anything is not nested-versus-adjacent, it is
 * **whether a repository sits above you**. Here that only decides whether the
 * walk has something to find, because one record per repository makes the
 * parent the right answer either way; in a project whose rule is one record per
 * *worktree* the same observation would be a defect. Reported from
 * `exo-ledger`, which had it backwards in the other direction — "nested is
 * dangerous" is false for both of us, for opposite reasons.
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
  //
  // This also rejects `git init --separate-git-dir`, where `.git` is a file
  // pointing outside the tree — considered and declined for the same reason,
  // not missed. Both fall through to the steps below, which is the safe
  // direction.
  return existsSync(join(root, ".git")) ? root : undefined;
}

/**
 * The same answer as {@link gitProjectRoot}, read off the filesystem, for when
 * there is no git to ask.
 *
 * **The walk below cannot solve the bug it is the fallback for.** With git
 * absent — a compiled binary on a host without it, which is exactly what
 * `bun run build` ships — a worktree that is a *sibling* of its checkout walks
 * up, never passes through the repository, and creates a database. That is the
 * original defect, untouched, in the one environment where the subprocess is
 * unavailable. Found in review by Dan from `exo-ledger`, which hit the same
 * question from the other side.
 *
 * A linked worktree's `.git` is a **file**, not a directory:
 *
 * ```
 * gitdir: /Users/dan/Code/science/labkit/.git/worktrees/feat-mcp-server
 * ```
 *
 * Strip `/worktrees/<name>` and take the parent of `.git`, and that is the
 * project root — byte-identical to what `--git-common-dir` returns, verified
 * against this repository and against exo's differently-shaped one. In an
 * ordinary checkout `.git` is a directory and the answer is simply the
 * directory holding it.
 *
 * **`--separate-git-dir` is deliberately not handled**, and falls through to
 * the walk. Its `.git` file names a directory with no `worktrees/` component
 * and no reliable path back to a working tree, so deriving a root from it would
 * be guessing. Considered and declined, rather than missed.
 *
 * This walks for `.git` rather than assuming `from` is the top, so it is
 * correct from any depth — the same property the subprocess has.
 *
 * **Exported for its own tests, and that is a concession worth naming.** Under
 * bun **1.3.14** `spawnSync` found `git` with `PATH` empty, unset, or pointing
 * at an empty directory — measured, all three — so there was no way to reach
 * this from {@link resolveProjectRoot} in-process by making the subprocess
 * fail. The composition is one `??`; the logic is here, and here is where it is
 * tested.
 *
 * **On bun 1.4.0 the third case fails.** Re-measured 2026-08-28: `PATH`
 * pointing at an empty directory gives `ENOENT`, while empty and unset still
 * find `git`. So the fallback *is* now reachable in-process, and the export may
 * no longer be earned — check before removing it rather than assuming, since
 * the first version of these tests was passing through the subprocess while
 * claiming to test the filesystem and only its own control caught that.
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
 * `projectRoot` falls back to {@link resolveProjectRoot}, so `LABKIT_HOME` is
 * read here and not by every caller. **`LABKIT_DB_URL` wins over both, and is
 * checked first** — a caller pointed at a real Postgres is not asking for a
 * file, and silently building one beside it would be worse than ignoring the
 * flag.
 *
 * **The order is load-bearing and was wrong until 2026-08-28.** This was a
 * default parameter — `connectDb(projectRoot = resolveProjectRoot())` — which
 * JavaScript evaluates on entry, *before* the body reads the environment. So
 * the sentence above was true of the outcome and false of the sequence: the
 * URL path still resolved a root it then discarded. Two costs, both on the
 * hosted path this repo is heading for. `resolveProjectRoot` shells out to
 * `git rev-parse`, and `src/mcp/server.ts` calls `connectDb()` **per tool
 * call** — so a server backed by Postgres spawned a subprocess per call for an
 * answer nobody read. Worse, a `LABKIT_HOME` naming a directory that does not
 * exist *throws*, deliberately, so a stray value in a container's environment
 * killed a server that was never going to open a file. Measured before the
 * fix: `LABKIT_DB_URL` set and `LABKIT_HOME` missing raised
 * `LABKIT_HOME names a directory that does not exist` without reaching the
 * connection string.
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

/**
 * Says so, once, when a command is about to bring a new record into existence.
 *
 * **Creating a database is silent, and that is how three of them accumulated.**
 * Any stray `bun run dev` in a directory without one produces an empty 42MB
 * database and then answers every question with "nothing" — which is
 * indistinguishable from a project nobody has worked on yet. All three
 * `.labkit/` directories found on 2026-08-27 were made that way; not one came
 * from a script, because every script pins `--db` into a temporary directory
 * and `bun run check` and `bun run example` were both measured leaving none.
 *
 * So the remaining way to make one by accident is a person or an agent typing a
 * command in the wrong place, and the remedy is not a guard — creating a record
 * is what the first command in a new project is *supposed* to do. It is to stop
 * doing it quietly.
 *
 * **stderr, never stdout.** The whole of a write command's stdout is an id the
 * next command consumes, and `$(labkit criterion 'x')` must not capture this.
 * Same reason a handle-only answer is never coloured.
 *
 * Not a warning and not prefixed as one: on the first run of a real project
 * this is the correct and expected thing to happen, and crying wolf there would
 * teach a reader to ignore the line in the case that matters.
 */
function announceNewRecord(labkitDir: string): void {
  if (existsSync(labkitDir)) return;
  process.stderr.write(`labkit: creating a new record at ${labkitDir}\n`);
}
