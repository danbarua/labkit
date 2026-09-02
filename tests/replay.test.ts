/**
 * `replayIntoScratch()` must refuse a divergence rather than serve derived
 * state that only looks plausible — the whole safety argument in
 * `fragments/replay.ts`'s header. This asserts the refusal path directly,
 * against a corrupted event no decoder bug is needed to produce.
 *
 * A real, freshly provisioned database, not the suite's shared one
 * (`tests/helpers/db.ts`): natural ids are a global sequence across that
 * shared instance, so a second test's fixture would not start at `Q_1` the
 * way `replayIntoScratch`'s own scratch database always does, and every
 * step would diverge for a reason that has nothing to do with the
 * mechanism under test.
 *
 * **`connectScratch`, not `connectDb`, and that is what this file is about
 * as much as the replay is.** `connectDb` reads `LABKIT_DB_URL` before it
 * reads the directory, so under `bun run test:pg` the "fresh" database above
 * was the suite's shared Postgres — the fixture started at `Q_90`, the
 * scratch at `Q_1`, and the mechanism under test was blamed.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectScratch, type LabKitDBConnection } from "../src/db/connect";
import { resolveTenantContext } from "../src/db/tenant";
import { scopeToTenant } from "../src/db/scoped";
import { TenantGraph } from "../src/db/graph";
import { WriteSurface, inMemoryEventLog, systemClock, type DomainEvent } from "../src/domain";
import { fetchNodeProps, replayIntoScratch } from "../fragments/replay";

const home = mkdtempSync(join(tmpdir(), "labkit-replay-test-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));

/** One small, real history — pose then pursue — in a fresh tenant of its own. */
async function realHistory(): Promise<{
  graph: TenantGraph;
  history: DomainEvent[];
  connection: LabKitDBConnection;
}> {
  const dir = mkdtempSync(join(home, "run-"));
  const connection = await connectScratch(dir);
  const ctx = await resolveTenantContext(connection.db, connection.tx, "labkit");
  await scopeToTenant(connection.db, ctx);
  const graph = new TenantGraph(ctx, connection.db, connection.tx);
  const events = inMemoryEventLog();
  const w = new WriteSurface(graph, { clock: systemClock, events });
  const { question } = await w.pose("does the mechanism work");
  await w.pursue({ question, approach: "check it end to end" });
  const history = [...(await events.all())].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  return { graph, history, connection };
}

let connections: LabKitDBConnection[] = [];
beforeAll(() => {
  connections = [];
});
afterAll(async () => {
  for (const c of connections) await c.close();
});

test("a genuine history replays clean, with no refusal", async () => {
  const { graph, history, connection } = await realHistory();
  connections.push(connection);
  const nodeProps = await fetchNodeProps(graph, history);

  const result = await replayIntoScratch(history, nodeProps);

  expect(result.refusedAt).toBeUndefined();
  expect(result.provenance.size).toBe(history.length);
});

test("a corrupted edge is refused, not silently accepted", async () => {
  const { graph, history, connection } = await realHistory();
  connections.push(connection);
  const nodeProps = await fetchNodeProps(graph, history);

  // The real `pursue` event's `MOTIVATES` edge, pointed at a question that
  // was never posed. `replayIntoScratch` calls the very same decoder either
  // way — what differs is the comparison this event is checked against.
  const pursueEvent = history[1]!;
  const corrupted: DomainEvent[] = history.map((e, i) =>
    i === 1 ? { ...e, edges: [{ ...pursueEvent.edges[0]!, from: "Q_999" }] } : e,
  );

  const result = await replayIntoScratch(corrupted, nodeProps);

  expect(result.refusedAt).toBeDefined();
  expect(result.refusedAt?.operation).toBe("pursue");
  expect(result.refusedAt?.seq).toBe(pursueEvent.seq);
  // The step before the divergence still gets its snapshot; nothing after it does.
  expect(result.provenance.has(history[0]!.seq!)).toBe(true);
  expect(result.provenance.has(pursueEvent.seq!)).toBe(false);
});

test("an operation with no decoder is refused by name", async () => {
  const { graph, history, connection } = await realHistory();
  connections.push(connection);
  const nodeProps = await fetchNodeProps(graph, history);

  const unknown: DomainEvent[] = [
    { ...history[0]!, operation: "notAnOperation" as DomainEvent["operation"] },
  ];

  const result = await replayIntoScratch(unknown, nodeProps);

  expect(result.refusedAt?.reason).toContain("no decoder");
});
