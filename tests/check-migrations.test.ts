/**
 * `check:migrations` refuses destructive DDL, an un-annotated `ALTER TABLE`,
 * and a run that examined no migrations at all.
 *
 * It drives the real script as a subprocess against a temporary `drizzle/`,
 * because the exit code is half of what a check promises and importing the
 * module would run it against this repo's own migrations instead. The last
 * case is the one that has no other watcher: `readMigrations` filters by
 * `.sql`, so an empty folder reaches the loop with nothing in it, and every
 * assertion inside a `for` over an empty list passes.
 */

import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "scripts", "check-migrations.ts");

/** Runs the check over a throwaway `drizzle/` holding `sql`, or nothing. */
function runOver(sql?: string): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "labkit-migrations-"));
  try {
    mkdirSync(join(dir, "drizzle"));
    if (sql !== undefined) writeFileSync(join(dir, "drizzle", "0001_probe.sql"), sql);
    const proc = Bun.spawnSync(["bun", SCRIPT], { cwd: dir });
    return {
      code: proc.exitCode,
      out: `${proc.stdout.toString()}${proc.stderr.toString()}`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("check:migrations refuses a migration that drops a table or a column", () => {
  const dropped = runOver('DROP TABLE "x";');
  expect(dropped.code).toBe(1);
  expect(dropped.out).toContain("destructive DDL");

  const column = runOver('ALTER TABLE "x" DROP COLUMN "y"; -- lock-strategy: online');
  expect(column.code).toBe(1);
  expect(column.out).toContain("destructive DDL");

  // The escape hatch the refusal names, so the refusal is about the missing
  // justification rather than about the words `DROP TABLE`.
  expect(runOver('DROP TABLE "x"; -- allow-destructive').code).toBe(0);
});

test("check:migrations refuses an ALTER TABLE with no lock strategy, and exempts enabling RLS", () => {
  const bare = runOver('ALTER TABLE "x" ADD COLUMN "y" int;');
  expect(bare.code).toBe(1);
  expect(bare.out).toContain("lock-strategy");

  expect(runOver('ALTER TABLE "x" ADD COLUMN "y" int; -- lock-strategy: online').code).toBe(0);
  // What `drizzle-kit generate` emits, which no generator can annotate.
  expect(runOver('ALTER TABLE "x" ENABLE ROW LEVEL SECURITY;').code).toBe(0);
});

test("check:migrations refuses a run that examined no migrations", () => {
  // The vacuous pass: before this refusal the script printed the same OK line
  // over an empty folder as over a clean one, so a drizzle/ that moved would
  // have reported success forever.
  const nothing = runOver();
  expect(nothing.code).toBe(1);
  expect(nothing.out).toContain("nothing was checked");
});

test("the OK line says how many migrations it read", () => {
  // A count is what tells a reader the run was over a real population --
  // the reason the case above can be caught by eye as well as by exit code.
  const one = runOver('ALTER TABLE "x" ADD COLUMN "y" int; -- lock-strategy: online');
  expect(one.code).toBe(0);
  expect(one.out).toContain("OK: 1 migrations");
});
