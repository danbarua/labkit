/**
 * `labkit backup` — the refusals, and the file it writes.
 *
 * **Driven as a process, not as a function**, because the property that broke
 * first was the exit code: `main()` returns 0 for any run that parsed, and
 * `process.exit(await main())` discards `process.exitCode`, so a refusal that
 * sets it exits 0 while printing a refusal. Calling the action directly would
 * have proved nothing about that — only a spawned process reports what a
 * caller actually sees.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { usingPostgres } from "../helpers/db";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "../../src/cli/cli.ts");

let record: string;
let out: string;

beforeEach(() => {
  record = mkdtempSync(join(tmpdir(), "labkit-backup-record."));
  out = mkdtempSync(join(tmpdir(), "labkit-backup-out."));
});
afterEach(() => {
  rmSync(record, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

/**
 * This process's environment with `LABKIT_DB_URL` removed.
 *
 * Every test here gives the CLI its own temporary directory with `--db`, and
 * `LABKIT_DB_URL` **wins over that** (`src/db/connect.ts`) — so under
 * `bun run test:pg` these children reached the shared container instead, where
 * `backup` correctly refuses for want of a data directory. The two tests below
 * were red on that arm from the day they were written (#284), and nothing
 * noticed: `test:pg` is not in the sweep, and its CI trigger fires on
 * `src/db/**` and `drizzle/**` only.
 *
 * Stripped rather than skipped on Postgres: the subject here is what the CLI
 * does with a `--db` record, which is the same question on either arm.
 * `tests/mcp-stdio.test.ts` does this, for this reason.
 */
function childEnv(): Record<string, string> {
  const { LABKIT_DB_URL: _dropped, ...rest } = process.env as Record<string, string>;
  return rest;
}

/** Runs the CLI as a process and reports what a shell would see. */
function labkit(...args: string[]): { code: number; stderr: string } {
  const run = Bun.spawnSync(["bun", CLI, "--db", record, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: childEnv(),
  });
  return { code: run.exitCode, stderr: run.stderr.toString() };
}

/** The same, with whatever `LABKIT_DB_URL` this run was given left in place. */
function labkitAgainstTheServer(...args: string[]): { code: number; stderr: string } {
  const run = Bun.spawnSync(["bun", CLI, "--db", record, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: run.exitCode, stderr: run.stderr.toString() };
}

test("a backup writes a tarball, and says where", () => {
  labkit("open", "does the schedule move convergence?");

  const target = join(out, "record.tar.gz");
  const { code, stderr } = labkit("backup", "--path", target);

  expect(code).toBe(0);
  expect(existsSync(target)).toBe(true);
  expect(stderr).toContain(target);
});

test("a .sql path is refused, non-zero, rather than answered with something that is not SQL", () => {
  labkit("open", "does the schedule move convergence?");

  const target = join(out, "record.sql");
  const { code, stderr } = labkit("backup", "--path", target);

  expect(code).toBe(1);
  expect(existsSync(target)).toBe(false);
  expect(stderr).toContain("not SQL");
});

test("an existing file is refused, non-zero — a backup names the moment it was taken", () => {
  labkit("open", "does the schedule move convergence?");

  const target = join(out, "record.tar.gz");
  expect(labkit("backup", "--path", target).code).toBe(0);

  const { code, stderr } = labkit("backup", "--path", target);
  expect(code).toBe(1);
  expect(stderr).toContain("already exists");
});

/**
 * The refusal only the Postgres arm can reach, and the reason #284 was worth
 * more than a `skipIf`.
 *
 * `backup` writes PGlite's data directory. Against a real server there is no
 * such directory and no `dumpDataDir`, so the verb refuses and names the tool
 * that does the job instead. That behaviour had no test at all — the arm that
 * could prove it was reaching it by accident and reading it as a failure.
 *
 * This makes `test:pg` **coverage** for one case rather than only a
 * disagreeing measurement, which CLAUDE.md says it is still waiting for:
 * "when a test does need two live connections it belongs in the Postgres arm,
 * and this becomes coverage — say so then".
 */
test.skipIf(!usingPostgres())("on a real Postgres, a backup refuses and names pg_dump", () => {
  const target = join(out, "record.tar.gz");
  const { code, stderr } = labkitAgainstTheServer("backup", "--path", target);

  expect(code).toBe(1);
  expect(existsSync(target)).toBe(false);
  expect(stderr).toContain("pg_dump");
});
