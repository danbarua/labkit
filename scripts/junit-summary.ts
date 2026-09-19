#!/usr/bin/env bun
/**
 * Renders every `junit*.xml` under a directory as one table, for GitHub's job
 * summary — so a failure is read rather than grepped out of five logs.
 *
 *   bun scripts/junit-summary.ts <dir> >> "$GITHUB_STEP_SUMMARY"
 *
 * retire-when: the runner renders JUnit itself.
 */

import { Glob } from "bun";

const dir = process.argv[2] ?? ".";
const files = [...new Glob("**/junit*.xml").scanSync(dir)].sort();
if (files.length === 0) throw new Error(`no junit*.xml under ${dir}`);

interface Case {
  file: string;
  name: string;
  message: string;
}

let tests = 0;
let failures = 0;
let skipped = 0;
let seconds = 0;
const failed: Case[] = [];

for (const relative of files) {
  const xml = await Bun.file(`${dir}/${relative}`).text();
  // The `<testsuites>` element carries the run's own totals; the per-suite
  // ones would double-count, since bun nests a suite per describe block.
  const totals = /<testsuites[^>]*>/.exec(xml)?.[0] ?? "";
  const num = (key: string) => Number(new RegExp(`${key}="([0-9.]+)"`).exec(totals)?.[1] ?? 0);
  tests += num("tests");
  failures += num("failures");
  skipped += num("skipped");
  seconds += num("time");

  // Split on the opening tag: a self-closing `<testcase />` holds no failure,
  // and a regex spanning to the next `</testcase>` would attribute one case's
  // failure to the case before it.
  for (const chunk of xml.split("<testcase").slice(1)) {
    if (!chunk.includes("<failure")) continue;
    const name = /name="([^"]*)"/.exec(chunk)?.[1] ?? "(unnamed)";
    const file = /file="([^"]*)"/.exec(chunk)?.[1] ?? "";
    const message = /<failure[^>]*message="([^"]*)"/.exec(chunk)?.[1] ?? "";
    failed.push({ file, name, message });
  }
}

const lines = [
  `## Tests`,
  ``,
  `| shards | tests | failed | skipped | slowest total |`,
  `| --- | --- | --- | --- | --- |`,
  `| ${files.length} | ${tests} | ${failures} | ${skipped} | ${seconds.toFixed(1)}s |`,
];

if (failed.length > 0) {
  lines.push(``, `### Failures`, ``);
  for (const f of failed) {
    lines.push(`- **${f.name}** — \`${f.file}\``, `  ${f.message.replaceAll("&#10;", " ")}`);
  }
}

console.log(lines.join("\n"));
