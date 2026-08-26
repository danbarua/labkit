#!/usr/bin/env bun
/**
 * Everything that has to be green before a commit, in one command.
 *
 * There was no shortcut: `bun run` does not glob, so `bun run check:*` was ten
 * invocations typed by hand or, more often, the three or four somebody
 * remembered. CLAUDE.md's own instruction — *"run `bun test`, `bun run
 * typecheck` and `bunx depcruise`; add `check:migrations` if you touched
 * `drizzle/`, `check:tests-assert` if you touched tests, …"* — is a list of
 * conditionals held in a person's head, which is the shape that gets skipped.
 *
 * **The gates are in here too, not just the `check:*` scripts.** A `bun run
 * check` that ran the linters and not `bun test` would be a green light meaning
 * less than it looks like — the exact shape this repo keeps finding (see
 * CLAUDE.md on the `full-lifecycle` exit code). If it is called `check`, it
 * checks everything.
 *
 * **The list is derived from `package.json`**, so a `check:*` added later is
 * picked up without anyone editing this file, and there is **no exclusion
 * list**. There was one, for a single entry, and the exclusion was the tell:
 * `check:pglite-concurrency` had inverted exit codes — 0 meant an upstream bug
 * still reproduced — so it could not be in a green-means-fine sweep. The name
 * was the defect, not the script. It is `probe:pglite-concurrency` now, the
 * glob does not reach it, and a paragraph of explanation went with it.
 *
 * The rule that falls out: **`check:` means green is fine and red is yours to
 * fix.** Anything else needs a different prefix.
 *
 * Everything runs even after a failure. Stopping at the first one tells you
 * about one problem when you have three, and the whole point of a sweep is the
 * summary.
 *
 * Usage: bun run check
 * Exit:  0 when everything passed, 1 otherwise.
 */

import { readFileSync } from "node:fs";
import { summaryOf } from "./check-all-checks";

/**
 * A thing to run: a label, the argv, and the sentence printed before it runs.
 *
 * **The sentence comes from the script itself**, via `summaryOf` — not from a
 * table here, which would be a second copy of a fact that drifts. The audience
 * is someone who changed code, ran this, and is looking at a failure from a
 * script they have never opened: `check:prop-classes` tells them nothing,
 * *"Holds `INDEXED_PROPS` to the string taxonomy it is supposed to mirror"*
 * tells them where to look.
 *
 * It is a function and not a fixed line number because the line differs by
 * language — 3 for TypeScript, where line 2 is the `/**` opener, and 2 for
 * shell, which has no opener to spend a line on. `check:all-checks` is what
 * guarantees there is always a sentence there to find.
 */
interface Step {
  readonly name: string;
  readonly argv: string[];
  readonly says: string;
}

const scripts: Record<string, string> = JSON.parse(readFileSync("package.json", "utf8")).scripts;

/** The script file a `check:*` command runs, for `summaryOf` to read. */
const fileFor = (name: string): string | undefined =>
  scripts[name]?.split(/\s+/).find((token) => token.startsWith("scripts/"));

const steps: Step[] = [
  // The three CLAUDE.md names as the pre-commit bar, first, because they are
  // the ones that fail for real reasons rather than for tidiness. Their
  // sentences are written here because they are not scripts in this repo and
  // have no header to read.
  { name: "test", argv: ["bun", "test"], says: "Every test in the suite." },
  {
    name: "typecheck",
    argv: ["bun", "run", "typecheck"],
    says: "The types agree.",
  },
  {
    name: "depcruise",
    argv: ["bunx", "depcruise", "src", "tests", "--output-type", "err"],
    says: "The layering rules hold, and nothing imports in a circle.",
  },
  ...Object.keys(scripts)
    .filter((name) => name.startsWith("check:"))
    .sort()
    .map((name) => {
      const file = fileFor(name);
      return {
        name,
        argv: ["bun", "run", name],
        // `check:all-checks` is what stops this falling back. If it is passing,
        // every check script has a summary and this reads it.
        says: (file && summaryOf(file)) ?? "(no summary — see check:all-checks)",
      };
    }),
];

const results: Array<{ name: string; ok: boolean; ms: number }> = [];

for (const step of steps) {
  console.log(`\n▸ ${step.name} — ${step.says}`);
  const started = performance.now();
  // Output goes straight through. A sweep that swallowed a failing test's
  // diagnosis and reported "test: FAIL" would cost the thing you actually
  // needed — the same loss CLAUDE.md records for `bun test | tail`.
  const proc = Bun.spawnSync(step.argv, {
    stdout: "inherit",
    stderr: "inherit",
  });
  results.push({
    name: step.name,
    ok: proc.exitCode === 0,
    ms: performance.now() - started,
  });
}

const failed = results.filter((r) => !r.ok);
const width = Math.max(...results.map((r) => r.name.length));

console.log(`\n${"─".repeat(width + 16)}`);
for (const { name, ok, ms } of results) {
  console.log(`${ok ? "✅" : "❌"} ${name.padEnd(width)}  ${(ms / 1000).toFixed(1)}s`);
}
console.log("─".repeat(width + 16));

if (failed.length > 0) {
  console.log(
    `\n${failed.length} of ${results.length} failed: ${failed.map((f) => f.name).join(", ")}`,
  );
  process.exit(1);
}
console.log(`\nall ${results.length} passed.`);
