/**
 * The durable event log, and the six things about it that could break quietly.
 *
 * `pgEventLog` is the first sink that outlives the process, and the first
 * LabKit-owned relational table besides `tenants`. Both of those bring failure
 * modes the in-memory log never had: a write that does not commit with what it
 * describes, and a read that crosses a tenant boundary.
 *
 * These live outside `tests/scenarios/` — a scenario asserts a researcher's
 * intent can be carried out through research verbs alone, and none of this is a
 * research question.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb, type TestDb } from "./helpers/db";
import { resolveTenantContext } from "../src/db/tenant";
import { TenantGraph } from "../src/db/graph";
import { WriteSurface, UNATTRIBUTED, type Clock } from "../src/domain";
import { pgEventLog } from "../src/domain/event-store";
import type { LabKitDB } from "../src/db/client";

let testDb: TestDb;
let db: LabKitDB & { close(): Promise<void> };

beforeAll(async () => { testDb = await setupTestDb(); });
afterAll(async () => { await testDb.close(); });
beforeEach(async () => { db = await testDb.openClient(); });
afterEach(async () => { await testDb.reset(); await db.close(); });

/** Frozen on purpose — several of these turn on `at` being unable to order anything. */
const clock: Clock = { now: () => "2026-08-25T09:00:00.000Z" };

const surfaceFor = async (slug: string) => {
  const ctx = await resolveTenantContext(db, slug);
  const graph = new TenantGraph(ctx, db);
  return { graph, ctx, write: new WriteSurface(graph, { clock, events: pgEventLog(db, ctx.tenantId) }) };
};

describe("the event log outlives the process that wrote it", () => {
  /**
   * The whole point, stated as the thing the in-memory sink could not do.
   * A second connection is the closest this harness gets to a second process:
   * it shares no JavaScript state with the first, so anything it can read came
   * out of Postgres.
   */
  test("an event written through one connection is readable through another", async () => {
    const { write } = await surfaceFor("labkit");
    const question = await write.pose("does the coating hold?");

    const other = await testDb.openClient();
    try {
      const ctx = await resolveTenantContext(other, "labkit");
      const seen = await pgEventLog(other, ctx.tenantId).all();
      expect(seen.map((e) => e.operation)).toEqual(["pose"]);
      expect(seen[0]!.subject).toBe(question);
      expect(seen[0]!.attribution).toEqual(UNATTRIBUTED);
    } finally {
      await other.close();
    }
  });

  /**
   * **The first isolation test on the relational side.**
   *
   * A tenant's graph is its own Postgres schema, so nothing in the graph has to
   * say which tenant it belongs to. `labkit_event` is one table for everyone,
   * and every read has to carry the filter itself. Nothing structural enforces
   * that — this test is the enforcement.
   */
  test("two tenants do not see each other's events", async () => {
    const a = await surfaceFor("tenant-a");
    const b = await surfaceFor("tenant-b");
    await a.write.pose("is A's question recorded?");
    await b.write.pose("is B's question recorded?");

    const seenByA = await pgEventLog(db, a.ctx.tenantId).all();
    const seenByB = await pgEventLog(db, b.ctx.tenantId).all();
    expect(seenByA).toHaveLength(1);
    expect(seenByB).toHaveLength(1);
    expect(seenByA[0]!.detail?.question).toBe("is A's question recorded?");
    expect(seenByB[0]!.detail?.question).toBe("is B's question recorded?");
  });
});

