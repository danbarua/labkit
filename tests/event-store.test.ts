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
import { setupTestDb, type TestClient, type TestDb } from "./helpers/db";
import { resolveTenantContext } from "../src/db/tenant";
import { TenantGraph } from "../src/db/graph";
import { WriteSurface, UNATTRIBUTED, inMemoryEventLog, type Clock } from "../src/domain";
import { pgEventLog } from "../src/domain/event-store";

let testDb: TestDb;
let db: TestClient;

beforeAll(async () => {
  testDb = await setupTestDb();
});
afterAll(async () => {
  await testDb.close();
});
beforeEach(async () => {
  db = await testDb.openClient();
});
afterEach(async () => {
  await testDb.reset();
  await db.close();
});

/** Frozen on purpose — several of these turn on `at` being unable to order anything. */
const clock: Clock = { now: () => "2026-08-25T09:00:00.000Z" };

const surfaceFor = async (slug: string) => {
  const ctx = await resolveTenantContext(db, db.tx, slug);
  const graph = new TenantGraph(ctx, db, db.tx);
  return {
    graph,
    ctx,
    write: new WriteSurface(graph, {
      clock,
      events: pgEventLog(db, ctx.tenantId),
    }),
  };
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
    const { question } = await write.pose("does the coating hold?");

    const other = await testDb.openClient();
    try {
      const ctx = await resolveTenantContext(other, other.tx, "labkit");
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

    const { question } = await write.pose("the one that succeeds");
    const [event] = await log.all();
    expect(event!.created).toEqual([question]);
  });

  /**
   * The same guard, for the other buffer.
   *
   * **It must fail on a verb whose failing edge is not its first**, and the
   * obvious choice is wrong: `openEnquiry` mints `MOTIVATES` and nothing else,
   * so injecting there leaves an empty buffer and the assertion below holds
   * whether or not anything clears it. That version was written, run against a
   * removed clear, and passed — a check that cannot fail.
   *
   * `recordAnalysis` writes eight edges. Failing on `SUPPORTS`, the last,
   * leaves seven in the buffer at the throw.
   */
  test("after a failure, the next event claims only its own edges", async () => {
    const { graph, ctx, write } = await surfaceFor("labkit");
    const log = pgEventLog(db, ctx.tenantId);
    const { enquiry } = await write.openEnquiry("the one that fails");
    const { observations: raw } = await write.recordObservations({
      enquiry,
      name: "panel-a",
      finding: "120 panels",
    });

    const realCreateEdge = graph.createEdge.bind(graph);
    graph.createEdge = (async (from: string, edge: string, to: string) => {
      if (edge === "SUPPORTS") throw new Error("injected: SUPPORTS failed");
      return realCreateEdge(from as never, edge as never, to as never);
    }) as typeof graph.createEdge;
    await expect(
      write.recordAnalysis({
        enquiry,
        method: "regression",
        from: [raw],
        concludes: [{ proposition: "it holds", finding: "no failures" }],
      }),
    ).rejects.toThrow(/injected/);
    graph.createEdge = realCreateEdge;

    // `pose` connects nothing, so the only way this is non-empty is residue
    // from the six edges the failed analysis had already written.
    await write.pose("the one that succeeds");
    const events = await log.select({ operation: "pose" });
    expect(events.at(-1)!.edges).toEqual([]);
  });
});

describe("the two sinks answer one filter the same way", () => {
  /**
   * **`since` returned nothing from the in-memory sink, for every value.**
   *
   * `matches` reads `(e.seq ?? 0) > f.since`, and nothing assigned a `seq`, so
   * every event scored 0 and every cursor filtered everything out —
   * while `pgEventLog` answered the same call correctly. Two implementations
   * of one interface disagreeing, and the only `since` test in the suite used
   * the other one, which is why it stood.
   *
   * No database: the point is the sink, and reaching for one would hide which
   * half is under test.
   */
  test("in-memory: since is a cursor, not a filter that empties the log", async () => {
    const log = inMemoryEventLog();
    const ev = (subject: string) => ({
      at: "2026-08-28T00:00:00.000Z",
      attribution: UNATTRIBUTED,
      operation: "pose" as const,
      subject,
      created: [],
      edges: [],
    });
    await log.record(ev("Q_1"));
    await log.record(ev("Q_2"));
    await log.record(ev("Q_3"));

    const all = await log.all();
    expect(all.map((e) => e.seq)).toEqual([1, 2, 3]);

    // The assertion that was false: every one of these returned 0.
    expect(await log.select({ since: 0 })).toHaveLength(3);
    expect(await log.select({ since: 1 })).toHaveLength(2);
    expect(await log.select({ since: 3 })).toHaveLength(0);
  });
});

