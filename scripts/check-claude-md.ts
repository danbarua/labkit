#!/usr/bin/env bun
/**
 * CLAUDE.md stays short, and carries no history.
 *
 * It grew from 2.5 KB to 104 KB in three weeks, one incident at a time, until
 * its pinned rules forbade what the rest of it did. Every paragraph was
 * defensible when written. A cap is the only thing that refuses the aggregate.
 *
 * retire-when: CLAUDE.md has a mechanical author gate.
 */

import { readFileSync } from "node:fs";

const FILE = "CLAUDE.md";
const MAX_LINES = 150;

/** Text that says this is a record of what happened, not of what the code is. */
const BANNED: Array<[RegExp, string]> = [
  [/\b20\d\d-\d\d-\d\d\b/, "a date — the commit already carries it"],
  [/#\d{2,}/, "an issue number — the pull request already links it"],
  [/\bused to\b/i, "'used to' — the history is in git"],
  [/\bPJ-\d+/, "a project-journal reference"],
  [/\bS-\d+[a-z]?\b/, "a scenario-corpus reference"],
];

const lines = readFileSync(FILE, "utf8").split("\n");
const failures: string[] = [];

if (lines.length > MAX_LINES) {
  failures.push(`   ${FILE} is ${lines.length} lines; the cap is ${MAX_LINES}.`);
}
lines.forEach((line, i) => {
  for (const [pattern, why] of BANNED) {
    if (pattern.test(line)) failures.push(`   ${FILE}:${i + 1} — ${why}`);
  }
});

if (lines.length <= 1) {
  console.error(`FAILED: ${FILE} is empty or missing.`);
  process.exit(1);
}
if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} problem(s) in ${FILE}.`);
  console.error(failures.join("\n"));
  console.error(
    "\n   CLAUDE.md says what the repository is and how to work in it.\n" +
      "   What happened to it goes in a commit message or a pull request.",
  );
  process.exit(1);
}
console.log(`OK: ${FILE} is ${lines.length} lines and carries no history.`);
