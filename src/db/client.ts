/**
 * The seam every other module talks to the database through, and the
 * per-session setup that seam needs before any AGE query works.
 *
 * Deliberately knows nothing about graphs, tenants, or the domain model —
 * that's what lets `src/db/backend.ts` (connection plumbing) depend on this
 * without dragging in the query surface, and what lets tests hand
 * application code a plain `pg.Client` that satisfies `LabKitDB`.
 */

/**
 * The minimum a connection has to offer for LabKit to use it. Structurally
 * satisfied by `pg.Client`, by a raw `PGlite` instance, and by test doubles —
 * intentionally narrower than any of them, so nothing below this seam can
 * reach for backend-specific behaviour.
 */
export interface LabKitDB {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Per-session setup: `LOAD`/`search_path` are session-scoped in Postgres, so
 * every connecting process must call this itself — it can't be migrated
 * away like the one-time bootstrap (`CREATE EXTENSION`) can. Graph/label
 * provisioning is per-tenant runtime work now, not migrated at all — see
 * src/db/provisioning.ts's provisionTenantGraph().
 */
export async function bootstrapSession(db: LabKitDB): Promise<void> {
  await db.query(`LOAD 'age';`);
  await db.query(`SET search_path = ag_catalog, "$user", public;`);
}
