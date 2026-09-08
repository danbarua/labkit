/**
 * How much of a record was read off something, and which acts those were.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb, type TestClient, type TestDb } from "./helpers/db";
import { resolveTenantContext } from "../src/db/tenant";
import { TenantGraph } from "../src/db/graph";
import {
  ReadSurface,
  WriteSurface,
  inMemoryEventLog,
  type Clock,
  type EventSink,
} from "../src/domain";
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

const clock: Clock = { now: () => "2026-09-08T09:00:00.000Z" };
const PAPER = "Ito et al. 2024, fig. 3";

/**
 * Two acts read off a paper and one nobody sourced, written through one sink.
 */
async function threeActs(events: EventSink, graph: TenantGraph) {
  const off = new WriteSurface(graph, { clock, events, reconstructedFrom: PAPER });
  await off.pose({ question: "does the coating slow corrosion?" });
  await off.pose({ question: "and at temperature?" });
  await new WriteSurface(graph, { clock, events }).pose({ question: "a question asked live" });
}

const graphFor = async () => {
  const ctx = await resolveTenantContext(db, db.tx, "labkit");
  return { ctx, graph: new TenantGraph(ctx, db, db.tx) };
};

describe("which acts were read off something", () => {
  /**
   * **Both sinks, one assertion.** `inMemoryEventLog` filters in TypeScript and `pgEventLog`
   * turns the same filter into a WHERE clause; the two disagreeing on `since` is a failure this
   * repo has already had, and a filter tested through one of them is tested through neither.
   */
  for (const [name, build] of [
    ["in-memory", (_: number) => inMemoryEventLog()],
    ["durable", (tenant: number) => pgEventLog(db, tenant)],
  ] as const) {
    test(`${name}: the filter selects the transcribed acts, and its negation the rest`, async () => {
      const { ctx, graph } = await graphFor();
      const events = build(ctx.tenantId);
      await threeActs(events, graph);
      const read = new ReadSurface(graph, { events });

      const sourced = await read.whatHappened({ reconstructed: true });
      expect(sourced.map((e) => e.reconstructedFrom)).toEqual([PAPER, PAPER]);
      const rest = await read.whatHappened({ reconstructed: false });
      expect(rest.map((e) => e.reconstructedFrom)).toEqual([null]);
      // Unfiltered is still everything: a filter defaulting to one arm would
      // quietly change every existing caller's answer.
      expect(await read.whatHappened({})).toHaveLength(3);
    });
  }

  test("the count says how much of the whole record was read off something", async () => {
    const { ctx, graph } = await graphFor();
    const events = pgEventLog(db, ctx.tenantId);
    await threeActs(events, graph);

    const read = new ReadSurface(graph, { events });
    expect(await read.howMuchWasTranscribed()).toEqual({ transcribed: 2, acts: 3 });
  });

  /**
   * `now --since` narrows every section to what moved. The count must not move with it: how
   * much of a record was transcribed is a fact about the record, not about the window.
   */
  test("the count on `now` is the whole record, not the cursor's window", async () => {
    const { ctx, graph } = await graphFor();
    const events = pgEventLog(db, ctx.tenantId);
    await threeActs(events, graph);
    const read = new ReadSurface(graph, { events });

    const whole = await read.now();
    expect(whole.transcribed).toEqual({ transcribed: 2, acts: 3 });

    // A cursor past the two transcribed acts. Their absence from the sections
    // is right; their absence from the count would be a different number under
    // the same name.
    const narrowed = await read.now(2);
    expect(narrowed.transcribed).toEqual({ transcribed: 2, acts: 3 });
  });
});
