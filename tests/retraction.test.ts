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
 *
 * **Deliberately not on `setupTestDb()`.** `tests/tenancy-isolation.test.ts`'s
 * own header says why: that shares one PGlite session across the whole
 * suite, and `SET ROLE` is session state with no way back down this
 * connection came up — a test that stepped down there leaves every later
 * test running as `labkit_app`, cascading into failures with no visible
 * connection to this file. This one opens its own connection and closes it.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectDb, type LabKitDBConnection } from "../src/db/connect";
import { resolveTenantContext } from "../src/db/tenant";
import { scopeToTenant } from "../src/db/scoped";
import { TenantGraph } from "../src/db/graph";
import { ResearchSession, inMemoryEventLog } from "../src/domain";

let home: string;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "labkit-retraction."));
});
afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

test("undo hides what it retracted from the role every ordinary session runs as", async () => {
  const connection: LabKitDBConnection = await connectDb(home);
  try {
    const ctx = await resolveTenantContext(connection.db, connection.tx, "labkit");
    await scopeToTenant(connection.db, ctx);
    const graph = new TenantGraph(ctx, connection.db, connection.tx);
    const session = new ResearchSession(graph, { events: inMemoryEventLog() });

    const wording = "retraction end-to-end probe: does this hide?";
    const { question, events } = await session.pose({ question: wording });
    await session.undo({
      event: events[0]!.seq!,
      because: "proving the mechanism, not a real question",
    });

    // Unreachable by the wording that used to find it -- not merely absent
    // from one report, but genuinely invisible to a normal read.
    const found = await session.search(wording);
    expect(found.flatMap((g) => g.matches)).toEqual([]);

    // And unreachable as a write target, the same way a handle nobody ever
    // minted would be: `pursue` checks its target exists before wiring
    // anything to it.
    await expect(session.pursue({ question, approach: "try again" })).rejects.toThrow();
  } finally {
    await connection.close();
  }
}, 60_000);
