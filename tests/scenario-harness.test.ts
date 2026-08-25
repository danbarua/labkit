/**
 * The scenario harness itself, under the one condition that used to break it.
 *
 * The suite's intermittent `graph "labkit_t1" does not exist` and
 * `Connection terminated unexpectedly` bursts were a **teardown cascade**, not
 * the pglite-socket defect they were twice attributed to (`docs/TASKS.md`).
 * bun's fixed 5000ms per-test timeout does not cancel the test body: an
 * overrunning test keeps executing while the next one starts, and its late
 * `scenario.end()` used to reset the database and close a connection that by
 * then belonged to the live test.
 *
 * **The overrun is the trigger; the cascade is the defect.** This file tests
 * the defect and not the trigger, so it needs no six-second sleep and no
 * deliberately failing test: interleaving `begin()` and `end()` by hand
 * reproduces exactly the ordering bun produces, in milliseconds.
 *
 * It was demonstrated the other way round first — a scratch file with a test
 * that really did sleep past the ceiling — because a hand-interleaved test
 * proves the harness survives *this ordering*, and only the real one proves
 * that this ordering is what bun actually produces. Before the fix that
 * scratch file gave 0 pass / 2 fail / 1 unhandled error; after it, the second
 * test passes and the error is gone.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { vertexProps } from "../src/db/cypher";
import { openScenario, type Scenario } from "./helpers/scenario";

let scenario: Scenario;
beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});

const posed = { posed_at: "2026-01-01T00:00:00.000Z" };
const questions = async (graph: Awaited<ReturnType<Scenario["begin"]>>) =>
  (
    await graph.query(`MATCH (q:Question) RETURN q`, {
      q: vertexProps<{ name: string }>(),
    })
  )
    .map((r) => r.q.name)
    .sort();

test("a late end() from an abandoned test cannot touch the live test", async () => {
  // Abandoned: begins, writes, and does not reach its end() yet.
  const abandoned = await scenario.begin();
  await abandoned.createNode("Question", { name: "abandoned", ...posed });

  // The next test starts while that body is still running.
  const live = await scenario.begin();
  await live.createNode("Question", { name: "live", ...posed });

  // ...and only now does the abandoned test tear down. This is the exact
  // ordering bun produces on a timeout, and it used to reset the database and
  // close `live`'s connection.
  await scenario.end();

  // The live test still has its connection, its graph, and its own rows. It is
  // *not* isolated from the abandoned test's writes -- nothing reset between
  // the two begins, because the abandoned test never reached its `end()`. That
  // is a real limitation and it is the smaller one: before, the live test did
  // not survive at all.
  expect(await questions(live)).toContain("live");
  await scenario.end();
});

test("an abandoned predecessor is cleaned up by the next begin(), not by its own end()", async () => {
  const abandoned = await scenario.begin();
  await abandoned.createNode("Question", { name: "leftover", ...posed });

  // No end() for it. The next test starts, finds a connection still open, and
  // resets for itself -- the one case where `begin()` pays for a reset.
  const next = await scenario.begin();
  expect(await questions(next)).toEqual([]);

  await scenario.end();
  await scenario.end();
});

test("an ordinary test starts clean, without paying for a reset on the way in", async () => {
  // The previous test's rows are gone because its `end()` reset -- which runs
  // in `afterEach`, outside bun's per-test timeout, so it costs this test's
  // 5000ms budget nothing. Moving that reset to `begin()` was tried and
  // reverted; see tests/helpers/scenario.ts.
  const graph = await scenario.begin();
  expect(await questions(graph)).toEqual([]);
  await graph.createNode("Question", { name: "mine", ...posed });
  expect(await questions(graph)).toEqual(["mine"]);
  await scenario.end();
});
