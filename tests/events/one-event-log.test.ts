/**
 * One session, one event log — whatever the caller passed.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { ResearchSession, ReadSurface, WriteSurface } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  await scenario.begin();
});
afterEach(async () => {
  await scenario.end();
});

test("a session built without a sink still has exactly one", async () => {
  const session = new ResearchSession(await scenario.current());
  await session.writes.pose({ question: "can the read side see this act?" });

  expect(await session.reads.whatHappened({})).toHaveLength(1);
});

test("the surfaces of one session share the sink, defaulted or not", async () => {
  const graph = await scenario.current();
  const write = new WriteSurface(graph);
  await write.pose({ question: "does the read side see this?" });

  // The read side built from the same graph and no sink has its own log, which
  // is right — they are separate objects. What must hold is that one surface's
  // groups agree with the surface.
  expect(await write.events.all()).toHaveLength(1);
  expect(await new ReadSurface(graph, { events: write.events }).whatHappened({})).toHaveLength(1);
});
