import { traced } from "./trace";
import { join } from "node:path";
import { directPostgresBackend, pgliteLeaderElectionBackend, type LabKitDBConnection } from "./backend";

export type { LabKitDBConnection };

/**
 * Deterministic per-project TCP port so unrelated LabKit projects on
 * the same machine don't collide, without needing a registry file. Not
 * collision-proof, just good enough for local single-machine dev.
 */
function derivePort(projectRoot: string): number {
  let hash = 0;
  for (const ch of projectRoot) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 40000 + (hash % 9000); // 40000-48999
}

/**
 * Picks a `DbBackend` (src/db/backend.ts) and connects through it.
 * `LABKIT_DB_URL` set → connect directly to that Postgres, no election.
 * Otherwise → the default: an embedded, per-project PGlite file at
 * `<projectRoot>/.labkit/pglite`, arbitrated by leader election since
 * PGlite is single-writer/single-process.
 */
export async function connectDb(projectRoot = process.cwd()): Promise<LabKitDBConnection> {
  const url = process.env.LABKIT_DB_URL;
  if (url) {
    return withTrace(await directPostgresBackend({ connectionString: url }).connect(), "postgres");
  }

  const labkitDir = join(projectRoot, ".labkit");
  const connection = await pgliteLeaderElectionBackend({
    dataDir: join(labkitDir, "pglite"),
    lockPath: join(labkitDir, "pglite.lock"),
    port: derivePort(projectRoot),
    host: "127.0.0.1",
  }).connect();
  return withTrace(connection, "pglite");
}

/**
 * Threads the connection through `traced()` while keeping whatever else the
 * backend hung off it (`close`, role, and so on).
 *
 * A no-op unless `LABKIT_TRACE` is set — `traced()` returns the same object it
 * was given, so the spread below copies a connection that was never wrapped.
 */
function withTrace(connection: LabKitDBConnection, label: string): LabKitDBConnection {
  const db = traced(connection.db, label);
  return db === connection.db ? connection : { ...connection, db };
}
