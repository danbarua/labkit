/**
 * Does every domain verb have a command?
 *
 * Derived from the surface declarations and from the command modules' own
 * source, never listed here, so a verb added later is covered without anyone
 * remembering. Same derivation `tests/mcp.test.ts` uses for tool exposure, and
 * the same helper.
 *
 * **The coverage runs one way only, deliberately.** Every read verb needs a
 * command; a command needs no MCP tool and no domain verb behind it at all.
 * `--backup`, `doctor`, `completions` — anything the terminal wants and an
 * agent does not — is a feature, not a parity failure, and a test that
 * reddened when the CLI grew a command MCP lacks would be an obstacle rather
 * than a guard.
 *
 * Derived from the **call**, `read.someVerb(`, and not from a `verb:` field
 * beside each command. A field records what a declaration *says* and can
 * disagree with the line below it; the call is the thing that runs.
 */

import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ReadSurface } from "../../src/domain";
import { publicVerbsOf, verbsReachedIn } from "../helpers/surface-coverage";

const COMMANDS_DIR = "src/cli/commands";

/** Every command module's source, comments stripped — naming a verb in prose is not calling it. */
const commandSource = readdirSync(COMMANDS_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => readFileSync(join(COMMANDS_DIR, f), "utf8"))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * Verbs deliberately without a command, and why.
 *
 * Empty, and that is the current state rather than a claim it must stay empty.
 * The same shape as `NOT_EXPOSED` in `tests/helpers/surface-coverage.ts`: a
 * bare list of names would decay into whatever happens to be unimplemented
 * today, so an exclusion has to carry a reason.
 */
const NO_COMMAND_FOR: Readonly<Record<string, string>> = {};

test("the command modules were found at all", () => {
  // Guards the derivation rather than the thing derived. A moved directory
  // would otherwise make every test below pass by having nothing to read.
  expect(commandSource.length).toBeGreaterThan(1000);
  expect(commandSource).toContain("read.whatIsKnown(");
});

test("every read verb the domain exposes has a CLI command", () => {
  const reads = publicVerbsOf("src/domain/read.ts");
  expect(reads.length).toBeGreaterThan(10);
  expect(reads).toContain("gateStatus");
  for (const verb of reads) {
    expect(typeof (ReadSurface.prototype as unknown as Record<string, unknown>)[verb]).toBe(
      "function",
    );
  }

  const unreachable = reads
    .filter((v) => verbsReachedIn(commandSource, "read", [v]).length === 0)
    .filter((v) => !(v in NO_COMMAND_FOR));
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
