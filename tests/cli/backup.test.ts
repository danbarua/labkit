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

/** Runs the CLI as a process and reports what a shell would see. */
function labkit(...args: string[]): { code: number; stderr: string } {
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
