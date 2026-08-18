/**
 * Tenant identity: resolving a slug to the `TenantContext` everything below
 * the CLI/MCP boundary is scoped by (PJ-003 §5).
 *
 * The graph *schema* side of a tenant — creating labels, indexes, and views —
 * lives in src/db/provisioning.ts; this file only decides which tenant we're
 * talking about, then hands off.
 */

import { provisionTenantGraph } from "./provisioning";
import { LABKIT_SCHEMA } from "./schema";
import type { LabKitDB } from "./client";

export interface TenantContext {
  tenantId: number;
  graphName: string;
}

/**
 * Resolves (creating if needed) a tenant by slug, reconciles its AGE graph,
 * and returns the `TenantContext` every `TenantGraph` operation requires.
 * This is the CLI/MCP/bootstrap-boundary resolution point PJ-003 §5
 * describes — below this, there is no "tenant omitted" mode.
 */
export async function resolveTenantContext(db: LabKitDB, slug = "labkit"): Promise<TenantContext> {
  const inserted = await db.query<{ id: number; graph_name: string }>(
    `insert into ${LABKIT_SCHEMA}.tenants (slug, display_name) values ($1, $2) on conflict (slug) do nothing returning id, graph_name`,
    [slug, slug],
  );
  const row =
    inserted.rows[0] ??
    (await db.query<{ id: number; graph_name: string }>(`select id, graph_name from ${LABKIT_SCHEMA}.tenants where slug = $1`, [slug]))
      .rows[0];
  if (!row) throw new Error(`tenant "${slug}" not found after insert-or-fetch race`);

  await provisionTenantGraph(db, row.id, row.graph_name);
  return { tenantId: row.id, graphName: row.graph_name };
}
