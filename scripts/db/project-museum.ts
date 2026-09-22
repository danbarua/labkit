#!/usr/bin/env bun
/**
 * Rebuilds a tenant from the museum's acts: the events first, then the graph off the events.
 *
 *   LABKIT_DB_URL=… bun scripts/db/project-museum.ts <tenant> [--simplify]
 *
 * Each act is recorded through the same sink every write verb uses, so the database numbers
 * it and the graph is a projection of what was stored, not of the file. `--simplify` rewrites
 * each EdgeCreated before it is recorded: the labels that are one relation spelled several
 * ways collapse to one, and what differed becomes an edge property. A simplified graph holds
 * labels the application does not know, so those edges bypass its edge validation.
 */

import { readFileSync } from "node:fs";
import { Client } from "pg";
import { connectDb } from "@labkit/core-db/connect";
import { EDGE_SCHEMA, type GraphChange } from "@labkit/core-db/domain";
import { TenantGraph } from "@labkit/core-db/graph";
import { scopeToTenant } from "@labkit/core-db/scoped";
import { resolveTenantContext } from "@labkit/core-db/tenant";
import { pgEventLog } from "@labkit/core-domain/event-store";
import type { DomainEvent } from "@labkit/core-domain/events";
import { applyDelta } from "@labkit/core-domain/projection";

const [tenant, ...rest] = process.argv.slice(2);
if (!tenant) {
  console.error("usage: project-museum.ts <tenant> [--simplify | --verbs]");
  process.exit(2);
}
const simplify = rest.includes("--simplify");
const verbs = rest.includes("--verbs");
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

/**
 * `--verbs`: an edge label is the word of the verb that wrote it. Four labels in the corpus
 * are not; every other label already is. No properties.
 */
const VERB_WORD: Record<string, string> = {
  PROMOTES: "CONFIRMED", // is confirmed
  DEFERS: "ACCEPTS", // accept
  NARROWS: "SHARPENS", // sharpen
  RESTS_ON: "BASED_ON", // synthesise, the existing word for resting on
};
const verbWord = (change: GraphChange): GraphChange =>
  change.change === "EdgeCreated" && VERB_WORD[change.label]
    ? { ...change, label: VERB_WORD[change.label] as typeof change.label }
    : change;

/** What each collapsed label becomes: one edge, and the word that used to be the label. */
const COLLAPSE: Record<string, { label: string; prop: string; value: string }> = {
  // Decision -> Claim, eight labels for one relation.
  PROMOTES: { label: "DECIDED", prop: "kind", value: "promoted" },
  GRADES: { label: "DECIDED", prop: "kind", value: "graded" },
  KEEPS: { label: "DECIDED", prop: "kind", value: "kept" },
  ANSWERS: { label: "DECIDED", prop: "kind", value: "answered" },
  IN_LIGHT_OF: { label: "DECIDED", prop: "kind", value: "in-light-of" },
  // Evidence -> Claim: a bearing, not two relations.
  SUPPORTS: { label: "BEARS_ON", prop: "bearing", value: "for" },
  CHALLENGES: { label: "BEARS_ON", prop: "bearing", value: "against" },
  // Note -> anything: how the link was found, not what it means.
  CONCERNS: { label: "NOTES", prop: "how", value: "stated" },
  MENTIONS: { label: "NOTES", prop: "how", value: "found-in-prose" },
  // Decision -> Question.
  NARROWS: { label: "RESOLVES", prop: "kind", value: "narrowed" },
  DEFERS: { label: "RESOLVES", prop: "kind", value: "deferred" },
  // The three that all mean "rests on".
  RESTS_ON: { label: "BASED_ON", prop: "kind", value: "drawn-from" },
};

const COLLAPSED = new Set(Object.values(COLLAPSE).map((r) => r.label));

let collapsed = 0;
const simplified = (change: GraphChange): GraphChange => {
  if (change.change !== "EdgeCreated") return change;
  const rule = COLLAPSE[change.label];
  if (!rule) return change;
  collapsed++;
  return {
    ...change,
    label: rule.label as typeof change.label,
    props: { ...(change.props ?? {}), [rule.prop]: rule.value },
  };
};

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

// Edges the application's schema does not know go in through Cypher on the admin
// connection. That refusal is the application working; this asks what the graph would
// look like without it.
const ensured = new Set<string>();
const foreignEdge = async (
  from: string,
  label: string,
  to: string,
  props: Record<string, unknown>,
) => {
  if (!ensured.has(label)) {
    try {
      await admin.query("SELECT ag_catalog.create_elabel($1, $2)", [ctx.graphName, label]);
    } catch {}
    ensured.add(label);
  }
  const setProps = Object.entries(props)
    .map(([k, v]) => `${k}: '${String(v).replace(/'/g, "''")}'`)
    .join(", ");
  await admin.query(
    `SELECT * FROM ag_catalog.cypher('${ctx.graphName}', $$
       MATCH (a {natural_id: '${from}'}), (b {natural_id: '${to}'})
       CREATE (a)-[:${label} {${setProps}}]->(b)
     $$) AS (v ag_catalog.agtype)`,
  );
};

try {
  // 1. The events, numbered by the database.
  let recorded = 0;
  for (const act of acts) {
    const changes = simplify
      ? act.changes.map(simplified)
      : verbs
        ? act.changes.map(verbWord)
        : act.changes;
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
  console.log(`${tenant}: recorded ${recorded} acts (${collapsed} edges collapsed)`);

  // 2. The graph, off what was stored.
  const stored = await events.all();
  let nodes = 0;
  let edges = 0;
  let sets = 0;
  const labels = new Set<string>();
  for (const event of stored) {
    for (const change of event.changes) {
      // A collapsed label is either unknown to the schema or joins a pair it does not list.
      if (
        change.change === "EdgeCreated" &&
        (!(change.label in EDGE_SCHEMA) ||
          (simplify && COLLAPSED.has(change.label)) ||
          (verbs && Object.values(VERB_WORD).includes(change.label)))
      ) {
        await foreignEdge(change.from, change.label, change.to, change.props ?? {});
      } else {
        await applyDelta(graph, { ...event, changes: [change] });
      }
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
