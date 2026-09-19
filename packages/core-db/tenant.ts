/**
 * Tenant identity: resolving a slug to the `TenantContext` everything below the CLI/MCP
 * boundary is scoped by.
 */

import { eq } from "drizzle-orm";
import { ormOver, unwrapped } from "./orm";
import { provisionTenantGraph } from "./provisioning";
import { tenants } from "./schema";
import type { LabKitDB } from "./backend";
import type { Transactor } from "./transactor";

export interface TenantContext {
  tenantId: number;
  graphName: string;
}

/**
 * Resolves (creating if needed) a tenant by slug, reconciles its AGE graph, and returns the
 * `TenantContext` every `TenantGraph` operation requires.
 */
export async function resolveTenantContext(
  db: LabKitDB,
  tx: Transactor,
  slug = "labkit",
): Promise<TenantContext> {
  const orm = ormOver(db);
  const columns = { id: tenants.id, graph_name: tenants.graph_name };

  const row = await unwrapped(async () => {
    const inserted = await orm
      .insert(tenants)
      .values({ slug, display_name: slug })
      .onConflictDoNothing({ target: tenants.slug })
      .returning(columns);
    return (
      inserted[0] ?? (await orm.select(columns).from(tenants).where(eq(tenants.slug, slug)))[0]
    );
  });
  if (!row) throw new Error(`tenant "${slug}" not found after insert-or-fetch race`);

  await provisionTenantGraph(db, tx, row.id, row.graph_name);
  return { tenantId: row.id, graphName: row.graph_name };
}
