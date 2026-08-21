#!/usr/bin/env bun
/**
 * Finds tests that assert nothing.
 *
 * The one shape PJ-028 found that generalises. PJ-027 argued that a rule stated
 * in prose beside code that ignores it cannot be machine-checked, and a
 * deliberate sweep of ~19,000 lines confirmed it: of two proposed comment-shaped
 * checks, one found only stale prose and the other found nothing at all, because
 * every real instance was cross-file.
 *
 * This is the exception, and it is not about prose. A test's *name* is a claim
 * and its *body* is the check on that claim, so PJ-027's asymmetry opens there
 * too — and wider, because a passing test reads as evidence. The green tick is a
 * second copy of the claim agreeing with the first.
 *
 * Both rules earned their place by catching a real defect at the moment they
 * were written, with no false positives in the whole suite:
 *
 * - **No `expect(` in a file.** `tests/leader-election.test.ts` is named
 *   "concurrent connectDb() calls elect one primary and share one database" and
 *   CLAUDE.md calls it a test that proves the election works. It fetched the
 *   tenant count and discarded it. Three processes each electing themselves and
 *   opening three separate databases would have passed.
 * - **An `expect` whose two sides are both literals.** `tests/trace.test.ts` had
 *   `expect(true).toBe(true)` under a test named "a throwing query is still
 *   cleared from the in-flight set", whose comment read "this test exists so
 *   removing it is loud." Removing the `finally` it names left five tests
 *   passing and none failing.
 *
 * **Deliberately narrow, and it should stay that way.** It does not count
 * assertions per test, does not look at test names, and does not judge whether
 * an assertion is *strong* — PJ-028 demonstrated exactly these two shapes and
 * nothing wider, and a check that reaches past its evidence is the failure this
 * repo keeps catching in prose. A weak assertion is a reader's problem. No
 * assertion is decidable.
 *
 * Exit 0 = clean. Exit 1 = tests that assert nothing, listed.
 */
import { readFileSync } from "node:fs";
import { Glob } from "bun";

/** Both sides literal: `true`/`false`, a number, or a quoted string. */
const LITERAL = String.raw`(?:true|false|null|undefined|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|\`[^\`]*\`)`;
const TAUTOLOGY = new RegExp(
  String.raw`\bexpect\(\s*(${LITERAL})\s*\)\s*\.\s*(?:toBe|toEqual|toStrictEqual)\(\s*(${LITERAL})\s*\)`,
);

const glob = new Glob("tests/**/*.test.ts");
const silent: string[] = [];
const tautologies: Array<{ path: string; line: number; text: string }> = [];

for await (const path of glob.scan(".")) {
  const source = readFileSync(path, "utf8");
  // Strip comments before counting: a commented-out assertion is not one, and
  // this repo writes the *correct* assertion in a comment on purpose.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (!code.includes("expect(")) {
    silent.push(path);
    continue;
  }
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
    const hit = TAUTOLOGY.exec(line);
    if (hit) tautologies.push({ path, line: i + 1, text: line.trim() });
  }
}

if (silent.length === 0 && tautologies.length === 0) {
  console.log("✅ check-tests-assert OK: every test file asserts something, and no assertion compares two literals.");
  process.exit(0);
}

console.error("❌ check-tests-assert FAILED: these tests cannot fail for the reason they exist.");
console.error(
  "   A test name is a claim; the body is the check on it. Where the body checks\n" +
    "   nothing, the passing tick is a second copy of the claim -- see PJ-028.\n",
);

for (const path of silent) {
  console.error(`   ${path} — no assertion anywhere in the file`);
}
for (const t of tautologies) {
  console.error(`   ${t.path}:${t.line} — both sides of this comparison are literals`);
  console.error(`      ${t.text.slice(0, 90)}`);
}

const total = silent.length + tautologies.length;
console.error(
  `\n   ${total} to fix. Assert the thing the name claims, or rename the test to what it checks.`,
);
process.exit(1);
