/**
 * Stepping a session down to the application role, with its tenant pinned.
 */

import type { LabKitDB } from "./backend";
import { APP_ROLE } from "./schema";
import type { TenantContext } from "./tenant";

/** The session setting the policy reads. Also named in the policy SQL. */
export const TENANT_SETTING = "labkit.tenant_id";

/**
 * Pins the tenant, then drops to the application role.
 */
export async function scopeToTenant(db: LabKitDB, ctx: TenantContext): Promise<void> {
  await db.query(`SELECT set_config($1, $2, false)`, [TENANT_SETTING, String(ctx.tenantId)]);
  // No parameter is possible here — `SET ROLE` takes an identifier, not a
  // value — so the role name is a module constant and never reaches this from
  // outside the file.
  await db.query(`SET ROLE ${APP_ROLE}`);
}
