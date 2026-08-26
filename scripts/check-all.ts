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

const results: Array<{ name: string; ok: boolean; ms: number; lines: string[] }> = [];

/**
 * Copies a stream to the terminal as it arrives **and** keeps it.
 *
 * The rule this must not break: output goes straight through. A sweep that
 * swallowed a failing test's diagnosis and reported "test: FAIL" would cost the
 * thing you actually needed — the same loss CLAUDE.md records for
 * `bun test | tail`. Buffering as well as writing is what lets the summary name
 * the failure without taking the detail away; `stdout: "inherit"` could do the
 * first half only.
 */
async function tee(
  stream: ReadableStream<Uint8Array>,
  out: NodeJS.WriteStream,
  keep: string[],
): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    const text = decoder.decode(chunk, { stream: true });
    out.write(text);
    keep.push(text);
  }
}

for (const step of steps) {
  console.log(`\n▸ ${step.name} — ${step.says}`);
  const started = performance.now();
  const proc = Bun.spawn(step.argv, { stdout: "pipe", stderr: "pipe" });
  const kept: string[] = [];
  await Promise.all([
    tee(proc.stdout, process.stdout, kept),
    tee(proc.stderr, process.stderr, kept),
  ]);
  const exitCode = await proc.exited;
  results.push({
    name: step.name,
    ok: exitCode === 0,
    ms: performance.now() - started,
    lines: kept.join("").split("\n"),
  });
}

/**
 * The lines worth repeating under the table, for a step that failed.
 *
 * **Written because a red build sent someone scrolling.** A CI log ends with
 * `1 of 16 failed: test`, and the two test names that caused it are ~190
 * seconds of output further up, above a `biome migrate` notice and a depcruise
 * *warning* that both look like the failure and are not. The summary knew which
 * step failed and did not say what in it.
 *
 * The patterns are this repo's own vocabulary rather than a general guess:
 * `(fail)` is bun's, `FAILED:` is the one every `check:*` script prints by
 * convention (`check:all-checks` holds them to it), and the other two are what
 * `tsc` and dependency-cruiser emit. A step that matches none falls back to its
 * last few lines, which is worse than a real match and better than nothing.
 */
function digestOf(lines: string[]): string[] {
  const patterns = [
    /^\(fail\)/, // bun test
    /^\s*FAILED:/, // every check:* script
    /error TS\d+/, // tsc
    /^\s*error\s/, // dependency-cruiser
    /^\s*×\s/, // biome, which prints no FAILED: of its own
  ];
  const hits = lines.filter((l) => patterns.some((p) => p.test(l)));
  if (hits.length > 0) return hits;
  return lines.filter((l) => l.trim() !== "").slice(-8);
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
  // Say what, not only which. Capped, because a cascade can produce hundreds
  // and the point is to stop someone scrolling, not to reproduce the run.
  const CAP = 20;
  for (const f of failed) {
    const digest = digestOf(f.lines);
    console.log(`\n${f.name}:`);
    for (const line of digest.slice(0, CAP)) console.log(`  ${line.trimEnd()}`);
    if (digest.length > CAP) console.log(`  … and ${digest.length - CAP} more`);
  }
  process.exit(1);
}
console.log(`\nall ${results.length} passed.`);
