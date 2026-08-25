/**
 * What the composition root wires up, asserted on its source.
 *
 * **Source assertions, and that is the honest choice here.** Both properties
 * below are about what `src/cli/session.ts` *constructs*; observing them at
 * runtime would mean standing up a database in order to watch an absence — an
 * event that never arrives, a mock hash that is not there. Reading the wiring
 * is a smaller claim and the one the text supports.
 *
 * These came out of `tests/cli.test.ts`, which was deleted at the cutover.
 * Comparing the two files' test names is what found them: the old file had
 * twenty-four tests, most obsoleted by commander generating its own help, and
 * these three were neither obsolete nor ported. That comparison is worth doing
 * whenever a test file is retired.
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
  // `SessionCore` defaults `events` to `inMemoryEventLog()`. In a process that
  // exits after one command that is an array nothing ever wrote to. On the read
  // side `happened` reports that nothing has ever happened against a full
  // database; on the write side a verb commits its graph changes durably while
  // the event describing them dies at exit -- durable state with no record of
  // the act that caused it. Both are confidently wrong rather than empty.
  //
  // One sink, constructed once and handed to both, which is also what keeps the
  // stream from fragmenting.
  expect(session).toContain("const events = pgEventLog(connection.db, ctx.tenantId)");
  expect(session).toMatch(/new ReadSurface\(graph, \{ events \}\)/);
  expect(session).toMatch(/new WriteSurface\(graph, \{[\s\S]*?events,/);
  expect(session).not.toContain("inMemoryEventLog");
});

test("the CLI attributes writes to a real person and a real commit", () => {
  // Not the mocks. `mockGitContext` answers forty zeros *designed to read as
  // fake*, which is right for a stand-in and wrong in a permanent record -- the
  // first person to see a git_hash will try to check it out.
  expect(session).toContain("commandContext(gitContext, personContext(");
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
