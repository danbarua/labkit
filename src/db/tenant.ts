import type { LabKitDB } from "./graph";
import { NODE_LABELS, EDGE_LABELS, NODE_VIEW_COLUMNS } from "./graph";

export interface TenantContext {
  tenantId: number;
  graphName: string;
}

/**
 * Resolves (creating if needed) a tenant by slug, provisions its AGE graph,
 * and returns the `TenantContext` every `TenantGraph` operation requires.
 * This is the CLI/MCP/bootstrap-boundary resolution point PJ-003 §5
 * describes — below this, there is no "tenant omitted" mode.
 */
export async function resolveTenantContext(db: LabKitDB, slug = "labkit"): Promise<TenantContext> {
  const inserted = await db.query<{ id: number; graph_name: string }>(
    `insert into tenants (slug, display_name) values ($1, $2) on conflict (slug) do nothing returning id, graph_name`,
    [slug, slug],
  );
  const row =
    inserted.rows[0] ??
    (await db.query<{ id: number; graph_name: string }>(`select id, graph_name from tenants where slug = $1`, [slug])).rows[0];
  if (!row) throw new Error(`tenant "${slug}" not found after insert-or-fetch race`);

  await provisionTenantGraph(db, row.id, row.graph_name);
  return { tenantId: row.id, graphName: row.graph_name };
}

/**
 * Provisions a tenant's AGE graph: the graph itself, every vertex/edge
 * label, a UNIQUE natural-id index per label, and a CQRS read view per
 * label — all inside one transaction guarded by a transaction-scoped
 * advisory lock keyed by `tenantId`.
 *
 * Contract: serialized per tenant and idempotent AS A WHOLE — not "each
 * individual DDL statement happens to survive a race." Tenant creation is
 * runtime code (unlike the one-time migrations in ./drizzle/), so two
 * processes can call this concurrently for a brand new tenant; the loser
 * blocks on the advisory lock until the winner commits, then sees the graph
 * already exists and does nothing further.
 *
 * On PGlite this lock is uncontended in practice (PGlite is already
 * single-writer), but the code path is identical across backends —
 * `pg_advisory_xact_lock` is a normal Postgres builtin either way.
 */
export async function provisionTenantGraph(db: LabKitDB, tenantId: number, graphName: string): Promise<void> {
  await db.query("BEGIN");
  try {
    await db.query("SELECT pg_advisory_xact_lock($1)", [tenantId]);

    const existing = await db.query(`SELECT 1 FROM ag_catalog.ag_graph WHERE name = $1`, [graphName]);
    if (existing.rows.length === 0) {
      await db.query(`SELECT create_graph($1)`, [graphName]);

      for (const label of NODE_LABELS) {
        await db.query(`SELECT create_vlabel($1, $2)`, [graphName, label]);
      }
      for (const edge of EDGE_LABELS) {
        await db.query(`SELECT create_elabel($1, $2)`, [graphName, edge]);
      }
      for (const label of NODE_LABELS) {
        await db.query(
          `CREATE UNIQUE INDEX ON "${graphName}"."${label}" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)))`,
        );
      }
      for (const label of NODE_LABELS) {
        const columns = NODE_VIEW_COLUMNS[label]
          .map((col) => `labkit_prop(properties, '${col}') AS ${col}`)
          .join(",\n           ");
        await db.query(
          `CREATE VIEW "${graphName}".${label.toLowerCase()} AS
           SELECT labkit_prop(properties, 'natural_id') AS natural_id,
           ${columns}
           FROM "${graphName}"."${label}"`,
        );
      }
    }

    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}
