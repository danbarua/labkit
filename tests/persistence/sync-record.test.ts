/**
 * A record synchronised into another database's tenant holds the same events and the same graph,
 * and a synchronisation with nothing new appends nothing.
 */

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectScratch, type LabKitDBConnection } from "@labkit/core-db/connect";
import { scalar, vertexProps } from "@labkit/core-db/cypher";
import { TenantGraph } from "@labkit/core-db/graph";
import { resolveTenantContext, type TenantContext } from "@labkit/core-db/tenant";
import { WriteSurface, type Clock } from "@labkit/core-domain";
import { pgEventLog } from "@labkit/core-domain/event-store";
import { syncEvents } from "../../scripts/db/sync-record";

let tick = 0;
const clock: Clock = { now: () => new Date(Date.UTC(2026, 9, 2, 9, tick++)).toISOString() };

/** One tenant of one embedded database: its event log, its graph and a write surface. */
async function tenantOf(connection: LabKitDBConnection, slug: string) {
  const ctx: TenantContext = await resolveTenantContext(connection.db, connection.tx, slug);
  const graph = new TenantGraph(ctx, connection.db, connection.tx);
  const events = pgEventLog(connection.db, ctx);
  return { ctx, graph, events, write: new WriteSurface(graph, { clock, events }) };
}

/** Every node with its label and properties, and every edge, in a fixed order. */
async function wholeGraph(graph: TenantGraph) {
  const nodes = await graph.query(`MATCH (n) RETURN n, label(n) AS label`, {
    n: vertexProps<Record<string, unknown> & { natural_id: string }>(),
    label: scalar<string>(),
  });
  const edges = await graph.query(
    `MATCH (a)-[r]->(b) RETURN a.natural_id AS a, type(r) AS via, b.natural_id AS b`,
    { a: scalar<string>(), via: scalar<string>(), b: scalar<string>() },
  );
  return {
    nodes: nodes
      .map((row) => ({ label: row.label, ...row.n }))
      .sort((x, y) => x.natural_id.localeCompare(y.natural_id)),
    edges: edges.map((row) => `${row.a} ${row.via} ${row.b}`).sort(),
  };
}

test("a synchronised tenant holds the source's events and graph, and a repeat appends nothing", async () => {
  const sourceDir = mkdtempSync(join(tmpdir(), "labkit-sync-src-"));
  const targetDir = mkdtempSync(join(tmpdir(), "labkit-sync-dst-"));
  const from = await connectScratch(sourceDir);
  const to = await connectScratch(targetDir);
  try {
    const source = await tenantOf(from, "labkit");
    const target = await tenantOf(to, "synced");

    const { question } = await source.write.pose({ question: "does the coating hold?" });
    // A write that rolls back has still taken its number: this leaves a gap in the source.
    await from.db.query(`SELECT nextval('"${source.ctx.graphName}".labkit_natural_id_seq')`);
    await source.write.note({ text: `${question} was asked twice`, on: question });

    const first = await syncEvents(await source.events.all(), target);
    expect(first.present).toBe(0);
    expect(first.appended).toHaveLength(2);

    const sourceEvents = await source.events.all();
    const targetEvents = await target.events.all();
    expect(sourceEvents.map((e) => e.seq)).toEqual([1, 3]);
    expect(targetEvents.map((e) => e.seq)).toEqual([1, 2]);
    expect(targetEvents.map((e) => e.subject)).toEqual(["Q_1", "NOTE_3"]);
    expect(targetEvents.map(({ seq: _, ...act }) => act)).toEqual(
      sourceEvents.map(({ seq: _, ...act }) => act),
    );
    expect(await wholeGraph(target.graph)).toEqual(await wholeGraph(source.graph));

    const again = await syncEvents(await source.events.all(), target);
    expect(again.present).toBe(2);
    expect(again.appended).toHaveLength(0);
    expect(await target.events.all()).toHaveLength(2);

    await source.write.openEnquiry("is the coating's failure the primer?");
    const after = await syncEvents(await source.events.all(), target);
    expect(after.present).toBe(2);
    expect(after.appended.map((e) => e.subject)).toEqual(["LOE_4"]);
    expect(await wholeGraph(target.graph)).toEqual(await wholeGraph(source.graph));
  } finally {
    await from.close();
    await to.close();
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
  }
}, 60_000);
