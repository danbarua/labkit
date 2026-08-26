#!/usr/bin/env bun
/**
 * Nothing runs the suite as a bare `bun test`, which would ignore the timeout.
 *
 * **Written because this shipped twice in one day, silently, and cost two CI
 * cycles.** The ceiling lives in one place — `package.json`'s `test` script,
 * `bun test --timeout 20000` — and a bare `bun test` bypasses `package.json`
 * entirely, running at bun's 5000ms default. A caller invoking it directly runs
 * at a ceiling nobody chose while the repo believes it raised one.
 *
 * `scripts/check-all.ts` did it first, as `argv: ["bun", "test"]`, and a build
 * failed at 5000ms with the flag apparently set. That was fixed; the next build
 * got further and failed the same way in `scripts/test-postgres.sh`, the other
 * of the two places that run the suite. Fixing callers one at a time is what
 * produced the second failure, hence a check rather than a third fix.
 *
 * **Both spellings are flagged, and the first version of this script caught
 * only one of them** — the shell `bun test`, not the `["bun", "test"]` array
 * that caused the original defect. A check that would not have caught the bug
 * it was written for is worse than none, which is why it was run against both
 * before being trusted.
 *
 * **`bunfig.toml` would be the better answer and does not work.** Measured
 * against bun 1.3.14: `[test] timeout = 20000` is ignored, a 6.5s `beforeAll`
 * failing identically with and without it. If a later bun honours it, move the
 * ceiling there and delete this script — the trap stops existing, which beats
 * guarding it.
 *
 * Usage: bun run check:test-ceiling
 * Exit:  0 when every caller goes through the script, 1 otherwise.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "scripts";
const SELF = "check-test-ceiling.ts";

/** `bun test` as a shell command, and `["bun", "test"]` as an argv array. */
const INVOCATIONS = [/\bbun\s+test\b/, /["']bun["']\s*,\s*["']test["']/];

/** Prose about `bun test` is everywhere in this repo and is not an invocation. */
function code(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed.startsWith("*")) return "";
  return line.split("//")[0] ?? "";
}

const offenders: string[] = [];
for (const file of readdirSync(DIR).sort()) {
  if (file === SELF || !(file.endsWith(".sh") || file.endsWith(".ts"))) continue;
  const path = join(DIR, file);
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const source = code(line);
      // `bun run test` is the correct form and contains `bun` and `test` too.
      if (/\bbun\s+run\s+test\b/.test(source)) return;
      if (/["']bun["']\s*,\s*["']run["']/.test(source)) return;
      if (INVOCATIONS.some((rx) => rx.test(source))) {
        offenders.push(`${path}:${i + 1}: ${source.trim()}`);
      }
    });
}

if (offenders.length > 0) {
  console.error("FAILED: a bare `bun test` ignores package.json, so it runs at bun's");
  console.error("        5000ms default rather than the ceiling the `test` script sets.");
  console.error("");
  for (const o of offenders) console.error(`  ${o}`);
  console.error("");
  console.error("Use `bun run test`. See this script's header for what it cost twice.");
  process.exit(1);
}

console.log("OK: every caller runs the suite through the test script, so the ceiling applies.");
