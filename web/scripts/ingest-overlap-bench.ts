#!/usr/bin/env bun
/**
 * One-shot copy of the overlap_bench PGlite graph into the overseer Postgres.
 *
 * The live source holds an exclusive PGlite lock, so this copies `.labkit` to a
 * temp dir and opens that. Dest nodes are minted with the stored natural_id so
 * Q_1 and NOTE_68 survive. Edges are raw MATCH-then-CREATE: TenantGraph.createEdge
 * refuses pairs EDGE_SCHEMA no longer allows, and the overseer copies what was
 * stored, not what current verbs permit. MERGE is not used; AGE would create an
 * edge whose start_id and end_id are both 0.
 */
import { cpSync, existsSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { pgliteBackend } from "../../src/db/backend";
import { connectDb } from "../../src/db/connect";
import { edge as edgeColumn, vertex as vertexColumn } from "../../src/db/cypher";
import { NODE_LABELS, type NodeLabel } from "../../src/db/domain";
import { TenantGraph } from "../../src/db/graph";
import { runMigrationsOnPostgres } from "../../src/db/migrate";
import { LABKIT_SCHEMA } from "../../src/db/schema";
import { resolveTenantContext } from "../../src/db/tenant";
import { validateIdentifier } from "../../src/db/agtype";

const SOURCE_LABKIT = resolve(
  process.env.LABKIT_SOURCE ?? join(import.meta.dir, "../../../08_overlap_bench/.labkit"),
);
const DEFAULT_DEST = `postgresql://postgres:agens@127.0.0.1:${process.env.LABKIT_PORT_DB ?? "5432"}/labkit`;
const TENANT = process.env.LABKIT_TENANT ?? "overlap-bench";
const WALK_START = "Q_1";
const WALK_END = "NOTE_68";

type DumpedNode = {
  label: NodeLabel;
  natural_id: string;
  props: Record<string, unknown>;
};

type DumpedEdge = {
  src: string;
  dst: string;
  rel: string;
  props: Record<string, unknown>;
};

type VertexProps = { natural_id: string } & Record<string, unknown>;

function isNodeLabel(label: string): label is NodeLabel {
  return (NODE_LABELS as readonly string[]).includes(label);
}

function databaseName(url: string): string {
  const name = new URL(url).pathname.replace(/^\//, "").split("/")[0] ?? "";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`refusing dest database name ${JSON.stringify(name)}`);
  }
  return name;
}

function numericSuffix(naturalId: string): number | undefined {
  const sep = naturalId.indexOf("_");
  if (sep === -1) return undefined;
  const n = Number(naturalId.slice(sep + 1));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

async function ensureDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  if (name === "labkit_tests" || name === "postgres") {
    throw new Error(`refusing to ingest into ${name}`);
  }
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (found.rowCount === 0) {
      // CREATE DATABASE cannot be parameterized and cannot run inside a transaction.
      await client.query(`CREATE DATABASE ${name}`);
    }
  } finally {
    await client.end();
  }
}

async function migrateDest(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await runMigrationsOnPostgres(client);
  } finally {
    await client.end();
  }
}

