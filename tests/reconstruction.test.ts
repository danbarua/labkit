/**
 * An act read off a document, and one performed, told apart.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb, type TestClient, type TestDb } from "./helpers/db";
import { resolveTenantContext } from "../src/db/tenant";
import { TenantGraph } from "../src/db/graph";
import { WriteSurface, domainEvent, inMemoryEventLog, type Clock } from "../src/domain";
import { pgEventLog } from "../src/domain/event-store";
import { commandContext, mockGitContext, mockSessionContext } from "../src/attribution";
import { renderHappened } from "../src/cli/views/events";
import { PLAIN } from "../src/cli/palette";

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

const clock: Clock = { now: () => "2026-09-08T09:00:00.000Z" };
const PAPER = "Ito et al. 2024, fig. 3";

const graphFor = async (slug = "labkit") => {
  const ctx = await resolveTenantContext(db, db.tx, slug);
  return { ctx, graph: new TenantGraph(ctx, db, db.tx) };
};

describe("a reconstruction says what it was read off", () => {
  test("an act recorded from a source carries it; one recorded without does not", async () => {
    const { graph } = await graphFor();
    const events = inMemoryEventLog();

    await new WriteSurface(graph, { clock, events, reconstructedFrom: PAPER }).pose({
      question: "does the coating slow corrosion?",
    });
    await new WriteSurface(graph, { clock, events }).pose({
      question: "is the solver faster?",
    });

    expect((await events.all()).map((e) => e.reconstructedFrom)).toEqual([PAPER, null]);
  });

  /**
   * `null` is *nobody said*, not *this was witnessed*. Nothing can observe that an act was
   * watched, so there is no positive value for the other side and the absence is one fact.
   */
  test("the source survives the process that wrote it", async () => {
    const { ctx, graph } = await graphFor();
    const context = commandContext(mockGitContext, mockSessionContext, clock);
    await new WriteSurface(graph, {
      ...context,
      events: pgEventLog(db, ctx.tenantId),
      reconstructedFrom: PAPER,
    }).pose({ question: "does the coating slow corrosion?" });

    const other = await testDb.openClient();
    try {
      const there = await resolveTenantContext(other, other.tx, "labkit");
      const seen = await pgEventLog(other, there.tenantId).all();
      expect(seen.map((e) => e.reconstructedFrom)).toEqual([PAPER]);
    } finally {
      await other.close();
    }
  });

  test("`labkit happened` shows which acts were read off something", () => {
    const act = (seq: number, reconstructedFrom: string | null) =>
      domainEvent({
        seq,
        at: "2026-09-08T09:00:00.000Z",
        attribution: {
          attribution_label: "dan",
          attribution_id: "dan",
          attribution_how: "observed",
          git_hash: "",
        },
        operation: "pose",
        subject: `Q_${seq}`,
        command: { question: "does the coating slow corrosion?" },
        reconstructedFrom,
      });

    const rendered = renderHappened({ acts: [act(1, PAPER), act(2, null)], more: false }, PLAIN);
    const lines = rendered.split("\n").filter((l) => l.includes("read off"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(PAPER);
  });
});
