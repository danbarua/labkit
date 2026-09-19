/**
 * `touching` is asked as "what happened to this record", and two sinks answer it:
 * `inMemoryEventLog` filters in TypeScript, `pgEventLog` turns the same shape into a
 * WHERE clause. One test over both, because a test per sink passes while they disagree.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { setupTestDb, type TestClient, type TestDb } from "./helpers/db";
import { resolveTenantContext } from "../packages/core-db/tenant";
import { TenantGraph } from "../packages/core-db/graph";
import { inMemoryEventLog, domainEvent, UNATTRIBUTED } from "../packages/core-domain";
import type { DomainEvent, EventSink, GraphChange } from "../packages/core-domain/events";
import { eventFilter } from "../packages/core-domain/queries";
import { pgEventLog } from "../packages/core-domain/event-store";

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

const act = (operation: string, subject: string, changes: GraphChange[]): DomainEvent =>
  domainEvent({
    at: "2026-09-16T09:00:00.000Z",
    attribution: UNATTRIBUTED,
    operation,
    subject,
    command: {} as never,
    changes,
  });

/** One act per position `touching` has to reach, plus one it must not. */
const ACTS: DomainEvent[] = [
  act("pose", "Q_1", []),
  act("pursue", "LOE_1", [
    { change: "NodeCreated", id: "CLM_1", label: "Claim", props: {} } as GraphChange,
  ]),
  act("analyse", "COMP_1", [
    { change: "EdgeCreated", from: "COMP_1", label: "ADDRESSES", to: "LOE_1" } as GraphChange,
  ]),
  act("conclude", "COMP_2", [
    {
      change: "EdgeCreated",
      from: "EV_1",
      label: "SUPPORTS",
      to: "CLM_1",
      props: { weight: 1 },
    } as GraphChange,
  ]),
  act("undo", "COMP_3", [
    { change: "NodePropsChanged", id: "CLM_1", before: {}, after: { retracted: true } },
  ]),
  act("note", "NOTE_1", [
    { change: "NodePropsChanged", id: "NOTE_1", before: {}, after: { text: "x" } },
  ]),
  act("evaluateCriterion", "CEVAL_2", [
    {
      change: "EdgePropsChanged",
      from: "CRIT_1",
      label: "GOVERNS",
      to: "GATE_1",
      before: {},
      after: { state: "satisfied" },
    } as GraphChange,
  ]),
];

const sequenceOf = async (sink: EventSink, touching: string): Promise<string[]> => {
  const found = await sink.select(eventFilter.parse({ touching }));
  return [...found].map((e) => `${e.operation} ${e.subject}`).sort();
};

test("both sinks return the same acts for every position touching reaches", async () => {
  const ctx = await resolveTenantContext(db, db.tx, "touching");
  new TenantGraph(ctx, db, db.tx);
  const durable = pgEventLog(db, ctx.tenantId);
  const inMemory = inMemoryEventLog();
  for (const a of ACTS) {
    await durable.record(a);
    await inMemory.record(a);
  }

  for (const handle of [
    "Q_1",
    "LOE_1",
    "CLM_1",
    "EV_1",
    "NOTE_1",
    "COMP_1",
    "CRIT_1",
    "GATE_1",
    "CLM_99",
  ]) {
    expect(await sequenceOf(durable, handle)).toEqual(await sequenceOf(inMemory, handle));
  }
});

test("touching reaches an edge endpoint and a property change, not only what was minted", async () => {
  const ctx = await resolveTenantContext(db, db.tx, "touching-positions");
  new TenantGraph(ctx, db, db.tx);
  const durable = pgEventLog(db, ctx.tenantId);
  for (const a of ACTS) await durable.record(a);

  // Minted by one act, pointed at by an edge in another, retracted by a third.
  expect(await sequenceOf(durable, "CLM_1")).toEqual([
    "conclude COMP_2",
    "pursue LOE_1",
    "undo COMP_3",
  ]);
  // Reached only as an edge's `from`, and carrying edge props, which containment must ignore.
  expect(await sequenceOf(durable, "EV_1")).toEqual(["conclude COMP_2"]);
  // Both a subject and an edge's `to`, counted once.
  expect(await sequenceOf(durable, "LOE_1")).toEqual(["analyse COMP_1", "pursue LOE_1"]);
  // Reached only through a property set on an edge it is an endpoint of.
  expect(await sequenceOf(durable, "CRIT_1")).toEqual(["evaluateCriterion CEVAL_2"]);
  expect(await sequenceOf(durable, "GATE_1")).toEqual(["evaluateCriterion CEVAL_2"]);
});
