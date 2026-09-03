#!/usr/bin/env bun
/**
 * Every CLI command declares a help group, and the groups render in order.
 *
 * `labkit --help` listed 43 commands in one flat run until 2026-09-03, and a
 * flat list of 43 is a list nobody reads. The groups say what someone is doing
 * when they reach for a verb; a command without one falls into commander's
 * default section at the bottom, which is where a reader stops looking.
 *
 * **Two properties, and the second is the one that rots.** A group name that
 * is not in `src/domain/groups.ts` is caught by `tsc` — the arrays are `as
 * const` and the type is a literal union. What the compiler cannot see is
 * *ordering*: commander renders groups in the order their first command is
 * declared, so a command appended to the wrong place silently moves a whole
 * heading. That is checked here by walking the declarations in file order and
 * asserting the groups appear in the order the domain lists them.
 */

import { readFileSync } from "node:fs";
import { READ_GROUPS, WRITE_GROUPS, OPERATING_GROUPS } from "../src/domain/groups";

/** In the order commander meets them: reads, then writes, then the rest. */
const FILES = [
  { path: "src/cli/commands/reads.ts", groups: READ_GROUPS as readonly string[] },
  { path: "src/cli/commands/writes.ts", groups: WRITE_GROUPS as readonly string[] },
  { path: "src/cli/commands/serve.ts", groups: OPERATING_GROUPS as readonly string[] },
];

/** `.command("x")` optionally followed by `.helpGroup("Y")`, in file order. */
const DECLARATION = /\.command\("([a-z-]+)"\)\s*(?:\.helpGroup\("([^"]+)"\))?/g;

const problems: string[] = [];
let commands = 0;

for (const { path, groups } of FILES) {
  const source = readFileSync(path, "utf8");
  const seen: string[] = [];

  for (const m of source.matchAll(DECLARATION)) {
    commands++;
    const [, command, group] = m;
    if (!group) {
      problems.push(`${path}: \`${command}\` declares no .helpGroup()`);
      continue;
    }
    if (!groups.includes(group)) {
      problems.push(
        `${path}: \`${command}\` is in "${group}", which this file's surface does not list`,
      );
      continue;
    }
    if (seen[seen.length - 1] !== group) seen.push(group);
  }

  // Commander orders headings by first declaration, so the groups a file
  // introduces must appear in the domain's order and each exactly once --
  // a command dropped in the wrong place splits its own heading in two.
  const expected = groups.filter((g) => seen.includes(g));
  if (seen.join(" | ") !== expected.join(" | "))
    problems.push(
      `${path}: groups are declared as [${seen.join(", ")}]\n` +
        `        but render in order as   [${expected.join(", ")}]`,
    );
}

if (commands === 0) {
  console.error(
    "FAILED: found no command declarations — a check that examined nothing is not a check.",
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error("FAILED: a command is ungrouped, or the groups render out of order\n");
  for (const p of problems) console.error(`   ${p}`);
  process.exit(1);
}

console.log(`OK: ${commands} commands, each in a declared group, groups in the domain's order.`);
