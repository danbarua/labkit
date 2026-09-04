/**
 * The spike's question: is an event a delta?
 *
 * `pose` and `closeEnquiry` book their ids, state what they are about to do,
 * record it, and only then write. If the recorded delta is complete, applying
 * it to an empty graph reproduces what the verb produced — and nothing has to
 * read the original record to do it.
 *
 * The other nineteen verbs still write first and drain afterwards. They are
 * out of the spike.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { ResearchSession, WriteSurface, inMemoryEventLog, UNATTRIBUTED } from "../src/domain";
import type { DomainEvent, EventSink } from "../src/domain";
import { applyDelta } from "../src/domain/projection";
import { openScenario, type Scenario } from "./helpers/scenario";
import { TenantGraph } from "../src/db/graph";
import { resolveTenantContext } from "../src/db/tenant";
import { setupTestDb } from "./helpers/db";
import { vertexProps, edgeProps } from "../src/db/cypher";

let scenario: Scenario;
let graph: TenantGraph;
let events: EventSink;
let session: ResearchSession;

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { events });
});
afterEach(async () => {
  await scenario.end();
});

/**
 * Every node and edge in a graph, **properties included**.
 *
 * Ids alone are not enough and that was found rather than reasoned: with only
 * ids compared, dropping `props` from the applier left every test green. The
 * delta's whole claim is that it carries what the node is made of.
 */
async function contents(g: TenantGraph): Promise<{ nodes: string[]; edges: string[] }> {
  const nodes = await g.query(`MATCH (n) RETURN n`, { n: vertexProps<Identified>() }, {});
  const edges = await g.query(
    `MATCH (a)-[r]->(b) RETURN a, b, r`,
    { a: vertexProps<Identified>(), b: vertexProps<Identified>(), r: edgeProps<object>() },
    {},
  );
  return {
    nodes: nodes.map((r) => JSON.stringify(sorted(r.n))).sort(),
    edges: edges.map((r) => `${r.a.natural_id}->${r.b.natural_id}`).sort(),
  };
}

/** Key order is not part of a node's identity; the values are. */
const sorted = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

type Identified = Record<string, unknown> & { natural_id: string };

/** A second, genuinely empty tenant — `begin()` always resolves the same one. */
async function emptyGraph(): Promise<TenantGraph> {
  const db = await (await setupTestDb()).openClient("spike-projection");
  const ctx = await resolveTenantContext(db, db.tx, "spike-projection");
  return new TenantGraph(ctx, db, db.tx);
}

test("pose books its id and names it in the event before the node exists", async () => {
  const { question, events: recorded } = await session.pose({
    question: "does the pruning schedule move convergence?",
  });

  const posed = recorded[0]!;
  expect(posed.changes).toEqual([
    {
      change: "NodeCreated",
      id: question,
      label: "Question",
      props: { name: "does the pruning schedule move convergence?", posed_at: expect.any(String) },
    },
  ]);
});

test("closeEnquiry states the decision and both its edges", async () => {
  const { enquiry, question } = await session.openEnquiry("does it hold?");
  const { decision, events: recorded } = await session.closeEnquiry({ enquiry });

  const closed = recorded[0]!;
  expect(closed.changes.map((c) => c.change)).toEqual(["NodeCreated", "EdgeCreated"]);
  expect(closed.changes[0]).toMatchObject({ id: decision, label: "Decision" });
  expect(closed.changes[1]).toEqual({
    change: "EdgeCreated",
    from: decision,
    label: "RESOLVES",
    to: question,
  });
});

test("the delta applied to an empty graph rebuilds the node, properties and all", async () => {
  const { question } = await session.pose({ question: "does it hold?" });
  const history = await events.all();

  // Nothing reads the original record: the events are the only input.
  const fresh = await emptyGraph();
  for (const event of history) await applyDelta(fresh, event as DomainEvent);

  // **Asserted against literal values, not against the original graph.**
  // Comparing the two would put `applyDelta` on both sides — dropping `props`
  // from it then broke both equally and the comparison still passed, which a
  // control caught.
  const rebuilt = await fresh.query(
    `MATCH (n:Question {natural_id: $id}) RETURN n`,
    { n: vertexProps<Identified & { name: string; posed_at: string }>() },
    { id: question },
  );
  expect(rebuilt).toHaveLength(1);
  expect(rebuilt[0]!.n.name).toBe("does it hold?");
  expect(rebuilt[0]!.n.posed_at).toBeTruthy();
});

test("a property set in place is carried by the delta and applied from it", async () => {
  const { question } = await session.pose({ question: "does it hold?" });
  const history = await events.all();

  const fresh = await emptyGraph();
  for (const event of history) await applyDelta(fresh, event as DomainEvent);

  // A property change applied from nothing but the event.
  await applyDelta(fresh, {
    at: new Date().toISOString(),
    attribution: UNATTRIBUTED,
    operation: "pose",
    subject: question,
    command: { question: "and now it says this" },
    changes: [{ change: "PropsChanged", id: question, props: { name: "and now it says this" } }],
  });

  const after = await fresh.query(
    `MATCH (n:Question {natural_id: $id}) RETURN n`,
    { n: vertexProps<Identified & { name: string }>() },
    { id: question },
  );
  expect(after[0]!.n.name).toBe("and now it says this");
});

test("a refused close writes nothing, because nothing was written before the refusal", async () => {
  const { enquiry } = await session.openEnquiry("does it hold?");
  await session.closeEnquiry({ enquiry });
  const before = await contents(graph);

  await expect(session.closeEnquiry({ enquiry })).rejects.toThrow(/already closed/);

  expect(await contents(graph)).toEqual(before);
});

test("a verb that refuses leaves no delta for the next event to claim", async () => {
  const { enquiry } = await session.openEnquiry("does it hold?");
  await session.closeEnquiry({ enquiry });
  await expect(session.closeEnquiry({ enquiry })).rejects.toThrow();

  const { question, events: recorded } = await session.pose({ question: "and this one?" });
  expect(recorded[0]!.changes.map((c) => (c.change === "NodeCreated" ? c.id : ""))).toEqual([
    question,
  ]);
});

test("an emitted event carries the operation the caller invoked", async () => {
  const surface = new WriteSurface(graph, { events });
  await surface.pose({ question: "which verb was this?" });

  const [posed] = await events.all();
  expect(posed!.operation).toBe("pose");
});
