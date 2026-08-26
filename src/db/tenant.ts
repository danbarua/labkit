/**
 * Tenant identity: resolving a slug to the `TenantContext` everything below
 * the CLI/MCP boundary is scoped by (PJ-003 §5).
 *
 * The graph *schema* side of a tenant — creating labels and indexes —
 * lives in src/db/provisioning.ts; this file only decides which tenant we're
 * talking about, then hands off.
 */

import { eq } from "drizzle-orm";
import { ormOver } from "./orm";
import { provisionTenantGraph } from "./provisioning";
import { tenants } from "./schema";
import type { LabKitDB } from "./backend";

export interface TenantContext {
  tenantId: number;
  graphName: string;
}

/**
 * Resolves (creating if needed) a tenant by slug, reconciles its AGE graph,
 * and returns the `TenantContext` every `TenantGraph` operation requires.
 * This is the CLI/MCP/bootstrap-boundary resolution point PJ-003 §5
 * describes — below this, there is no "tenant omitted" mode.
 *
 * Insert-or-fetch rather than fetch-or-insert: `on conflict do nothing`
 * returning nothing is how this learns a concurrent process won the race, and
 * the select that follows is the loser's path rather than the common one.
 *
 * `graph_name` is never sent — it is `generated always as ('labkit_t' || id)`,
 * so the server derives it from the trusted internal id and no application can
 * desync the two (PJ-003 §5). Drizzle knows that from the column declaration
 * and leaves it out of the insert while still reading it back.
 */
export async function resolveTenantContext(db: LabKitDB, slug = "labkit"): Promise<TenantContext> {
  const orm = ormOver(db);
  const columns = { id: tenants.id, graph_name: tenants.graph_name };

  const inserted = await orm
    .insert(tenants)
    .values({ slug, display_name: slug })
    .onConflictDoNothing({ target: tenants.slug })
    .returning(columns);

  const row =
    inserted[0] ?? (await orm.select(columns).from(tenants).where(eq(tenants.slug, slug)))[0];
  if (!row) throw new Error(`tenant "${slug}" not found after insert-or-fetch race`);

  await provisionTenantGraph(db, row.id, row.graph_name);
  return { tenantId: row.id, graphName: row.graph_name };
}
