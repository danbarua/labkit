/**
 * Properties on an edge, and the one way to change them.
 *
 * `createEdge` treats `(from, label, to)` as identity and a repeat as a no-op, so an edge
 * cannot be re-created with new properties. Every other mutation path is addressed by a node
 * id, which an edge does not have.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { setupTestDb, type TestClient, type TestDb } from "../helpers/db";
import { resolveTenantContext } from "@labkit/core-db/tenant";
import { TenantGraph } from "@labkit/core-db/graph";
import { optional, scalar } from "@labkit/core-db/cypher";
import { applyDelta, snapshotPriorValues, UnitOfWork } from "@labkit/core-domain/projection";
import { domainEvent, UNATTRIBUTED } from "@labkit/core-domain";

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

const graphFor = async (slug: string) => {
  const ctx = await resolveTenantContext(db, db.tx, slug);
  return new TenantGraph(ctx, db, db.tx);
};

/** A criterion governing a gate — the pair #440 wants to carry a stored state. */
const governs = async (graph: TenantGraph) => {
  const criterion = await graph.createNode("Criterion", { proposition: "the split is real" });
  const gate = await graph.createNode("Gate", { consequence: "no third mechanism until M1 lands" });
  await graph.createEdge(criterion.natural_id, "GOVERNS", gate.natural_id);
  return { criterion: criterion.natural_id, gate: gate.natural_id };
};

const event = (changes: ReturnType<UnitOfWork["delta"]>) =>
  domainEvent({
    at: "2026-09-17T09:00:00.000Z",
    attribution: UNATTRIBUTED,
    operation: "evaluateCriterion",
    subject: "CRIT_1",
    command: {} as never,
    changes,
  });

const stateOf = async (graph: TenantGraph, from: string, to: string) => {
  const rows = await graph.query(
    `MATCH (:Criterion {natural_id: $from})-[r:GOVERNS]->(:Gate {natural_id: $to})
     RETURN r.state AS state, r.at AS at`,
    { state: optional(scalar<string>()), at: optional(scalar<string>()) },
    { from, to },
  );
  return rows[0];
};

test("a property set on an edge reads back", async () => {
  const graph = await graphFor("edge-props");
  const { criterion, gate } = await governs(graph);

  expect((await stateOf(graph, criterion, gate))?.state).toBeNull();
  await graph.setEdgeProperties(criterion, "GOVERNS", gate, {
    state: "passed",
    at: "2026-09-16T13:00:00.000Z",
  });
  expect(await stateOf(graph, criterion, gate)).toEqual({
    state: "passed",
    at: "2026-09-16T13:00:00.000Z",
  });
});

test("setting again overwrites, which re-creating the edge cannot do", async () => {
  const graph = await graphFor("edge-overwrite");
  const { criterion, gate } = await governs(graph);

  await graph.setEdgeProperties(criterion, "GOVERNS", gate, { state: "failed" });
  // The repeat `createEdge` a caller would reach for first: a no-op by contract.
  await graph.createEdge(criterion, "GOVERNS", gate, { state: "passed" });
  expect((await stateOf(graph, criterion, gate))?.state).toBe("failed");

  await graph.setEdgeProperties(criterion, "GOVERNS", gate, { state: "passed" });
  expect((await stateOf(graph, criterion, gate))?.state).toBe("passed");
});

test("an edge that is not there refuses rather than writing nothing quietly", async () => {
  const graph = await graphFor("edge-missing");
  const { criterion, gate } = await governs(graph);
  const other = await graph.createNode("Gate", { consequence: "somewhere else" });

  await expect(
    graph.setEdgeProperties(criterion, "GOVERNS", other.natural_id, { state: "passed" }),
  ).rejects.toThrow(/to set properties on/);
  expect((await stateOf(graph, criterion, gate))?.state).toBeNull();
});

test("a shape the graph does not hold is refused before any Cypher runs", async () => {
  const graph = await graphFor("edge-shape");
  const { criterion, gate } = await governs(graph);
  await expect(
    graph.setEdgeProperties(gate, "GOVERNS", criterion, { state: "passed" }),
  ).rejects.toThrow(/not a shape this graph holds/);
});

test("the change travels through an event's delta like every other change", async () => {
  const graph = await graphFor("edge-delta");
  const { criterion, gate } = await governs(graph);

  const unitOfWork = new UnitOfWork();
  unitOfWork.setEdge(criterion, "GOVERNS", gate, { state: "satisfied" });
  const event = domainEvent({
    at: "2026-09-16T13:00:00.000Z",
    attribution: UNATTRIBUTED,
    operation: "evaluateCriterion",
    subject: criterion,
    command: {} as never,
    changes: unitOfWork.delta(),
  });

  await applyDelta(graph, event);
  expect((await stateOf(graph, criterion, gate))?.state).toBe("satisfied");
});

/**
 * `undo` puts back what an act replaced. The change carries what the graph held when it
 * ran, so taking it back is writing that value again — and a key the edge did not hold
 * before is removed.
 */
test("undo restores an edge property to what it held", async () => {
  const ctx = await resolveTenantContext(db, db.tx, "edge-undo");
  const graph = new TenantGraph(ctx, db, db.tx);
  const { criterion, gate } = await governs(graph);
  await graph.setEdgeProperties(criterion, "GOVERNS", gate, { state: "failed" });

  const unitOfWork = new UnitOfWork();
  unitOfWork.setEdge(criterion, "GOVERNS", gate, { state: "satisfied" });
  const changes = await snapshotPriorValues(graph, unitOfWork.delta());
  expect(changes[0]).toMatchObject({ before: { state: "failed" }, after: { state: "satisfied" } });

  await applyDelta(graph, event(changes));
  expect((await stateOf(graph, criterion, gate))?.state).toBe("satisfied");

  // What `undo` stages, applied: the prior value, written again.
  const takingBack = new UnitOfWork();
  takingBack.setEdge(criterion, "GOVERNS", gate, { state: "failed" });
  await applyDelta(graph, event(takingBack.delta()));
  expect((await stateOf(graph, criterion, gate))?.state).toBe("failed");
});

test("a property the edge never held is removed, not restored to nothing", async () => {
  const ctx = await resolveTenantContext(db, db.tx, "edge-undo-absent");
  const graph = new TenantGraph(ctx, db, db.tx);
  const { criterion, gate } = await governs(graph);

  const unitOfWork = new UnitOfWork();
  unitOfWork.setEdge(criterion, "GOVERNS", gate, { state: "satisfied" });
  const changes = await snapshotPriorValues(graph, unitOfWork.delta());
  // Absent, not null: "there was no value" and "the value was null" undo differently.
  expect(changes[0]).toMatchObject({ before: {} });
});