async function dumpSource(): Promise<{ nodes: DumpedNode[]; edges: DumpedEdge[] }> {
  const tmp = mkdtempSync(join(tmpdir(), "overlap-bench-"));
  try {
    if (!existsSync(SOURCE_LABKIT)) {
      throw new Error(`overlap_bench source not found: ${SOURCE_LABKIT}`);
    }
    cpSync(SOURCE_LABKIT, tmp, { recursive: true });
    try {
      unlinkSync(join(tmp, "pglite.lock"));
    } catch {
      // copy may not have included a lockfile
    }

    // LABKIT_DB_URL would send connectDb at Postgres; pgliteBackend ignores it,
    // but the dest URL must not be in the environment of any source helper we
    // add later. Unset for the dump, restore after.
    const previousUrl = process.env.LABKIT_DB_URL;
    delete process.env.LABKIT_DB_URL;
    const src = await pgliteBackend({
      dataDir: join(tmp, "pglite"),
      lockPath: join(tmp, "pglite.lock"),
    }).connect();
    try {
      const tenants = await src.db.query<{ slug: string }>(
        `SELECT slug FROM ${LABKIT_SCHEMA}.tenants ORDER BY id`,
      );
      if (tenants.rows.length === 0) {
        throw new Error(`source ${SOURCE_LABKIT} has no tenants`);
      }

      let slug = tenants.rows[0]!.slug;
      let graph: TenantGraph | undefined;
      for (const row of tenants.rows) {
        const ctx = await resolveTenantContext(src.db, src.tx, row.slug);
        const candidate = new TenantGraph(ctx, src.db, src.tx);
        const found = await candidate.query(
          `MATCH (n {natural_id: $id}) RETURN n`,
          { n: vertexColumn<VertexProps>() },
          { id: WALK_START },
        );
        if (found.length > 0) {
          slug = row.slug;
          graph = candidate;
          break;
        }
      }
      if (!graph) {
        const ctx = await resolveTenantContext(src.db, src.tx, slug);
        graph = new TenantGraph(ctx, src.db, src.tx);
      }

      const nodeRows = await graph.query(`MATCH (n) RETURN n`, {
        n: vertexColumn<VertexProps>(),
      });
      const nodes: DumpedNode[] = nodeRows.map((row) => {
        const { natural_id, ...props } = row.n.properties;
        if (typeof natural_id !== "string" || natural_id.length === 0) {
          throw new Error(`source vertex ${row.n.label} has no natural_id`);
        }
        if (!isNodeLabel(row.n.label)) {
          throw new Error(`unrecognized label ${row.n.label} on ${natural_id}`);
        }
        return { label: row.n.label, natural_id, props };
      });

      const edgeRows = await graph.query(`MATCH (a)-[r]->(b) RETURN a, b, r`, {
        a: vertexColumn<VertexProps>(),
        b: vertexColumn<VertexProps>(),
        r: edgeColumn(),
      });
      const edges: DumpedEdge[] = edgeRows.map((row) => {
        const srcId = row.a.properties.natural_id;
        const dstId = row.b.properties.natural_id;
        if (typeof srcId !== "string" || typeof dstId !== "string") {
          throw new Error(`source edge ${row.r.label} missing endpoint natural_id`);
        }
        return {
          src: srcId,
          dst: dstId,
          rel: row.r.label,
          props: { ...(row.r.properties as Record<string, unknown>) },
        };
      });

      return { nodes, edges };
    } finally {
      await src.close();
      if (previousUrl === undefined) delete process.env.LABKIT_DB_URL;
      else process.env.LABKIT_DB_URL = previousUrl;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function nodeExists(graph: TenantGraph, id: string): Promise<boolean> {
  const rows = await graph.query(
    `MATCH (n {natural_id: $id}) RETURN n`,
    { n: vertexColumn<VertexProps>() },
    { id },
  );
  return rows.length > 0;
}

async function bumpSequences(
  db: { query(sql: string, params?: unknown[]): Promise<unknown> },
  nodes: DumpedNode[],
): Promise<void> {
  const maxByLabel = new Map<NodeLabel, number>();
  for (const node of nodes) {
    const n = numericSuffix(node.natural_id);
    if (n === undefined) continue;
    const prev = maxByLabel.get(node.label) ?? 0;
    if (n > prev) maxByLabel.set(node.label, n);
  }
  for (const label of NODE_LABELS) {
    const max = maxByLabel.get(label);
    if (max === undefined) continue;
    const seq = `${LABKIT_SCHEMA}.labkit_${label.toLowerCase()}_natural_id_seq`;
    // setval(..., true) so the next nextval is max+1 and cannot collide with a copied id.
    await db.query(`SELECT setval($1::regclass, $2, true)`, [seq, max]);
  }
}

async function createRawEdge(graph: TenantGraph, dumped: DumpedEdge): Promise<void> {
  validateIdentifier(dumped.rel, "edge label");
  const entries = Object.entries(dumped.props);
  for (const [key] of entries) validateIdentifier(key, "edge property key");
  const assignment = entries.length ? ` {${entries.map(([k]) => `${k}: $p_${k}`).join(", ")}}` : "";
  // MATCH then CREATE, never MERGE: MERGE between two matched nodes stores start_id/end_id 0.
  // Label is interpolated after validateIdentifier; AGE has no parameter for an edge type.
  const created = await graph.query(
    `MATCH (a {natural_id: $src}), (b {natural_id: $dst}) CREATE (a)-[e:${dumped.rel}${assignment}]->(b) RETURN e`,
    { e: edgeColumn() },
    {
      src: dumped.src,
      dst: dumped.dst,
      ...Object.fromEntries(entries.map(([k, v]) => [`p_${k}`, v])),
    },
  );
  if (created.length === 0) {
    throw new Error(`${dumped.rel} ${dumped.src} -> ${dumped.dst}: CREATE matched nothing`);
  }
}

function printCounts(nodes: number, edges: number, already: boolean): void {
  const verb = already ? "already present" : "copied";
  console.log(`nodes ${verb}: ${nodes}`);
  console.log(`edges ${verb}: ${edges}`);
  console.log(`first id ${WALK_START}`);
  console.log(`last note ${WALK_END}`);
}

async function main(): Promise<void> {
  const destUrl = process.env.LABKIT_DB_URL ?? DEFAULT_DEST;
  databaseName(destUrl);

  const { nodes, edges } = await dumpSource();

  await ensureDatabase(destUrl);
  await migrateDest(destUrl);

  process.env.LABKIT_DB_URL = destUrl;
  const dest = await connectDb();
  try {
    const ctx = await resolveTenantContext(dest.db, dest.tx, TENANT);
    const graph = new TenantGraph(ctx, dest.db, dest.tx);

    if (await nodeExists(graph, WALK_START)) {
      if (!(await nodeExists(graph, WALK_END))) {
        throw new Error(`${WALK_START} exists on dest but ${WALK_END} does not`);
      }
      printCounts(nodes.length, edges.length, true);
      return;
    }

    await graph.inTransaction(async () => {
      for (const node of nodes) {
        await graph.createNode(node.label, node.props as never, node.natural_id);
      }
      await bumpSequences(dest.db, nodes);
      for (const edge of edges) {
        await createRawEdge(graph, edge);
      }
    });

    if (!(await nodeExists(graph, WALK_START))) {
      throw new Error(`dest is missing ${WALK_START} after copy`);
    }
    if (!(await nodeExists(graph, WALK_END))) {
      throw new Error(`dest is missing ${WALK_END} after copy`);
    }

    printCounts(nodes.length, edges.length, false);
  } finally {
    await dest.close();
  }
}

await main();
