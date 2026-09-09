/**
 * Does every domain verb have a command?
 */

import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ReadSurface, WriteSurface } from "../../src/domain";
import {
  publicVerbsOf,
  verbsCalledOn,
  READ_SURFACE,
  WRITE_SURFACE,
} from "../helpers/surface-coverage";

const COMMANDS_DIR = "src/cli/commands";

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

/**
 * Verbs deliberately without a command, and why.
 */
const NO_COMMAND_FOR: Readonly<Record<string, string>> = {
  // Both reached only through `why`'s dispatch table in src/domain/read.ts,
  // not called directly from any command module -- the `why` command itself
  // calls `read.why(subject)`. `whySupported` is still called directly from
  // src/mcp/tools.ts, so it keeps an MCP tool of its own.
  whySupported: "reached only through `why`, as the Claim case's body",
  enquiryInContext: "reached only through `why`, as the LineOfEnquiry case's body",
  analysisRevision: "reached only through `why`, as the Computation case's body",
  criterionStanding: "reached only through `why`, as the Criterion case's body",
  stoppedWork: "reached only through `why`, as the Task case's abandoned branch",
  neighboursOf: "reached only through `why`, as the walked kinds' body",
  proseFor: "reached only through `why`, as the walked kinds' body",
  // `now` composes it and its view prints the line; `happened --reconstructed`
  // is the list. A `transcribed` command would answer the same question a
  // third time.
  // The paged form is what the command calls; the unpaged one is the sink's
  // own shape, kept for every caller that wants the list and not the page.
  whatHappened:
    "reached through `whatHappenedPage`, which `happened` and `what_happened` both call",
  howMuchWasTranscribed:
    "reached through `now`, which prints the count — a command of its own would be a second spelling of one question",
};

test("the command modules were found at all", () => {
  // Guards the derivation rather than the thing derived. A moved directory
  // would otherwise make every test below pass by having nothing to read.
  expect(commandFiles.length).toBeGreaterThan(1);
  expect(commandSource.length).toBeGreaterThan(1000);
  expect(verbsCalledOn(commandFiles, "read")).toContain("whatIsKnown");
  expect(verbsCalledOn(commandFiles, "write")).toContain("recordAnalysis");
});

test("every read verb the domain exposes has a CLI command", () => {
  const reads = publicVerbsOf(READ_SURFACE);
  expect(reads.length).toBeGreaterThan(10);
  expect(reads).toContain("gateStatus");
  for (const verb of reads) {
    expect(typeof (ReadSurface.prototype as unknown as Record<string, unknown>)[verb]).toBe(
      "function",
    );
  }

  const called = verbsCalledOn(commandFiles, "read");
  const unreachable = reads.filter((v) => !called.has(v) && !(v in NO_COMMAND_FOR));
  expect(unreachable).toEqual([]);
});

test("every write verb the domain exposes has a CLI command", () => {
  const writes = publicVerbsOf(WRITE_SURFACE);
  expect(writes.length).toBeGreaterThan(10);
  expect(writes).toContain("recordAnalysis");
  for (const verb of writes) {
    expect(typeof (WriteSurface.prototype as unknown as Record<string, unknown>)[verb]).toBe(
      "function",
    );
  }

  const called = verbsCalledOn(commandFiles, "write");
  const unreachable = writes.filter((v) => !called.has(v) && !(v in NO_COMMAND_FOR));
  expect(unreachable).toEqual([]);
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
