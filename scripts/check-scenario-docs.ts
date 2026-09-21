#!/usr/bin/env bun
/**
 * docs/scenarios/ says what the scenarios do.
 *
 * Regenerates into a temp directory and compares. The pages are read off the event log,
 * so a difference means a scenario changed and the pages did not — run
 * `bun run docs:scenarios` and commit what it writes.
 *
 * retire-when: docs/scenarios/ is deleted, or the pages stop being generated.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fresh = mkdtempSync(join(tmpdir(), "labkit-scenario-docs-"));
const capture = mkdtempSync(join(tmpdir(), "labkit-scenario-capture-"));

const run = spawnSync(
  "bun",
  ["scripts/build-scenario-docs.ts", "--out", fresh, "--capture", capture],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
if (run.status !== 0) {
  process.stderr.write(`${run.stdout ?? ""}${run.stderr ?? ""}`);
  process.stderr.write("FAILED: could not regenerate the scenario pages.\n");
  process.exit(1);
}

const committed = "docs/scenarios";
const read = (dir: string) =>
  new Map(
    readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => [f, readFileSync(join(dir, f), "utf8")] as const),
  );

const was = read(committed);
const now = read(fresh);
const stale = [...now].filter(([name, text]) => was.get(name) !== text).map(([name]) => name);
const orphan = [...was.keys()].filter((name) => !now.has(name));

if (stale.length === 0 && orphan.length === 0) {
  process.stdout.write(`OK: ${now.size} scenario pages match their scenarios.\n`);
  process.exit(0);
}

for (const name of stale) process.stderr.write(`  out of date: docs/scenarios/${name}\n`);
for (const name of orphan)
  process.stderr.write(`  no scenario writes it: docs/scenarios/${name}\n`);
process.stderr.write(
  `FAILED: ${stale.length + orphan.length} page(s) disagree with the scenarios.\n` +
    `  Run \`bun run docs:scenarios\` and commit the result.\n`,
);
process.exit(1);
