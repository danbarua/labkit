/**
 * The event stream is a write-ahead log for a graph store, and this shows it
 * rather than asserting it.
 *
 * `GraphChange` says a node was created, an edge was created, properties
 * changed. Nothing in that vocabulary is AGE's: fed the same stream in the
 * same order, a `Map` reaches the same state the graph does. The projector
 * below is thirty lines, touches no Cypher and holds no `TenantGraph` — if it
 * agrees with what AGE built from the same acts, then a second store is a
 * second `Projector` and no change to a verb.
 *
 * **Not a shipped consumer.** Nothing reads this projection; it exists to make
 * the claim falsifiable, which is why it lives in a test rather than in
 * `src/`.
 */

import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, test } from "bun:test";
import {
  ResearchSession,
  WriteSurface,
  createdIn,
  inMemoryEventLog,
  type Clock,
  type DomainEvent,
  type EventSink,
} from "../src/domain";
import {
  graphProjector,
  type IdSource,
  type Projector,
  UnitOfWork,
} from "../src/domain/projection";
import { openScenario, type Scenario } from "./helpers/scenario";
import { scalar, vertexProps } from "../src/db/cypher";
import type { TenantGraph } from "../src/db/graph";

/** The whole of a graph store, for a projector that has no store. */
interface Projected {
  nodes: Map<string, { label: string; props: Record<string, unknown> }>;
  edges: Set<string>;
}

/**
 * A graph store in a `Map`. Every change kind, and nothing else.
 *
 * `PropsChanged` merges rather than replaces, which is what
 * `TenantGraph.setNodeProperty` does one key at a time — a projector that
 * replaced the object would diverge the first time `is` confirmed a claim.
 */
function inMemoryProjector(): { projector: Projector; state: Projected } {
  const state: Projected = { nodes: new Map(), edges: new Set() };
  const projector: Projector = {
    apply: async (event: DomainEvent) => {
      for (const change of event.changes) {
        switch (change.change) {
          case "NodeCreated":
            state.nodes.set(change.id, { label: change.label, props: { ...change.props } });
            break;
          case "EdgeCreated":
            state.edges.add(`${change.from}|${change.label}|${change.to}`);
            break;
          case "PropsChanged": {
            const node = state.nodes.get(change.id);
            if (node) Object.assign(node.props, change.props);
            break;
          }
        }
      }
    },
  };
  return { projector, state };
}

/**
 * What AGE holds for a named set of handles, in the same two shapes.
 *
 * **Scoped to the handles the stream mentions**, not `MATCH (n)` over the whole
 * tenant. The unscoped version passed on PGlite and failed under
 * `bun run test:pg`, where a connection sees what another file committed to the
 * same tenant graph -- it was asserting test isolation, not projection. What is
 * compared is whether the two projections of *these acts* agree.
 */
async function fromTheGraph(graph: TenantGraph, ids: string[]): Promise<Projected> {
  const nodes = new Map<string, { label: string; props: Record<string, unknown> }>();
  if (ids.length === 0) return { nodes, edges: new Set() };
  const rows = await graph.query(
    `MATCH (n) WHERE n.natural_id IN $ids RETURN n, label(n) AS label`,
    {
      n: vertexProps<Record<string, unknown> & { natural_id: string }>(),
      label: scalar<string>(),
    },
    { ids },
  );
  for (const row of rows) {
    const { natural_id, ...props } = row.n;
    nodes.set(natural_id, { label: row.label, props });
  }
  const edgeRows = await graph.query(
    `MATCH (a)-[r]->(b) WHERE a.natural_id IN $ids OR b.natural_id IN $ids
     RETURN a, b, type(r) AS via`,
    {
      a: vertexProps<{ natural_id: string }>(),
      b: vertexProps<{ natural_id: string }>(),
      via: scalar<string>(),
    },
    { ids },
  );
  const edges = new Set(edgeRows.map((r) => `${r.a.natural_id}|${r.via}|${r.b.natural_id}`));
  return { nodes, edges };
}

