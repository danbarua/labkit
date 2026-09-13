import { basename } from "node:path";
import { connectDb, type LabKitDBConnection } from "../../../src/db/connect";
import { TenantGraph } from "../../../src/db/graph";
import { scopeToTenant } from "../../../src/db/scoped";
import { resolveTenantContext } from "../../../src/db/tenant";
import { worktreeName } from "../../../src/worktree";

/**
 * Process-lifetime store: one Postgres connection, one tenant graph.
 * Not an HTTP session. Schema changes belong in infra (seed already migrates).
 */
export interface Runtime {
  connection: LabKitDBConnection;
  graph: TenantGraph;
  tenant: string;
  worktree: string;
}

export async function openRuntime(): Promise<Runtime> {
  process.env.LABKIT_DB_URL ??= "postgresql://postgres:agens@127.0.0.1:5433/labkit";
  const tenant = process.env.LABKIT_TENANT ?? "overlap-bench";

  const connection = await connectDb();
  const ctx = await resolveTenantContext(connection.db, connection.tx, tenant);
  await scopeToTenant(connection.db, ctx);
  return {
    connection,
    graph: new TenantGraph(ctx, connection.db, connection.tx),
    tenant,
    worktree: worktreeName() ?? basename(process.cwd()),
  };
}
