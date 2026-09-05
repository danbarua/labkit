/**
 * `undo` retracts through the same tenant-scoped role every real session
 * runs as, not through the admin connection the rest of the suite uses.
 *
 * `tests/scenarios/` runs `resolveTenantContext()` and stops there, which is
 * every scenario test's own connection running as the table owner — RLS does
 * not apply to a table's owner by default, so a scenario test cannot see
 * whether retraction actually hides anything. This is where that is
 * demonstrated, through `scopeToTenant()`, the same step production takes
 * between resolving a tenant and handing the connection to the domain (see
 * CLAUDE.md's fixed session-assembly order).
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { setupTestDb, type TestDb } from "./helpers/db";
import { resolveTenantContext } from "../src/db/tenant";
import { scopeToTenant } from "../src/db/scoped";
import { TenantGraph } from "../src/db/graph";
import { ResearchSession, inMemoryEventLog } from "../src/domain";

let testDb: TestDb;
beforeAll(async () => {
  testDb = await setupTestDb();
});
afterAll(async () => {
  await testDb.close();
});

test("undo hides what it retracted from the role every ordinary session runs as", async () => {
  const db = await testDb.openClient();
  const ctx = await resolveTenantContext(db, db.tx, "labkit");
  await scopeToTenant(db, ctx);
  const graph = new TenantGraph(ctx, db, db.tx);
  const session = new ResearchSession(graph, { events: inMemoryEventLog() });

  const wording = "retraction end-to-end probe: does this hide?";
  const { question, events } = await session.pose({ question: wording });
  await session.undo({ event: events[0]!.seq!, because: "proving the mechanism, not a real question" });

  // Unreachable by the wording that used to find it -- not merely absent
  // from one report, but genuinely invisible to a normal read.
  const found = await session.search(wording);
  expect(found.flatMap((g) => g.matches)).toEqual([]);

  // And unreachable as a write target, the same way a handle nobody ever
  // minted would be: `pursue` checks its target exists before wiring
  // anything to it.
  await expect(session.pursue({ question, approach: "try again" })).rejects.toThrow();
});