describe("an event commits with the writes it describes, or not at all", () => {
  /**
   * The atomicity choice, exercised the way `domain-graph.test.ts` exercises a
   * `23505`: inject the failure deterministically rather than race two
   * connections, which this backend cannot reliably support.
   *
   * Before every verb was wrapped in `inTransaction`, the event was written
   * after the closure returned — so a verb that failed *after* its writes would
   * have left an event describing work that was rolled back.
   */
  test("a verb that throws leaves no event", async () => {
    const { graph, ctx, write } = await surfaceFor("labkit");
    const log = pgEventLog(db, ctx.tenantId);

    const realCreateEdge = graph.createEdge.bind(graph);
    graph.createEdge = (async (from: string, edge: string, to: string) => {
      if (edge === "MOTIVATES") throw new Error("injected: MOTIVATES failed");
      return realCreateEdge(from as never, edge as never, to as never);
    }) as typeof graph.createEdge;

    await expect(write.openEnquiry("does anything survive?")).rejects.toThrow(/injected/);
    graph.createEdge = realCreateEdge;

    expect(await log.all()).toEqual([]);
  });

  /**
   * The residue guard, which is one line in `inTransaction`'s `finally`.
   *
   * A verb that throws never reaches its `emit`, so the ids it minted are still
   * in `TenantGraph`'s buffer. Without the clear, the *next* verb's event would
   * claim to have created records that no longer exist — a false statement in
   * an audit log, which is the worst kind of thing to have in one.
   */
  test("after a failure, the next event claims only its own records", async () => {
    const { graph, ctx, write } = await surfaceFor("labkit");
    const log = pgEventLog(db, ctx.tenantId);

    const realCreateEdge = graph.createEdge.bind(graph);
    graph.createEdge = (async (from: string, edge: string, to: string) => {
      if (edge === "MOTIVATES") throw new Error("injected: MOTIVATES failed");
      return realCreateEdge(from as never, edge as never, to as never);
    }) as typeof graph.createEdge;
    await expect(write.openEnquiry("the one that fails")).rejects.toThrow(/injected/);
    graph.createEdge = realCreateEdge;

    const question = await write.pose("the one that succeeds");
    const [event] = await log.all();
    expect(event!.created).toEqual([question]);
  });
});

describe("the log answers what the graph cannot", () => {
  /**
   * **Why `created` exists at all**, on the verb that proves it.
   *
   * `closeEnquiry` mints a `Decision` and emits against the *enquiry*, because
   * that is what the researcher was doing. Six verbs mint a Decision and only
   * `amendDesign` names it as the subject — so "which act created this
   * decision?" is unanswerable from `subject` for five of the six, and
   * answerable from `created` for all of them.
   */
  test("an act is found by what it created, not only by what it was about", async () => {
    const { graph, ctx, write } = await surfaceFor("labkit");
    const log = pgEventLog(db, ctx.tenantId);
    const enquiry = await write.openEnquiry("does the coating hold?");
    await write.closeEnquiry({ enquiry });

    const decisions = await graph.query(
      `MATCH (d:Decision) RETURN d`,
      { d: (await import("../src/db/cypher")).vertexProps<{ natural_id: string }>() },
    );
    const decision = decisions[0]!.d.natural_id;

    // Not the subject of any event...
    const bySubject = await log.select({ touching: decision });
    expect(bySubject.map((e) => e.subject)).not.toContain(decision);
    // ...but found anyway, because `touching` looks at `created` too.
    expect(bySubject.map((e) => e.operation)).toEqual(["closeEnquiry"]);
  });

  /**
   * `seq` is the order, and this is the case that makes it necessary rather
   * than tidy: a frozen clock stamps every event with one instant, so `at`
   * cannot separate two acts. Most of the suite runs exactly that clock.
   */
  test("seq orders two events a frozen clock stamps identically", async () => {
    const { ctx, write } = await surfaceFor("labkit");
    const log = pgEventLog(db, ctx.tenantId);
    await write.pose("first");
    await write.pose("second");

    const events = await log.all();
    expect(events.map((e) => e.at)).toEqual([clock.now(), clock.now()]); // indistinguishable...
    expect(events.map((e) => e.detail?.question)).toEqual(["first", "second"]); // ...but ordered.
    expect(events[0]!.seq!).toBeLessThan(events[1]!.seq!);

    // And `since` pages from one, which is what makes seq a cursor.
    expect(await log.select({ since: events[0]!.seq! })).toHaveLength(1);
  });
});
