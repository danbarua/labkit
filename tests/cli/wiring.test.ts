/**
 * What the composition root wires up, asserted on its source.
 */

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/** Comments explain what the CLI deliberately does not do; naming a thing in
 *  prose is not doing it. Strip before matching. */
const code = (path: string): string =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const session = code("src/cli/session.ts");

test("the wiring under test was found at all", () => {
  // Guards the derivation. A moved or renamed file would otherwise make every
  // assertion below pass by having nothing to read.
  expect(session).toContain("resolveTenantContext");
  expect(session).toContain("new TenantGraph");
});

test("the CLI hands the event log in rather than letting it default", () => {
  // `SessionCore` defaults `events` to `inMemoryEventLog()`. In a process that exits after one
  // command that is an array nothing ever wrote to.
  expect(session).toContain("const events = pgEventLog(connection.db, ctx.tenantId)");
  expect(session).toMatch(/new ReadSurface\(graph, \{ events \}\)/);
  expect(session).toMatch(/new WriteSurface\(graph, \{[\s\S]*?events,/);
  expect(session).not.toContain("inMemoryEventLog");
});

test("the CLI attributes writes to a real person and a real commit", () => {
  // Not the mocks. `mockGitContext` answers forty zeros *designed to read as
  // fake*, which is right for a stand-in and wrong in a permanent record -- the
  // first person to see a git_hash will try to check it out.
  // `toMatch` and not `toContain`, for the reason line 29 is: biome splits a
  // call whose arguments outgrow the line, and a substring match then fails on
  // code that is correct.
  expect(session).toMatch(/commandContext\(\s*gitContext,\s*personContext\(/);
  expect(session).not.toContain("mockGitContext");
  expect(session).not.toContain("mockSessionContext");
});

test("the CLI holds both surfaces separately and not the session that joins them", () => {
  // `ResearchSession` joins the halves. Holding them apart is what lets a read
  // command be handed the read surface and nothing else -- the arrangement
  // `tests/mcp.test.ts` calls the whole safety story. Checked across the tree,
  // not just the root, because any module could reach for it.
  const tree = ["session", "program", "cli", "output", "args"]
    .map((f) => code(`src/cli/${f}.ts`))
    .concat(["reads", "writes"].map((f) => code(`src/cli/commands/${f}.ts`)))
    .join("\n");
  expect(tree).toContain("ReadSurface");
  expect(tree).toContain("WriteSurface");
  expect(tree).not.toContain("ResearchSession");
});
