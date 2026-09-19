#!/usr/bin/env bun
/**
 * Everything that has to be green before a commit, in one command.
 *
 * There was no shortcut: `bun run` does not glob, so `bun run check:*` was ten
 * invocations typed by hand or, more often, the three or four somebody
 * remembered. CLAUDE.md's own instruction — *"run `bun test`, `bun run
 * typecheck` and `bunx --bun depcruise`; add `check:migrations` if you touched
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

/**
 * Where the suite writes its machine-readable result.
 *
 * Under the repository rather than a temp directory, because a build that
 * uploads artefacts should be able to find it without being told where to
 * look. It is gitignored.
 */
const JUNIT = "junit.xml";

/** The script file a `check:*` command runs, for `summaryOf` to read. */
const fileFor = (name: string): string | undefined =>
  scripts[name]?.split(/\s+/).find((token) => token.startsWith("scripts/"));

/**
 * The steps that run or build the product rather than reading it, measured:
 * test 162.0s, check:cli 13.7s, check:binary 3.6s. Everything else is under a
 * second.
 *
 * One definition, two uses: these sort last here, and `check:quick` drops them.
 * Named rather than timed at runtime -- a threshold moves with the machine, and
 * a slow laptop would silently reorder or drop a check.
 */
export const SLOW: ReadonlySet<string> = new Set(["test", "check:cli", "check:binary"]);

/** Cheap steps first, in their existing order within each half. */
const order = (steps: Step[]): Step[] => [
  ...steps.filter((s) => !SLOW.has(s.name)),
  ...steps.filter((s) => SLOW.has(s.name)),
];

/**
 * Every step `check` runs, derived from `package.json`.
 *
 * Exported so `check:quick` runs the same derivation rather than a second copy
 * of it — a list of step names in two files is the drift this file already
 * refuses for the summaries.
 */
export function stepsFor(): Step[] {
  // **Cheapest first.** A formatter disagreement and a three-minute test suite
  // are both one red build, and running the suite first means waiting out the
  // three minutes to be told about the formatter. Ordered here rather than in
  // the CI config, so a local sweep and a build fail in the same order.
  return order([
    // The three CLAUDE.md names as the pre-commit bar, first, because they are
    // the ones that fail for real reasons rather than for tidiness. Their
    // sentences are written here because they have no script header to read.
    //
    // **`bun run test`, not `bun test`.** This said `["bun", "test"]` until
    // 2026-08-26, which bypasses `package.json` entirely — so a `--timeout` added
    // to the `test` script applied to `bun run test` and not to the sweep, and CI
    // went on failing at bun's default ceiling with the flag apparently set. Two
    // definitions of one step is exactly the shape this file exists to avoid;
    // every other step below already goes through `bun run`.
    {
      name: "test",
      // `--` so the flags reach `bun test` rather than `bun run`. The JUnit
      // file is what `digestOf` reads for a failure's Expected and Received:
      // the console reporter prints those beside the failure, hundreds of
      // lines above the summary, and a build log is read from the bottom.
      argv: ["bun", "run", "test", "--", "--reporter=junit", `--reporter-outfile=${JUNIT}`],
      says: "Every test in the suite.",
    },
    {
      name: "typecheck",
      argv: ["bun", "run", "typecheck"],
      says: "The types agree.",
    },
    {
      // **`--bun`, or this runs under whatever `node` is on the caller's PATH.**
      // `depcruise` and `tsc` both carry a `#!/usr/bin/env node` shebang, so
      // plain `bunx` hands them to ambient node — and dependency-cruiser refuses
      // to start on a node outside `^22||^24||>=26`. The sweep then reports the
      // layering rules broken on one machine and green on another, from the same
      // commit. `typecheck` takes the flag in `package.json`, where its command
      // lives.
      name: "depcruise",
      argv: ["bunx", "--bun", "depcruise", "packages", "tests", "--output-type", "err"],
      says: "The layering rules hold, and nothing imports in a circle.",
    },
    ...Object.keys(scripts)
      .filter((name) => name.startsWith("check:"))
      // `check:quick` is a composite of the others, not a check. Running it
      // here would run this derivation again, from inside itself.
      .filter((name) => name !== "check:quick" && name !== "check:changed")
      .sort()
      .map((name) => {
        const file = fileFor(name);
        return {
          name,
          argv: ["bun", "run", name],
          // `check:all-checks` is what stops this falling back. If it is
          // passing, every check script has a summary and this reads it.
          says: (file && summaryOf(file)) ?? "(no summary — see check:all-checks)",
        };
      }),
  ]);
}

