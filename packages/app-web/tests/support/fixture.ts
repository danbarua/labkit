import { PGlite } from "@electric-sql/pglite";
import { age } from "@electric-sql/pglite-age";
import { bootstrapSession, type LabKitDB } from "@labkit/core-db/backend";
import { runMigrations } from "@labkit/core-db/migrate";
import { transactor } from "@labkit/core-db/transactor";
import { type Connections, pgConnections, serialised } from "../../src/server/connections";
import { createScratchDb } from "./scratch-db";
import { seed } from "./seed";

export type Backend = "pglite" | "postgres";

/** Postgres when `LABKIT_DB_URL` names a server, embedded PGlite otherwise. */
export const defaultBackend = (): Backend => (process.env.LABKIT_DB_URL ? "postgres" : "pglite");

export interface Fixture {
  backend: Backend;
  connections: Connections;
  close(): Promise<void>;
}

/**
 * A database holding the two seeded workspaces, and the connections the API reaches it through.
 * PGlite runs in memory with nothing to install. Postgres is a throwaway database created on the
 * server `LABKIT_DB_URL` names, and is what shows how the pool behaves under concurrent requests.
 */
export async function createFixture(backend: Backend = defaultBackend()): Promise<Fixture> {
  if (backend === "postgres") {
    const serverUrl = process.env.LABKIT_DB_URL;
    if (!serverUrl) throw new Error("the postgres backend needs LABKIT_DB_URL");
    const scratch = await createScratchDb(serverUrl);
    const connections = pgConnections(scratch.url);
    return {
      backend,
      connections,
      close: async () => {
        await connections.end();
        await scratch.drop();
      },
    };
  }

  const raw = new PGlite({ extensions: { age } });
  await runMigrations(raw);
  await bootstrapSession(raw);
  const db: LabKitDB = { query: (sql, params, opts) => raw.query(sql, params as unknown[], opts) };
  await seed(db, transactor(db), (sql) => raw.exec(sql));
  return { backend, connections: serialised(raw, () => raw.close()), close: () => raw.close() };
}
