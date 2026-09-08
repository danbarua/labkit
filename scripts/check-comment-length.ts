#!/usr/bin/env bun
/**
 * No comment block in src/ or tests/ runs longer than eight lines.
 *
 * Length separates an essay from a doc comment; density does not. A file of
 * interface declarations with a one-line doc per field is 44% comment and
 * correct, so a density lint would reward deleting the docs. Eight admits a
 * summary, a blank line and a three-line caveat, and refuses an argument.
 *
 * retire-when: never — a length bound has no condition that retires it.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX = 8;
const ROOTS = ["src", "tests"];

function tsFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...tsFiles(path));
    else if (path.endsWith(".ts")) found.push(path);
  }
  return found;
}

/** Every run of consecutive comment lines, as `[startLine, length]`. */
function blocks(source: string): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  let start = 0;
  let run = 0;
  source.split("\n").forEach((line, i) => {
    const text = line.trim();
    const isComment =
      text.startsWith("//") || text.startsWith("/*") || text.startsWith("*") || text === "*/";
    if (isComment) {
      if (run === 0) start = i + 1;
      run += 1;
      // A closing delimiter ends the block. Two doc comments with no code
      // between them are two blocks, not one long one.
      if (text.endsWith("*/")) {
        found.push([start, run]);
        run = 0;
      }
      return;
    }
    if (run > 0) found.push([start, run]);
    run = 0;
  });
  if (run > 0) found.push([start, run]);
  return found;
}

const files = ROOTS.flatMap(tsFiles);
const over: string[] = [];
for (const file of files) {
  for (const [line, length] of blocks(readFileSync(file, "utf8"))) {
    if (length > MAX) over.push(`   ${file}:${line} — ${length} lines`);
  }
}

if (files.length === 0) {
  console.error("FAILED: no TypeScript files found under src/ or tests/.");
  process.exit(1);
}
if (over.length > 0) {
  console.error(`FAILED: ${over.length} comment block(s) over ${MAX} lines.`);
  console.error(over.join("\n"));
  console.error(
    `\n   A comment says what the code does and what would trip a reader.\n` +
      `   An argument for why it is this way goes in the commit message.`,
  );
  process.exit(1);
}
console.log(`OK: ${files.length} files, no comment block over ${MAX} lines.`);
