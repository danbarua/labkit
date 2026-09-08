/**
 * The durable event log, and the six things about it that could break quietly.
 */

import { createdIn, edgesIn } from "../src/domain/events";
import type { DomainEvent, GraphChange } from "../src/domain/events";
import type { PoseCommand } from "../src/domain/commands";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb, type TestClient, type TestDb } from "./helpers/db";
import { resolveTenantContext } from "../src/db/tenant";
import { TenantGraph } from "../src/db/graph";
import { WriteSurface, UNATTRIBUTED, inMemoryEventLog, type Clock } from "../src/domain";
import { pgEventLog } from "../src/domain/event-store";
import { recordAnalysis } from "./helpers/analysis";

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
   * The whole point, stated as the thing the in-memory sink could not do. A second connection
   * is the closest this harness gets to a second process: it shares no JavaScript state with
   * the first, so anything it can read came out of Postgres.
   */
  test("an event written through one connection is readable through another", async () => {
    const { write } = await surfaceFor("labkit");
    const { question } = await write.pose({ question: "does the coating hold?" });

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
   */
  test("two tenants do not see each other's events", async () => {
    const a = await surfaceFor("tenant-a");
    const b = await surfaceFor("tenant-b");
    await a.write.pose({ question: "is A's question recorded?" });
    await b.write.pose({ question: "is B's question recorded?" });

    const seenByA = await pgEventLog(db, a.ctx.tenantId).all();
    const seenByB = await pgEventLog(db, b.ctx.tenantId).all();
    expect(seenByA).toHaveLength(1);
    expect(seenByB).toHaveLength(1);
    expect((seenByA[0]!.command as PoseCommand).question).toBe("is A's question recorded?");
    expect((seenByB[0]!.command as PoseCommand).question).toBe("is B's question recorded?");
  });
});

