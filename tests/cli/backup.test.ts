/**
 * `labkit backup` — the refusals, and the file it writes.
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
 * The refusal only the Postgres arm can reach, and the reason #284 was worth more than a
 * `skipIf`.
 */
test.skipIf(!usingPostgres())("on a real Postgres, a backup refuses and names pg_dump", () => {
  const target = join(out, "record.tar.gz");
  const { code, stderr } = labkitAgainstTheServer("backup", "--path", target);

  expect(code).toBe(1);
  expect(existsSync(target)).toBe(false);
  expect(stderr).toContain("pg_dump");
});
