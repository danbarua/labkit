#!/usr/bin/env bun
/**
 * Rebuilds a graph from the museum's events, into a tenant of its own.
 *
 *   LABKIT_DB_URL=… bun scripts/db/project-museum.ts <tenant> [--simplify]
 *
 * `--simplify` rewrites each EdgeCreated as it goes: the labels that are one relation
 * spelled several ways collapse to one, and what differed becomes an edge property.
 * The graph it builds is deliberately not one this application can read.
 */

import { readFileSync } from "node:fs";
import { Client } from "pg";
import { type OpenOptions, openRecord } from "@labkit/core-domain";

const [tenant, ...rest] = process.argv.slice(2);
if (!tenant) {
  console.error("usage: project-museum.ts <tenant> [--simplify]");
  process.exit(2);
}
const simplify = rest.includes("--simplify");

interface Change {
  change: string;
  id?: string;
  label?: string;
  props?: Record<string, unknown>;
  from?: string;
  to?: string;
  after?: Record<string, unknown>;
}

const acts = JSON.parse(
  readFileSync(`${process.env.HOME}/labkit-museum-events.json`, "utf8"),
) as Array<{ seq: number; changes: Change[] }>;

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
  IN_LIGHT_OF_CLAIM: { label: "BASED_ON", prop: "kind", value: "in-light-of" },
  RESTS_ON: { label: "BASED_ON", prop: "kind", value: "drawn-from" },
};

const record = await openRecord({ tenant } as unknown as OpenOptions);

// Edges go in through Cypher, not `createEdge`, because `createEdge` validates against
// EDGE_SCHEMA and the collapsed labels are deliberately not in it. That refusal is the
// application working; this script is asking what the graph would look like without it.
const raw = new Client({ connectionString: process.env.LABKIT_DB_URL });
await raw.connect();
await raw.query("SET search_path = ag_catalog, public");
const ws = (await raw.query("SELECT graph_name FROM public.tenants WHERE slug = $1", [tenant]))
  .rows[0].graph_name as string;
const ensured = new Set<string>();
const cypherEdge = async (
  from: string,
  label: string,
  to: string,
  props?: Record<string, string>,
) => {
  if (!ensured.has(label)) {
    try {
      await raw.query("SELECT ag_catalog.create_elabel($1, $2)", [ws, label]);
    } catch {}
    ensured.add(label);
  }
  const setProps = props
    ? `{${Object.entries(props)
        .map(([k, v]) => `${k}: '${v}'`)
        .join(", ")}}`
    : "";
  await raw.query(
    `SELECT *
         FROM ag_catalog.cypher('${ws}', $$
             MATCH (a {natural_id: '${from}'}), (b {natural_id: '${to}'})
                                    CREATE (a)-[:${label} ${setProps}]->(b)
                                    $$) AS (v ag_catalog.agtype)`,
  );
};
const graph = record.graph as unknown as {
  createNode(label: string, props: Record<string, unknown>, id?: string): Promise<unknown>;
  createEdge(
    from: string,
    label: string,
    to: string,
    props?: Record<string, string | number | boolean | number[]>,
    skip?: boolean,
  ): Promise<unknown>;
  setNodeProperty(id: string, key: string, value: unknown): Promise<void>;
  setEdgeProperty(id_from: string, id_to: string, key: string, value: unknown): Promise<void>;
};

let nodes = 0;
let edges = 0;
let sets = 0;
let collapsed = 0;
const labelsSeen = new Set<string>();

try {
  for (const act of acts) {
    for (const c of act.changes) {
      if (c.change === "NodeCreated") {
        await graph.createNode(c.label!, c.props ?? {}, c.id);
        nodes++;
      } else if (c.change === "EdgeCreated") {
        const rule = simplify ? COLLAPSE[c.label!] : undefined;
        const label = rule?.label ?? c.label!;
        const props = rule ? { [rule.prop]: rule.value } : undefined;
        if (rule) collapsed++;
        labelsSeen.add(label);
        await cypherEdge(c.from!, label, c.to!, props as Record<string, string> | undefined);
        edges++;
      } else if (c.change === "NodePropsChanged" || c.change === "PropsChanged") {
        for (const [k, v] of Object.entries(c.after ?? {})) {
          await graph.setNodeProperty(c.id!, k, v);
          sets++;
        }
      } else if (c.change === "EdgePropsChanged") {
        for (const [k, v] of Object.entries(c.after ?? {})) {
          await graph.setEdgeProperty(c.from!, c.to!, k, v);
          sets++;
        }
      }
    }
  }
} finally {
  await record.close();
  await raw.end();
}

console.log(
  `${tenant}: ${acts.length} acts -> ${nodes} nodes, ${edges} edges (${collapsed} collapsed), ${sets} property sets`,
);
console.log(`edge labels in the graph: ${labelsSeen.size}`);
console.log([...labelsSeen].sort().join(" "));