interface Result {
  name: string;
  ok: boolean;
  ms: number;
  lines: string[];
}

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

/**
 * Runs every step, prints the table, and answers with the exit code.
 *
 * Exported for `check:quick`, which runs a subset. Everything runs even after a
 * failure: stopping at the first one tells you about one problem when you have
 * three, and the whole point of a sweep is the summary.
 */
export async function runSteps(steps: Step[]): Promise<number> {
  const results: Result[] = [];
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
  return report(results);
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
/** Turns bun's XML escapes back into text a person reads. */
const unescapeXml = (text: string): string =>
  text
    .replace(/&#10;/g, "\n  ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/**
 * The failing tests and why, from the suite's own JUnit output.
 *
 * bun's console reporter prints `Expected:` and `Received:` beside the
 * failure, which in a build log is hundreds of lines above the summary — and
 * a build log is read from the bottom. The XML carries the same text attached
 * to the test it belongs to.
 *
 * Regex rather than an XML parser: the shape is bun's own, and a dependency
 * for one file is the wrong trade. A shape it does not match yields nothing,
 * and the caller falls back to the console lines.
 */
function failuresFromJunit(): string[] {
  let xml: string;
  try {
    xml = readFileSync(JUNIT, "utf8");
  } catch {
    return [];
  }
  // Split rather than match a pair of tags: a passing test is written
  // `<testcase … />` with no closing tag, so a `<testcase>…</testcase>`
  // pattern spans every passing test between two failures and reports the
  // wrong file and name against the right message.
  const out: string[] = [];
  for (const chunk of xml.split("<testcase").slice(1)) {
    const head = chunk.slice(0, chunk.indexOf(">"));
    const body = chunk.slice(chunk.indexOf(">"));
    if (
      !body.startsWith(">") ||
      !body.slice(0, body.indexOf("</testcase>") + 1).includes("<failure")
    )
      continue;
    const name = /name="([^"]*)"/.exec(head)?.[1];
    const file = /file="([^"]*)"/.exec(head)?.[1];
    const message = /<failure[^>]*message="([^"]*)"/.exec(body)?.[1];
    out.push(`${file ? `${file} > ` : ""}${unescapeXml(name ?? "(unnamed)")}`);
    if (message) out.push(`  ${unescapeXml(message).trimEnd()}`);
  }
  return out;
}

function digestOf(lines: string[]): string[] {
  const patterns = [
    /^\(fail\)/, // bun test
    /^\s*FAILED:/, // every check:* script
    /error TS\d+/, // tsc
    /^\s*error\s/, // dependency-cruiser
    /^\s*×\s/, // biome, which prints no FAILED: of its own
  ];
  const hits: string[] = [];
  lines.forEach((line, i) => {
    if (!patterns.some((p) => p.test(line))) return;
    hits.push(line);
    // bun puts the reason on the *next* line — `^ a beforeEach/afterEach hook
    // timed out for this test.` — and without it a digest reads
    // `(fail) (unnamed) [5694ms]` and says nothing about why. That happened on
    // the build this function was written for.
    const next = lines[i + 1];
    if (next?.trimStart().startsWith("^")) hits.push(next);
  });
  // bun prints each failure twice, inline and again under "N tests failed:".
  // Repeating that here doubles the thing the digest exists to shorten.
  const seen = new Set<string>();
  const unique = hits.filter((l) => {
    const key = l.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length > 0) return unique;
  return lines.filter((l) => l.trim() !== "").slice(-8);
}

/** The table, and what failed in it. Answers with the exit code. */
function report(results: Result[]): number {
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
      // The suite's own structured output where there is one; the console
      // lines for every other step, which have none.
      const fromXml = f.name.startsWith("test") ? failuresFromJunit() : [];
      const digest = fromXml.length > 0 ? fromXml : digestOf(f.lines);
      console.log(`\n${f.name}:`);
      for (const line of digest.slice(0, CAP)) console.log(`  ${line.trimEnd()}`);
      if (digest.length > CAP) console.log(`  … and ${digest.length - CAP} more`);
    }
    return 1;
  }
  console.log(`\nall ${results.length} passed.`);
  return 0;
}

// Importing this file must not run the sweep: `check:quick` imports `stepsFor`
// and `runSteps` from here.
if (import.meta.main) process.exit(await runSteps(stepsFor()));
