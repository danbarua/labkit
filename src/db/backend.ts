import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Client } from "pg";
import { age, pgliteAssets } from "./extensions";
import { runMigrations } from "./migrate";
import { type Transactor, transactor } from "./transactor";

/**
 * The seam every other module talks to the database through: the minimum a connection has to
 * offer for LabKit to use it.
 */
export interface LabKitDB {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
    opts?: QueryOptions,
  ): Promise<{ rows: T[] }>;
}

/**
 * The one thing a caller may ask of a query beyond its text and parameters.
 */
export interface QueryOptions {
  rowMode?: "array";
}

/**
 * Per-session setup: `LOAD`/`search_path` are session-scoped in Postgres, so every connecting
 * process must call this itself -- it can't be migrated away like the one-time bootstrap
 * (`CREATE EXTENSION`) can.
 */
export async function bootstrapSession(db: LabKitDB): Promise<void> {
  await db.query(`LOAD 'age';`);
  await db.query(`SET search_path = ag_catalog, "$user", public;`);
}

export interface LabKitDBConnection {
  db: LabKitDB;
  /**
   * The transaction boundary for this connection, and there is exactly one.
   */
  tx: Transactor;
  /**
   * The raw PGlite instance behind this connection, when there is one.
   */
  pglite?: PGlite;
  close(): Promise<void>;
}

/**
 * Where the data lives and how a process gets access to it, decoupled from "run migrations
 * once" (src/db/migrate.ts) and from "how does LabKit talk to the graph once connected"
 * (src/db/graph.ts).
 */
export interface DbBackend {
  connect(): Promise<LabKitDBConnection>;
}

async function openPglite(dataDir: string): Promise<PGlite> {
  // Assets handed in rather than located -- see `./extensions.ts`. Doing it
  // unconditionally keeps one code path: an interpreted run reads the same
  // files from `node_modules/`, a compiled one from inside the bundle.
  const db = new PGlite({ dataDir, extensions: { age }, ...(await pgliteAssets()) });
  await db.waitReady;
  return db;
}

/**
 * The mutex, and the only thing standing between two processes and a corrupt database file.
 */
function tryAcquire(lockPath: string): boolean {
  try {
    const fd = openSync(lockPath, "wx");
    writeSync(fd, String(process.pid));
    closeSync(fd);
    return true;
  } catch (err: any) {
    if (err.code !== "EEXIST") throw err;
    try {
      const pid = Number(readFileSync(lockPath, "utf8").trim());
      process.kill(pid, 0); // throws if not running; no throw = alive
      return false;
    } catch (checkErr: any) {
      if (checkErr.code === "ESRCH") {
        // Holder is dead -- stale lock, reclaim it.
        unlinkSync(lockPath);
        return tryAcquire(lockPath);
      }
      // EPERM or anything else ambiguous: don't steal the lock.
      return false;
    }
  }
}

function holderOf(lockPath: string): string {
  try {
    return readFileSync(lockPath, "utf8").trim();
  } catch {
    return "unknown";
  }
}

/**
 * Waits for the lock rather than failing on it, because the holder is a hundred milliseconds
 * away.
 */
async function acquireLock(lockPath: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (tryAcquire(lockPath)) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for the LabKit database lock at ${lockPath} ` +
          `(held by pid ${holderOf(lockPath)})`,
      );
    }
    await Bun.sleep(25);
  }
}

function releaseLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch {
    // already gone -- fine
  }
}

/**
 * An embedded, single-writer PGlite file, held for exactly as long as the work takes: lock,
 * open, work, close.
 */
export function pgliteBackend(opts: {
  dataDir: string;
  lockPath: string;
  /** How long to wait for the holder before giving up. See {@link acquireLock}. */
  lockTimeoutMs?: number;
}): DbBackend {
  const { dataDir, lockPath, lockTimeoutMs } = opts;

  return {
    async connect(): Promise<LabKitDBConnection> {
      const lockDir = dirname(lockPath);
      if (!existsSync(lockDir)) mkdirSync(lockDir, { recursive: true });

      await acquireLock(lockPath, lockTimeoutMs);
      try {
        const pglite = await openPglite(dataDir);
        await runMigrations(pglite);
        // Wrapped rather than handed over, so `QueryOptions` has exactly one
        // shape at the seam. PGlite's own third argument is already an options
        // object, so this is a rename and not a translation.
        const db: LabKitDB = {
          query: (sql, params, opts) => pglite.query(sql, params as unknown[], opts),
        };
        await bootstrapSession(db);
        return {
          db,
          tx: transactor(db),
          pglite,
          close: async () => {
            await pglite.close();
            releaseLock(lockPath);
          },
        };
      } catch (err) {
        releaseLock(lockPath);
        throw err;
      }
    },
  };
}

/**
 * Connects directly to a real (local or cloud) Postgres.
 */
export function directPostgresBackend(opts: { connectionString: string }): DbBackend {
  return {
    async connect(): Promise<LabKitDBConnection> {
      const client = new Client({ connectionString: opts.connectionString });
      await client.connect();
      // `pg.Client.query(sql, params, cb)` takes a *callback* third, so
      // `QueryOptions` has to travel in the config-object form. That is why the
      // client is wrapped here rather than handed over as the seam directly,
      // which it was until `rowMode` existed.
      const db: LabKitDB = {
        query: async <T = Record<string, unknown>>(
          sql: string,
          params?: unknown[],
          o?: QueryOptions,
        ) => {
          const r = await client.query({ text: sql, values: params, ...(o ?? {}) });
          return { rows: r.rows as T[] };
        },
      };
      await bootstrapSession(db);
      return { db, tx: transactor(db), close: () => client.end() };
    },
  };
}
