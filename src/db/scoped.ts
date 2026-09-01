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
 * `access to library "age" is not allowed` (42501). `resolveTenantContext`
 * provisions the tenant's graph, which is DDL on `ag_catalog` and also
 * superuser work. Only once both have happened is there a tenant to pin and
 * nothing left that needs the privilege.
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
 * at a shared Postgres is where that would stop being true.
 *
 * **And there a real login boundary works. Measured 2026-08-27, both halves.**
 * The refusal above is of *issuing* `LOAD`, not of needing it: a server that
 * preloads AGE has the library in every backend already. `docker/postgres`'s
 * base image runs `postgres -c shared_preload_libraries=age`, and against it a
 * plain LOGIN role that never issues `LOAD` resolves `agtype`, reads through
 * Cypher, and **writes** — `createNode` minted a natural id and `createEdge`
 * connected two nodes, through this same `TenantGraph`. The write half had
 * been unverified when this comment first claimed the read half.
 *
 * What makes it a *security* boundary rather than the safety one above: that
 * session is refused `SET ROLE postgres` with 42501. There is no `RESET ROLE`
 * back to superuser, because it never was one.
 *
 * So the ingredients are a preloading server and a `bootstrapSession` that
 * does not issue `LOAD`. **Not built, and the reason is that it is
 * per-backend**: PGlite has no preload and exactly one superuser session, so it
 * keeps the step-down. Deciding what the seam looks like when one backend can
 * offer a boundary the other cannot is the work, not the SQL.
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
 * **What a connection pooler does to that premise, measured 2026-08-28.**
 * Transaction-mode pooling gives each transaction whichever backend is free,
 * and `scopeToTenant` runs *outside* any transaction while every verb opens
 * its own — so the premise above is exactly what it breaks. Three arms, two
 * tenants, two servers, 15 writes each driven concurrently through one
 * PgBouncer with `default_pool_size=1`:
 *
 * | arm | succeeded | failed | rows in the wrong tenant |
 * | --- | --- | --- | --- |
 * | no pooler (control) | 30/30 | 0 | 0 |
 * | pooler, `session` mode (control) | 30/30 | 0 | 0 |
 * | pooler, **`transaction`** mode | **1/30** | **29** | **0** |
 *
 * **It is loudly incompatible rather than silently wrong, which is the good
 * outcome — and not for the reason this comment would have you predict.** The
 * `current_setting` raise below never fired once. What actually refused was
 * `LOAD 'age'` — `access to library "age" is not allowed`, because a reused
 * backend is already stepped down to `labkit_app` and a non-superuser may not
 * issue it — and the policy rejecting an `INSERT` whose tenant did not match
 * the GUC left behind by the other tenant's client.
 *
 * **The dangerous case is reachable and was not reached here.**
 * `labkit_event` is `ENABLE ROW LEVEL SECURITY` without `FORCE`, and it is
 * owned by `postgres`, which is also who `LABKIT_DB_URL` connects as. So a
 * backend on which the step-down has been *reset* rather than kept runs as the
 * owner, and the policy is not evaluated at all: no raise, every tenant's rows
 * visible. Demonstrated directly, same date —
 * `SELECT count(*) FROM labkit_event` as `postgres` with no tenant GUC set
 * returns every row, where the same query as `labkit_app` raises
 * `unrecognized configuration parameter`. PgBouncer happened to keep the role,
 * so LabKit never entered that state; nothing here guarantees the next pooler
 * will.
 *
 * Neither is a reason to change this today — one tenant per process is still
 * the deployment. Both are reasons that "put a pooler in front of it" is a
 * design change and not a configuration one. See issue #49.
 *
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
