#!/usr/bin/env bun
/**
 * Rebuilds a tenant from the museum's acts: the events first, then the graph off the events.
 *
 *   LABKIT_DB_URL=… bun scripts/db/project-museum.ts <tenant>
 *
 * Each act is recorded through the same sink every write verb uses, so the database numbers
 * it and the graph is a projection of what was stored, not of the file. The acts file was
 * recorded when four edge labels were not the verb's word; those are rewritten before they
 * are recorded, so the stored events speak the schema's labels.
 */

import { readFileSync } from "node:fs";
import { Client } from "pg";
import { connectDb } from "@labkit/core-db/connect";
import type { GraphChange } from "@labkit/core-db/domain";
import { TenantGraph } from "@labkit/core-db/graph";
import { scopeToTenant } from "@labkit/core-db/scoped";
import { resolveTenantContext } from "@labkit/core-db/tenant";
import { pgEventLog } from "@labkit/core-domain/event-store";
import type { DomainEvent } from "@labkit/core-domain/events";
import { applyDelta } from "@labkit/core-domain/projection";

const [tenant] = process.argv.slice(2);
if (!tenant) {
  console.error("usage: project-museum.ts <tenant>");
  process.exit(2);
}
const url = process.env.LABKIT_DB_URL;
if (!url) {
  console.error("LABKIT_DB_URL names the database this writes to");
  process.exit(2);
}

type Act = Omit<DomainEvent, "changes"> & { changes: GraphChange[] };
const acts = JSON.parse(
  readFileSync(
    process.env.LABKIT_MUSEUM_EVENTS ?? `${process.env.HOME}/labkit-museum-events.json`,
    "utf8",
  ),
) as Act[];

/** The labels the acts file carries that the schema no longer spells that way. */
const VERB_WORD: Record<string, string> = {
  PROMOTES: "CONFIRMED", // is confirmed
  DEFERS: "ACCEPTS", // accept
  NARROWS: "SHARPENS", // sharpen
  RESTS_ON: "BASED_ON", // synthesise
  CHANGES: "SUPERSEDES", // amend: the old criterion stays, invalid, its replacement beside it
  RESOLVES: "CLOSES", // close
};
const verbWord = (change: GraphChange): GraphChange =>
  change.change === "EdgeCreated" && VERB_WORD[change.label]
    ? { ...change, label: VERB_WORD[change.label] as typeof change.label }
    : change;

// The tenant is rebuilt from nothing: its graph, its workspace row and its tenant row go.
const admin = new Client({ connectionString: url });
await admin.connect();
await admin.query("SET search_path = ag_catalog, public");
const existing = await admin.query<{ id: number; graph_name: string }>(
  "SELECT id, graph_name FROM public.tenants WHERE slug = $1",
  [tenant],
);
for (const t of existing.rows) {
  await admin.query("SELECT * FROM ag_catalog.drop_graph($1, true)", [t.graph_name]);
  await admin.query("DELETE FROM public.__workspace WHERE tenant_id = $1", [t.id]);
  await admin.query("DELETE FROM public.tenants WHERE id = $1", [t.id]);
  console.log(`dropped tenant ${tenant} (${t.graph_name})`);
}

const connection = await connectDb();
const ctx = await resolveTenantContext(connection.db, connection.tx, tenant);
await scopeToTenant(connection.db, ctx);
const events = pgEventLog(connection.db, ctx);
const graph = new TenantGraph(ctx, connection.db, connection.tx);

try {
  // 1. The events, numbered by the database.
  let recorded = 0;
  for (const act of acts) {
    const changes = act.changes.map(verbWord);
    await events.record({
      at: act.at,
      attribution: act.attribution,
      operation: act.operation,
      subject: act.subject,
      changes,
      command: act.command,
      reconstructedFrom: act.reconstructedFrom,
    });
    recorded++;
  }
  console.log(`${tenant}: recorded ${recorded} acts`);

  // 2. The graph, off what was stored.
  const stored = await events.all();
  let nodes = 0;
  let edges = 0;
  let sets = 0;
  const labels = new Set<string>();
  for (const event of stored) {
    for (const change of event.changes) {
      await applyDelta(graph, { ...event, changes: [change] });
      if (change.change === "NodeCreated") nodes++;
      else if (change.change === "EdgeCreated") {
        edges++;
        labels.add(change.label);
      } else sets++;
    }
  }
  console.log(
    `${tenant}: projected ${stored.length} events -> ${nodes} nodes, ${edges} edges, ${sets} property sets`,
  );
  console.log(`edge labels: ${labels.size}: ${[...labels].sort().join(" ")}`);
} finally {
  await connection.close();
  await admin.end();
}
