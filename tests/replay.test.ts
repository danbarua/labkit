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
import { replayIntoScratch } from "../fragments/replay";

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
  const { question } = await w.pose({ question: "does the mechanism work" });
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

  const result = await replayIntoScratch(history);

  expect(result.refusedAt).toBeUndefined();
  expect(result.provenance.size).toBe(history.length);
});

test("a corrupted edge is refused, not silently accepted", async () => {
  const { graph, history, connection } = await realHistory();
  connections.push(connection);

  // The real `pursue` event's `MOTIVATES` edge, pointed at a question that
  // was never posed. Nothing compares this event to anything: the projection
  // simply cannot apply it, because `createEdge` matches both endpoints and
  // one is not there. That is the whole of what a replay can refuse now, and
  // it is a stronger check than the old comparison — a corrupted change fails
  // where a corrupted *command* might merely have produced something else.
  const pursueEvent = history[1]!;
  const corrupted: DomainEvent[] = history.map((e, i) =>
    i === 1
      ? {
          ...e,
          changes: e.changes.map((c) => (c.change === "EdgeCreated" ? { ...c, from: "Q_999" } : c)),
        }
      : e,
  );

  const result = await replayIntoScratch(corrupted);

  expect(result.refusedAt).toBeDefined();
  expect(result.refusedAt?.operation).toBe("pursue");
  expect(result.refusedAt?.seq).toBe(pursueEvent.seq);
  // The step before the divergence still gets its snapshot; nothing after it does.
  expect(result.provenance.has(history[0]!.seq!)).toBe(true);
  expect(result.provenance.has(pursueEvent.seq!)).toBe(false);
});

/**
 * **The property that replaced "no decoder for this operation".**
 *
 * Replay applies each event's changes rather than reissuing its command, so it
 * never dispatches on the operation at all. A verb added tomorrow replays with
 * no replay support written for it, and a *retired* one replays without a rule
 * saying what it became — which is what `fragments/decode.ts` and its
 * `RetiredOperation` table existed to provide.
 */
test("an operation nothing knows about replays on its changes alone", async () => {
  const { history, connection } = await realHistory();
  connections.push(connection);

  const unknown: DomainEvent[] = history.map((e) => ({
    ...e,
    operation: "aVerbFromTheFuture" as DomainEvent["operation"],
  }));

  const result = await replayIntoScratch(unknown);

  expect(result.refusedAt).toBeUndefined();
  expect(result.provenance.size).toBe(history.length);
});
