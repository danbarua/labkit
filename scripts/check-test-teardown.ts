#!/usr/bin/env bun
/**
 * Every test file that opens a scenario must also reset the database.
 *
 * **This exists because the defect it catches is invisible from the file that
 * causes it.** `tests/cli/json-contract.test.ts` shipped without an `afterAll`
 * on 2026-08-25. Its own twenty assertions passed; its tenant graph then
 * survived into `tests/scenarios/s18`, whose reader found a question the
 * contract test had established and failed `expect(known.established).toEqual([])`.
 * The file that was red was not the file that was wrong, and nothing pointed
 * from one to the other.
 *
 * `scenario.end()` is what resets — it drops every AGE graph and truncates.
 * `scenario.close()` only closes the connection, so a file with `close()` and
 * no `end()` tears down its own resources and leaves the database dirty, which
 * is exactly the shape that shipped.
 *
 * **What this does not prove.** It checks that the calls appear in the file,
 * not that they are reachable, not that they are in a hook, and not that they
 * run on the failure path. A file could call `end()` inside a branch nothing
 * takes and pass. That is a smaller claim than "teardown happens", and it is
 * the one the text supports — say the smaller true thing. It catches the
 * omission, which is the failure that actually occurred and the one nobody
 * would spot in review.
 *
 * Usage: bun scripts/check-test-teardown.ts
 * Exit:  0 when clean, 1 when a file opens a scenario and never resets.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every `*.test.ts` under `tests/`, recursively. */
function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? testFiles(path) : path.endsWith(".test.ts") ? [path] : [];
  });
}

/** Comments strip first: naming a call in prose is not making it. */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const offenders: Array<{ file: string; missing: string[] }> = [];

for (const file of testFiles("tests")) {
  const source = code(readFileSync(file, "utf8"));
  if (!source.includes("openScenario(")) continue;
  const missing = [
    ...(source.includes(".end(") ? [] : ["scenario.end()"]),
    ...(source.includes(".close(") ? [] : ["scenario.close()"]),
  ];
  if (missing.length > 0) offenders.push({ file, missing });
}

if (offenders.length > 0) {
  console.error("FAILED: a scenario is opened and never reset:");
  console.error();
  for (const { file, missing } of offenders) {
    console.error(`  ${file} — never calls ${missing.join(" or ")}`);
  }
  console.error();
  console.error("`scenario.end()` drops every AGE graph and truncates; `close()` only closes");
  console.error("the connection. A file without `end()` leaves its tenant graph behind, and");
  console.error("the file that goes red is the NEXT one, not this one.");
  process.exit(1);
}

console.log(
  `OK: all ${testFiles("tests").filter((f) => code(readFileSync(f, "utf8")).includes("openScenario(")).length} scenario files reset the database.`,
);