let scenario: Scenario;
let graph: TenantGraph;
let events: EventSink;
let tick = 0;
const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 8, 5, 17, tick++)).toISOString(),
};

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  tick = 0;
  graph = await scenario.begin();
  events = inMemoryEventLog();
});
afterEach(async () => {
  await scenario.end();
});

describe("the event stream is a write-ahead log for a graph store", () => {
  test("a projector with no graph reaches the same state AGE does", async () => {
    const { projector, state } = inMemoryProjector();
    const session = new ResearchSession(graph, {
      clock,
      events,
      // Both, from the one stream: AGE, and a Map that has never heard of it.
      projectors: [graphProjector(graph), projector],
    });

    // A real arc, not a single node: two questions, an analysis, a conclusion,
    // a criterion evaluated, a claim confirmed in place, an enquiry closed.
    // Every change kind is exercised — `is` is what produces `PropsChanged`.
    const { enquiry, question } = await session.openEnquiry("does the coating hold?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "60-day panel",
      finding: "no failures at 60 days",
    });
    const { analysis } = await session.recordAnalysis({
      enquiry,
      method: "accelerated ageing",
      from: [observations],
    });
    const { claims } = await session.conclude({
      analysis,
      proposition: "the coating holds",
      finding: "0 of 40 failed",
    });
    await session.is({
      claim: claims[0]!.claim,
      state: "confirmed",
      because: "the prespecified check passed",
    });
    await session.closeEnquiry({ enquiry, answeredBy: claims[0]!.claim });
    void question;

    const age = await fromTheGraph(graph, [...state.nodes.keys()]);

    // Same nodes, by handle and by label.
    expect([...state.nodes.keys()].sort()).toEqual([...age.nodes.keys()].sort());
    for (const [id, node] of state.nodes)
      expect({ id, label: node.label }).toEqual({ id, label: age.nodes.get(id)!.label });

    // Same edges, by endpoint and type.
    expect([...state.edges].sort()).toEqual([...age.edges].sort());

    // And the property `is` set in place, which is the change kind a projector
    // that only handled creations would silently drop.
    const confirmed = state.nodes.get(claims[0]!.claim)!;
    expect(confirmed.props.kind).toBe("confirmatory");
  });

  test("staging needs an id source, not a graph", async () => {
    // The command half of the pipeline touches no store. A counter is a valid
    // `IdSource`, which is the whole claim `naturalIds` narrowed the coupling
    // to — before it, a `UnitOfWork` held a `TenantGraph` to reach one number.
    let n = 0;
    const counter: IdSource = { reserve: async (label) => `${label}_${++n}` };
    const unitOfWork = new UnitOfWork(counter);

    const asked = await unitOfWork.node("Question", { name: "does it hold?", posed_at: "t" });
    const pursued = await unitOfWork.node("LineOfEnquiry", { name: "check it" });
    unitOfWork.edge(asked, "MOTIVATES", pursued);

    expect(unitOfWork.delta()).toEqual([
      {
        change: "NodeCreated",
        id: "Question_1",
        label: "Question",
        props: { name: "does it hold?", posed_at: "t" },
      },
      {
        change: "NodeCreated",
        id: "LineOfEnquiry_2",
        label: "LineOfEnquiry",
        props: { name: "check it" },
      },
      { change: "EdgeCreated", from: "Question_1", label: "MOTIVATES", to: "LineOfEnquiry_2" },
    ]);
  });

  test("the graph is a subscriber: with none, an act writes an event and no state", async () => {
    // The inverse of the first test, and what makes it mean anything. If the
    // verb still wrote to the graph inline, this would pass with state in it.
    const write = new WriteSurface(graph, { clock, events, projectors: [] });
    await write.pose({ question: "recorded, never projected" });

    const [recorded] = await events.all();
    expect(recorded!.operation).toBe("pose");
    // The handle the act minted: the event names it, and the graph does not
    // have it, because nothing was subscribed to put it there.
    const minted = createdIn(recorded!);
    expect(minted).toHaveLength(1);
    expect((await fromTheGraph(graph, minted)).nodes.size).toBe(0);
  });
});