describe("an event commits with the writes it describes, or not at all", () => {
  /**
   * The atomicity choice, exercised the way `domain-graph.test.ts` exercises a `23505`: inject
   * the failure deterministically rather than race two connections, which this backend cannot
   * reliably support.
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

    const { question } = await write.pose({ question: "the one that succeeds" });
    const [event] = await log.all();
    expect(createdIn(event!)).toEqual([question]);
  });

  /**
   * The same guard, for the other buffer.
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
      recordAnalysis(write, {
        enquiry,
        method: "regression",
        from: [raw],
        concludes: [{ proposition: "it holds", finding: "no failures" }],
      }),
    ).rejects.toThrow(/injected/);
    graph.createEdge = realCreateEdge;

    // `pose` connects nothing, so the only way this is non-empty is residue
    // from the six edges the failed analysis had already written.
    await write.pose({ question: "the one that succeeds" });
    const events = await log.select({ operation: "pose" });
    expect(edgesIn(events.at(-1)!)).toEqual([]);
  });
});

describe("the two sinks answer one filter the same way", () => {
  /**
   * **`since` returned nothing from the in-memory sink, for every value.**
   */
  test("in-memory: since is a cursor, not a filter that empties the log", async () => {
    const log = inMemoryEventLog();
    const ev = (subject: string) => ({
      at: "2026-08-28T00:00:00.000Z",
      attribution: UNATTRIBUTED,
      operation: "pose" as const,
      subject,
      command: { question: "does it hold?" },
      changes: [],
      reconstructedFrom: null,
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
   * **The asymmetry this closed.** `createNode` pushed to a buffer from the day the collector
   * was written; `createEdge` pushed to nothing.
   */
  /**
   * The log names the act the caller performed.
   */
  test("a verb emits its own name", async () => {
    const { ctx, write } = await surfaceFor("labkit");
    const log = pgEventLog(db, ctx.tenantId);
    const { enquiry } = await write.openEnquiry("does the coating hold?");
    const { observations } = await write.recordObservations({
      enquiry,
      name: "panel-a",
      finding: "120 panels, 90 days",
    });
    const { analysis } = await write.recordAnalysis({
      enquiry,
      method: "regression",
      from: [observations],
    });
    const kept = await write.conclude({
      analysis,
      proposition: "the coating holds",
      finding: "no failures at 90 days",
    });
    await write.conclude({
      analysis,
      proposition: "the primer holds",
      finding: "no failures at 60 days",
    });
    const { review } = await write.recordReview({ of: analysis, verdict: "wrong scale" });

    await write.keep({
      keeping: [kept.claims[0]!.claim],
      because: review,
      method: "corrected scale",
    });

    expect(await log.select({ operation: "keep" })).toHaveLength(1);
    expect(await log.select({ operation: "replaceAnalysis" })).toHaveLength(0);
  });

  /**
   * The log says what standing a conclusion was recorded with, and what a promotion moved.
   */
  test("standing is on the conclusion, and a promotion says what it moved", async () => {
    const { ctx, write } = await surfaceFor("labkit");
    const log = pgEventLog(db, ctx.tenantId);
    const { enquiry } = await write.openEnquiry("does the coating hold?");
    const { observations } = await write.recordObservations({
      enquiry,
      name: "panel-a",
      finding: "120 panels",
    });
    const { analysis } = await write.recordAnalysis({
      enquiry,
      method: "regression",
      from: [observations],
    });

    const exploratory = await write.conclude({
      analysis,
      proposition: "the coating holds",
      finding: "no failures at 90 days",
    });
    await write.conclude({
      analysis,
      proposition: "the primer holds",
      finding: "no failures at 60 days",
      standing: "confirmatory",
    });

    // Per conclusion, since the array is the record of what was concluded.
    const standingIn = (e: DomainEvent): string | undefined => {
      const claim = e.changes.find(
        (c): c is Extract<GraphChange, { change: "NodeCreated"; label: "Claim" }> =>
          c.change === "NodeCreated" && c.label === "Claim",
      );
      return claim?.props.kind;
    };
    const [first, second] = await log.select({ operation: "conclude" });
    expect(standingIn(first!)).toBe("exploratory");
    expect(standingIn(second!)).toBe("confirmatory");

    await write.is({
      state: "confirmed" as const,
      claim: exploratory.claims[0]!.claim,
      because: "the prespecified check passed",
    });
    const [promoted] = await log.select({ operation: "is" });
    // The act's own words, and the change it made: `is <claim> confirmed`
    // sets `kind` in place, and the delta is what carries that.
    expect(promoted!.command).toMatchObject({ state: "confirmed" });
    expect(promoted!.changes).toContainEqual({
      change: "PropsChanged",
      id: exploratory.claims[0]!.claim,
      props: { kind: "confirmatory" },
    });
  });

  test("recordAnalysis reports every edge, not only its nodes", async () => {
    const { ctx, write } = await surfaceFor("labkit");
    const log = pgEventLog(db, ctx.tenantId);
    const { enquiry } = await write.openEnquiry("does the coating hold?");
    const { observations: raw } = await write.recordObservations({
      enquiry,
      name: "panel-a",
      finding: "120 panels, 90 days",
    });
    await recordAnalysis(write, {
      enquiry,
      method: "regression",
      from: [raw],
      concludes: [{ proposition: "the coating holds", finding: "no failures at 90 days" }],
    });

    const [analysis] = await log.select({ operation: "recordAnalysis" });
    // `string[]`, not `EdgeLabel[]`: the expectation below is a literal list
    // and unifying the two on the branded union buys nothing here.
    const labels: string[] = edgesIn(analysis!).map((e) => e.label);
    labels.sort();

    // Every one of these is written by `recorded()` and none appears in the command, which
    // carries the enquiry and the method. **Two `PRODUCES`, and which two is the point of
    // writing the list out.** The computation's artefact, and `EvidenceUnit -> Artefact`, which
    // no read reaches — the event log is the only place it is visible.
    expect(labels).toEqual(["ADDRESSES", "CONSUMES", "PRODUCES", "PRODUCES", "USES"].sort());

    // The other half, which makes the assertion above a split rather than a
    // loss: every edge is recorded, by the act that made it.
    const [drawn] = await log.select({ operation: "conclude" });
    // `string[]`, for the same reason the list above is: the expectation is a
    // literal and unifying it on the branded union buys nothing.
    const drawnLabels: string[] = edgesIn(drawn!).map((e) => e.label);
    expect(drawnLabels.sort()).toEqual(["PRODUCES", "RECORDED_IN", "SUPPORTS"].sort());

    // Endpoints, not just labels: a collector that recorded the label and lost
    // the pair would satisfy the assertion above.
    const consumes = edgesIn(analysis!).find((e) => e.label === "CONSUMES");
    expect(consumes!.to).toBe(raw);
  });

  /**
   * An act that connects nothing says so, and `[]` is not `null`.
   */
  test("an act that connects nothing records an empty list, not an absent one", async () => {
    const { ctx, write } = await surfaceFor("labkit");
    const log = pgEventLog(db, ctx.tenantId);
    await write.pose({ question: "does the coating hold?" });

    const [event] = await log.all();
    expect(edgesIn(event!)).toEqual([]);
    expect(event!.changes).not.toBeUndefined();
  });
});

describe("the log answers what the graph cannot", () => {
  /**
   * **Why `created` exists at all**, on the verb that proves it.
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
    await write.pose({ question: "first" });
    await write.pose({ question: "second" });

    const events = await log.all();
    expect(events.map((e) => e.at)).toEqual([clock.now(), clock.now()]); // indistinguishable...
    expect(events.map((e) => (e.command as PoseCommand).question)).toEqual(["first", "second"]); // ...but ordered.
    expect(events[0]!.seq!).toBeLessThan(events[1]!.seq!);

    // And `since` pages from one, which is what makes seq a cursor.
    expect(await log.select({ since: events[0]!.seq! })).toHaveLength(1);
  });
});
