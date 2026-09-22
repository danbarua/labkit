/**
 * The command modules reach the domain through its verbs, and nothing else.
 */

import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verbsCalledOn } from "../helpers/surface-coverage";

const COMMANDS_DIR = "packages/app-cli/commands";

/** Every command module. */
const commandFiles = readdirSync(COMMANDS_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => join(COMMANDS_DIR, f));

/**
 * The same files as text, comments stripped, for the bypass check only.
 */
const commandSource = commandFiles
  .map((f) => readFileSync(f, "utf8"))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("the command modules were found at all", () => {
  // Guards the derivation rather than the thing derived. A moved directory
  // would otherwise make every test below pass by having nothing to read.
  expect(commandFiles.length).toBeGreaterThan(1);
  expect(commandSource.length).toBeGreaterThan(1000);
  expect(verbsCalledOn(commandFiles, "read")).toContain("now");
  expect(verbsCalledOn(commandFiles, "write")).toContain("recordAnalysis");
});

test("the command modules reach the graph only through domain verbs", () => {
  // What survives from the era when this CLI was read-only by construction,
  // narrowed to the property that was actually worth having. The old
  // `examples/full-lifecycle.ts` wrote by calling these directly, underneath
  // the domain layer, which is how a record got written with no verb recording
  // that it had been.
  for (const bypass of ["createNode", "createEdge", "inTransaction", "graph.query("]) {
    expect(commandSource).not.toContain(bypass);
  }
});
