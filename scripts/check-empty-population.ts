#!/usr/bin/env bun
/**
 * Every check fails when there is nothing to check.
 *
 * A check that examined no files reports the same `OK:` as one that examined
 * every file and found them all good. The two are indistinguishable from the
 * outside, and the second is the only one anybody wants — so a check whose
 * population went to zero is a check that has stopped working while still
 * printing success.
 *
 * **This is not hypothetical and the count is the point.** Run against an
 * empty tree on 2026-09-03, six of ten scanning checks passed: `doc-comments`,
 * `orm-unwrapped`, `facts`, `tests-assert`, `test-ceiling` and `test-teardown`.
 * Two of them printed the zero on the way past — *"0 fact module(s)"*, *"all 0
 * scenario files reset the database"* — so the number was in the operator's
 * face and the exit code ignored it.
 *
 * It runs each check in a scaffold holding empty `src/`, `tests/`, `scripts/`,
 * `drizzle/` and `fragments/` directories, and requires a non-zero exit. A
 * crash counts as a pass here: an unhandled throw is loud, which is the
 * property being asked for. What is refused is a clean `OK:` over nothing.
 *
 * The scaffold symlinks `node_modules` rather than copying it, so this costs
 * a few seconds rather than a minute.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json";

/**
 * The checks this can run: the ones that scan a population of files.
 *
 * Excluded, each for a reason rather than by taste — an exclusion list is a
 * tell, so these say what makes them a different kind of thing:
 *
 * - `format`, `lint` — biome's own, not this repo's scripts.
 * - `no-tracked-symlinks`, `stdout` — shell, and both ask git or grep a
 *   question about the repo rather than folding over a population.
 * - `binary`, `cli`, `compositions` — they build or run LabKit end to end.
 *   Minutes, not seconds, and their population is one record they create.
 * - `all-checks` — its population is the check scripts themselves, which the
 *   scaffold does not have; it is the one check whose empty case is this file.
 * - `empty-population` — this one. Running it inside itself proves nothing.
 */
const NOT_SCANNED = new Set([
  "check:format",
  "check:lint",
  "check:no-tracked-symlinks",
  "check:stdout",
  "check:binary",
  "check:cli",
  "check:compositions",
  "check:all-checks",
  "check:empty-population",
]);

const REPO = join(import.meta.dir, "..");

/** Each `check:*` script that folds over files, as its script path. */
const scanning = Object.entries(pkg.scripts as Record<string, string>)
  .filter(([name]) => name.startsWith("check:") && !NOT_SCANNED.has(name))
  .map(([name, command]) => ({ name, script: command.replace(/^bun\s+/, "") }));

/** An empty tree with the directories a check might scan, and real dependencies. */
function emptyWorld(): string {
  const dir = mkdtempSync(join(tmpdir(), "labkit-empty-world."));
  for (const d of ["src", "tests", "scripts", "drizzle", "fragments"])
    mkdirSync(join(dir, d), { recursive: true });
  for (const f of ["package.json", "tsconfig.json"]) copyFileSync(join(REPO, f), join(dir, f));
  symlinkSync(join(REPO, "node_modules"), join(dir, "node_modules"));
  return dir;
}

const world = emptyWorld();
const passedOverNothing: { name: string; said: string }[] = [];

try {
  for (const { name, script } of scanning) {
    const run = Bun.spawnSync(["bun", join(REPO, script)], {
      cwd: world,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (run.exitCode === 0) {
      const said = (run.stdout.toString() + run.stderr.toString()).trim().split("\n").pop() ?? "";
      passedOverNothing.push({ name, said });
    }
  }
} finally {
  rmSync(world, { recursive: true, force: true });
}

if (scanning.length === 0) {
  console.error(
    "FAILED: found no scanning checks in package.json — this check examined nothing, " +
      "which is the very thing it exists to refuse.",
  );
  process.exit(1);
}

if (passedOverNothing.length > 0) {
  console.error("FAILED: a check reported success having examined nothing\n");
  for (const { name, said } of passedOverNothing) console.error(`   ${name}\n      said: ${said}`);
  console.error(
    "\n   Assert the population before reporting on it: count what was examined and\n" +
      "   fail when the count is zero, naming the number. A check that cannot tell\n" +
      "   an empty tree from a clean one is not checking anything.",
  );
  process.exit(1);
}

console.log(
  `OK: all ${scanning.length} scanning checks fail on an empty tree rather than reporting success.`,
);
