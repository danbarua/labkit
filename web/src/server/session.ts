import { basename } from "node:path";
import { Client } from "pg";
import { connectDb, type LabKitDBConnection } from "../../../src/db/connect";
import { TenantGraph } from "../../../src/db/graph";
import { runMigrationsOnPostgres } from "../../../src/db/migrate";
import { scopeToTenant } from "../../../src/db/scoped";
import { resolveTenantContext } from "../../../src/db/tenant";
import { worktreeName } from "../../../src/worktree";

export interface Session {
  connection: LabKitDBConnection;
  graph: TenantGraph;
  tenant: string;
  worktree: string;
}

/**
 * Migrates out of band, then connects, pins the tenant, and holds the graph for process life.
 * Migrate before connecting because bootstrap loads AGE, which is absent on a fresh database.
 */
export async function openSession(): Promise<Session> {
  process.env.LABKIT_DB_URL ??= `postgresql://postgres:agens@127.0.0.1:${process.env.LABKIT_PORT_DB ?? "5432"}/labkit`;
  const tenant = process.env.LABKIT_TENANT ?? "overlap-bench";
  const url = process.env.LABKIT_DB_URL;

  const migrator = new Client({ connectionString: url });
  await migrator.connect();
  try {
    await runMigrationsOnPostgres(migrator);
  } finally {
    await migrator.end();
  }

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