describe("an event records the edges the act created", () => {
  /**
   * **The asymmetry this closed.** `createNode` pushed to a buffer from the day
   * the collector was written; `createEdge` pushed to nothing. So an act's
   * nodes were visible in the log and what connected them was not —
   * `recordAnalysis` writes five nodes and eight edges, and reported zero.
   *
   * Asserted on the compound verb rather than a one-edge one, because the
   * single-edge case passes under a collector that only ever remembers the
   * last write.
   */
  test("recordAnalysis reports every edge, not only its nodes", async () => {
    const { ctx, write } = await surfaceFor("labkit");
    const log = pgEventLog(db, ctx.tenantId);
    const { enquiry } = await write.openEnquiry("does the coating hold?");
    const { observations: raw } = await write.recordObservations({
      enquiry,
      name: "panel-a",
      finding: "120 panels, 90 days",
    });
    await write.recordAnalysis({
      enquiry,
      method: "regression",
      from: [raw],
      concludes: [{ proposition: "the coating holds", finding: "no failures at 90 days" }],
    });

    const [analysis] = await log.select({ operation: "recordAnalysis" });
    // `string[]`, not `EdgeLabel[]`: the expectation below is a literal list
    // and unifying the two on the branded union buys nothing here.
    const labels: string[] = (analysis!.edges ?? []).map((e) => e.label);
    labels.sort();

    // Every one of these is written by `recorded()` and none appears in
    // `detail`, which carries the enquiry and the method.
    //
    // **Two `PRODUCES`, and which two is the point of writing the list out.**
    // The computation's artefact, and `EvidenceUnit -> Artefact` — which
    // CLAUDE.md names as this repository's one endpoint pair with a writer and
    // no reader, and which was invisible to the event log until this column
    // existed.
    //
    // The third `PRODUCES` was here until #173 and has moved, along with
    // `RECORDED_IN` and `SUPPORTS`, to the `conclude` event asserted below.
    // That is the split working: those three are minted by concluding, which
    // is its own act. **A nested emit used to take the edges above with it**,
    // leaving this event reporting a computation and nothing produced by it —
    // see `TenantGraph.inMintScope`, and note that this test is what found it.
    expect(labels).toEqual(["ADDRESSES", "CONSUMES", "PRODUCES", "PRODUCES", "USES"].sort());

    // The other half, and it is the half that makes the assertion above a
    // split rather than a loss: every edge is still recorded, by the act that
    // made it.
    const [drawn] = await log.select({ operation: "conclude" });
    // `string[]`, for the same reason the list above is: the expectation is a
    // literal and unifying it on the branded union buys nothing.
    const drawnLabels: string[] = (drawn!.edges ?? []).map((e) => e.label);
    expect(drawnLabels.sort()).toEqual(["PRODUCES", "RECORDED_IN", "SUPPORTS"].sort());

    // Endpoints, not just labels: a collector that recorded the label and lost
    // the pair would satisfy the assertion above.
    const consumes = analysis!.edges!.find((e) => e.label === "CONSUMES");
    expect(consumes!.to).toBe(raw);
  });

  /**
   * An act that connects nothing says so, and `[]` is not `null`.
   *
   * The column is nullable for one population — rows written before the
   * collector existed — and this is what stops that meaning leaking onto rows
   * written after it.
   */
  test("an act that connects nothing records an empty list, not an absent one", async () => {
    const { ctx, write } = await surfaceFor("labkit");
    const log = pgEventLog(db, ctx.tenantId);
    await write.pose("does the coating hold?");

    const [event] = await log.all();
    expect(event!.edges).toEqual([]);
    expect(event!.edges).not.toBeUndefined();
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
    const { enquiry } = await write.openEnquiry("does the coating hold?");
    await write.closeEnquiry({ enquiry });

    const decisions = await graph.query(`MATCH (d:Decision) RETURN d`, {
      d: (await import("../src/db/cypher")).vertexProps<{
        natural_id: string;
      }>(),
    });
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
