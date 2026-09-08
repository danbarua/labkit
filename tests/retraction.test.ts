/**
 * `undo` retracts through the same tenant-scoped role every real session runs as, not through
 * the admin connection the rest of the suite uses.
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
