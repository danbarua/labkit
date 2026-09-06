/**
 * `traceOf` must not disagree with the events it reads — `fragments/trace.ts`'s
 * own header claims a step in a trace cannot disagree with the code, because
 * nothing in it is typed by hand, and this is the assertion that backs that up.
 *
 * A real `WriteSurface` against a real graph, not a hand-built event list:
 * `created`/`edges` come off `DomainEvent.changes`, and a fixture assembled by
 * hand would only prove `traceOf` agrees with itself.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { createdIn, edgesIn, inMemoryEventLog, WriteSurface, type EventSink } from "../src/domain";
import type { TenantGraph } from "../src/db/graph";
import { openScenario, type Scenario } from "./helpers/scenario";
import { traceOf } from "../fragments/trace";

let scenario: Scenario;
let graph: TenantGraph;
let events: EventSink;
let w: WriteSurface;

beforeAll(async () => {
  scenario = await openScenario();
});
beforeEach(async () => {
  graph = await scenario.begin();
  events = inMemoryEventLog();
  w = new WriteSurface(graph, { events });
});
afterEach(async () => {
  await scenario.end();
});
afterAll(async () => {
  await scenario.close();
});

test("one step per event, in seq order", async () => {
  const { question } = await w.pose({ question: "does the mechanism hold?" });
  const { enquiry } = await w.pursue({ question, approach: "read the trace back" });
  await w.recordObservations({
    enquiry,
    name: "first-pass",
    finding: "it does",
    contentHash: "sha256:deadbeef",
  });

  const history = await events.all();
  expect(history).toHaveLength(3);

  const trace = await traceOf("t", events);
  expect(trace.steps).toHaveLength(3);
  const expectedSeqs = [...history].map((e) => e.seq ?? 0).sort((a, b) => a - b);
  expect(trace.steps.map((s) => s.seq)).toEqual(expectedSeqs);
  expect(trace.steps.map((s) => s.operation)).toEqual(["pose", "pursue", "recordObservations"]);
});

test("a step's created and edges are exactly what the event's own changes say", async () => {
  const { question } = await w.pose({ question: "does the mechanism hold?" });
  const { enquiry } = await w.pursue({ question, approach: "read the trace back" });
  await w.recordObservations({
    enquiry,
    name: "first-pass",
    finding: "it does",
    contentHash: "sha256:deadbeef",
  });

  const history = [...(await events.all())].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const trace = await traceOf("t", events);

  // recordObservations is the interesting step here: multiple nodes, multiple
  // edges, exactly the case the mockup this replaced got wrong by guessing.
  expect(history).toHaveLength(3);
  for (const [i, event] of history.entries()) {
    const step = trace.steps[i]!;
    expect(step.created.map((c) => c.handle)).toEqual(createdIn(event));
    expect(step.edges).toEqual(edgesIn(event));
  }
  const observationsStep = trace.steps[2]!;
  expect(observationsStep.created.length).toBeGreaterThan(1);
  expect(observationsStep.edges.length).toBeGreaterThan(1);
});
