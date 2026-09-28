#!/usr/bin/env bun
/**
 * Prints the test files belonging to one shard, for `bun run test -- $(…)`.
 *
 *   bun scripts/lib/shard.ts --of 5 --index 2
 *
 * Round-robin over the sorted file list. A new test file joins a shard without
 * anyone updating a list, and the assignment is the same on every runner.
 *
 * retire-when: bun test shards by itself.
 */

import { Glob } from "bun";

const arg = (name: string): number => {
  const at = process.argv.indexOf(`--${name}`);
  const value = at === -1 ? undefined : Number(process.argv[at + 1]);
  if (value === undefined || !Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} needs a whole number`);
  }
  return value;
};

const of = arg("of");
const index = arg("index");
if (index < 1 || index > of) throw new Error(`--index must be 1..${of}`);

// The root suite and every package's own tests. A package can have its own node_modules, and the
// tests shipped in a dependency are not ours.
const pattern = "{tests,packages}/**/*.test.{ts,tsx}";
const files = [...new Glob(pattern).scanSync(".")]
  .filter((file) => !file.includes("/node_modules/"))
  .sort();
if (files.length === 0) throw new Error(`no test files matched ${pattern}`);

const mine = files.filter((_, i) => i % of === index - 1);
if (mine.length === 0) throw new Error(`shard ${index} of ${of} has no files`);
console.log(mine.join(" "));
