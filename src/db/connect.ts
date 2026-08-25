import { traced } from "./trace";
import { join } from "node:path";
import {
  directPostgresBackend,
  pgliteLeaderElectionBackend,
  type LabKitDBConnection,
} from "./backend";

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
 * Where the embedded database lives, when the caller does not say.
 *
 * `LABKIT_HOME` names the directory that holds `.labkit/`, not the `.labkit`
 * directory itself — so it is the *project root* by another route, and one
 * value means the same thing whether it arrives as an argument, an environment
 * variable or `--db`.
 *
 * It exists so a script can be hermetic. `derivePort` hashes this path, so a
 * temporary directory gets its own port as well as its own file, and a run
 * against one cannot contend with a developer's working database. That is what
 * `examples/full-lifecycle.sh` uses.
 *
 * An explicit argument still wins: `connectDb(dir)` means that directory,
 * because a caller that named one has already made the decision this is here
 * to guess at.
 */
export function labkitHome(): string {
  return process.env.LABKIT_HOME ?? process.cwd();
}

/**
 * Picks a `DbBackend` (src/db/backend.ts) and connects through it.
 * `LABKIT_DB_URL` set → connect directly to that Postgres, no election.
 * Otherwise → the default: an embedded, per-project PGlite file at
 * `<projectRoot>/.labkit/pglite`, arbitrated by leader election since
 * PGlite is single-writer/single-process.
 *
 * `projectRoot` defaults to {@link labkitHome}, so `LABKIT_HOME` is read here
 * and not by every caller. **`LABKIT_DB_URL` still wins over both** — a caller
 * pointed at a real Postgres is not asking for a file, and silently building
 * one beside it would be worse than ignoring the flag.
 */
export async function connectDb(projectRoot = labkitHome()): Promise<LabKitDBConnection> {
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
