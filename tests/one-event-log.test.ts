/**
 * One session, one event log — whatever the caller passed.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { ResearchSession, ReadSurface, WriteSurface } from "../src/domain";
import { openScenario, type Scenario } from "./helpers/scenario";

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

/**
 * `SessionCore` defaults `events` to a fresh `inMemoryEventLog()`, and every sub-surface used to
 * take that default separately: `handling` recorded into the write surface's log while `undo`
 * read the revising group's, which was empty. Both shipped adapters pass a sink, so this never
 * reached a user — it only bit a caller who constructed a session without one.
 */
test("a session built without a sink still has exactly one, and `undo` can see it", async () => {
  const session = new ResearchSession(await scenario.current());
  const { events } = await session.pose({ question: "can undo see its own event?" });

  const undone = await session.undo({ event: events[0]!.seq!, because: "a duplicate" });
  expect(undone.retracted.length).toBeGreaterThan(0);
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
