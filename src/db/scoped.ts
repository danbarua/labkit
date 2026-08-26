/**
 * Stepping a session down to the application role, with its tenant pinned.
 *
 * **The last thing a composition root does before handing the connection to the
 * domain**, and the order is not negotiable:
 *
 * ```
 * connect → bootstrapSession → migrate → resolveTenantContext → scopeToTenant → domain
 * ```
 *
 * Each step needs the one before it. `bootstrapSession` runs `LOAD 'age'`,
 * which **requires a superuser** — measured 2026-08-26, a non-superuser gets
 * `access to library "age" is not allowed` (42501), and without the library the
 * `agtype` type does not resolve, so every Cypher query fails, reads included.
 * `resolveTenantContext` provisions the tenant's graph, which is DDL on
 * `ag_catalog` and also superuser work. Only once both have happened is there a
 * tenant to pin and nothing left that needs the privilege.
 *
 * ## What it is worth
 *
 * **A safety boundary, not a security one.** The session can `RESET ROLE` back
 * to the superuser it connected as. What this stops is a *query that forgot its
 * tenant filter*; what it does not stop is a caller who means harm. Both halves
 * of that sentence are load-bearing — the word "policy" invites a reader to
 * assume the second, and it is not true here.
 *
 * Given LabKit's deployment — a CLI process or an MCP server on a developer's
 * machine, one tenant per process — the first is the failure that actually
 * happens and the second is not in the threat model. `LABKIT_DB_URL` pointing
 * at a shared Postgres is where that would stop being true, and the answer
 * there is a login role with `session_preload_libraries = 'age'`, which is
 * written down in `drizzle/0004_rls.sql` and not built.
 *
 * ## Why the tenant is a session GUC
 *
 * `public.labkit_event` is one table for every tenant — a tenant's *graph* is
 * its own schema and needs no such column, but the relational side has no such
 * boundary. The policy compares `tenant_id` against
 * `current_setting('labkit.tenant_id')`, so the value has to live somewhere the
 * policy can read it, and a session setting is the only place that is neither a
 * query parameter nor a second table.
 *
 * Session-scoped rather than `SET LOCAL`: production resolves exactly one
 * tenant per process, at assembly, and never again. Measured — there are two
 * `resolveTenantContext` call sites outside tests, `src/cli/session.ts` and
 * `src/mcp/server.ts`, both once.
 */

import type { LabKitDB } from "./backend";
import { APP_ROLE } from "./schema";
import type { TenantContext } from "./tenant";

/** The session setting the policy reads. Also named in the policy SQL. */
export const TENANT_SETTING = "labkit.tenant_id";

/**
 * Pins the tenant, then drops to the application role.
 *
 * That order matters: after `SET ROLE` the session may no longer be allowed to
 * do everything, and setting a GUC it cannot set would be a confusing failure
 * at the wrong step. Pin first, step down second, and the only thing that can
 * fail is the step down.
 *
 * `set_config` rather than a `SET` built by hand. `SET` does not take a
 * parameter — the value would have to be interpolated — and interpolating a
 * value into SQL is the pattern the rest of this layer just finished removing.
 * `false` is `is_local`: session-scoped, not transaction-scoped.
 */
export async function scopeToTenant(db: LabKitDB, ctx: TenantContext): Promise<void> {
  await db.query(`SELECT set_config($1, $2, false)`, [TENANT_SETTING, String(ctx.tenantId)]);
  // No parameter is possible here — `SET ROLE` takes an identifier, not a
  // value — so the role name is a module constant and never reaches this from
  // outside the file.
  await db.query(`SET ROLE ${APP_ROLE}`);
}
