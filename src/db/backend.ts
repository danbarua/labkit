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
 * The seam every other module talks to the database through: the minimum a
 * connection has to offer for LabKit to use it. Structurally satisfied by
 * `pg.Client`, by a raw `PGlite` instance, and by test doubles --
 * intentionally narrower than any of them, so nothing below this seam can
 * reach for backend-specific behaviour.
 *
 * It lives here, beside {@link LabKitDBConnection}, because a connection and
 * the thing you can do with one are the same subject. It was its own file
 * (`client.ts`) named for a thing it does not export -- no client, just an
 * interface with two permanent implementations -- and the name misled every
 * reader who went looking for the construction, which is `connect.ts`.
 *
 * It knows nothing about graphs, tenants or the domain model. That is what
 * keeps every importer of it outside this file a *type-only* importer: nothing
 * under `src/db/` or `src/domain/` pulls PGlite in by depending on the seam.
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
 *
 * **`rowMode: "array"` exists for drizzle and nothing else** (`./orm.ts`). Its
 * `pg-proxy` driver decodes rows itself, from positional values, and handing it
 * objects instead does not fail — it returns **`[{}, {}]`**, one empty object
 * per row, or throws `undefined is not an object (evaluating 'value.map')` the
 * moment a `WHERE` is involved. Measured on both backends, 2026-08-26. A silent
 * wrong answer is the failure mode this repo goes furthest to avoid, so the
 * option is on the seam rather than left to each call site to remember.
 *
 * It is the reason `directPostgresBackend` wraps its `pg.Client` instead of
 * handing it over: `pg.Client.query`'s third positional argument is a
 * *callback*, so the option has to travel in the config-object form.
 */
export interface QueryOptions {
  rowMode?: "array";
}

/**
 * Per-session setup: `LOAD`/`search_path` are session-scoped in Postgres, so
 * every connecting process must call this itself -- it can't be migrated
 * away like the one-time bootstrap (`CREATE EXTENSION`) can. Graph/label
 * provisioning is per-tenant runtime work now, not migrated at all -- see
 * src/db/provisioning.ts's provisionTenantGraph().
 */
export async function bootstrapSession(db: LabKitDB): Promise<void> {
  await db.query(`LOAD 'age';`);
  await db.query(`SET search_path = ag_catalog, "$user", public;`);
}

export interface LabKitDBConnection {
  db: LabKitDB;
  /**
   * The transaction boundary for this connection, and there is exactly one.
   *
   * It belongs to the connection because a transaction does: two objects
   * issuing `BEGIN` down one connection are in one transaction whether they
   * know it or not, and a second depth counter is how they stop knowing. See
   * `./transactor.ts`.
   */
  tx: Transactor;
  close(): Promise<void>;
}

/**
 * Where the data lives and how a process gets access to it, decoupled from
 * "run migrations once" (src/db/migrate.ts) and from "how does LabKit talk
 * to the graph once connected" (src/db/graph.ts). `connect.ts` picks one of
 * these based on how LabKit is configured to run.
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
 * The mutex, and the only thing standing between two processes and a corrupt
 * database file.
 *
 * PID lockfile, exactly Postgres's own `postmaster.pid` mechanism: atomic
 * exclusive-create (`wx`) is the mutex -- no check-then-act race, unlike
 * `existsSync` followed by a separate open. If the lock file already exists,
 * read the PID inside and check whether that process is still alive; if not,
 * it is a stale lock from a crash and gets reclaimed.
 *
 * **A process does not get to skip its own lock.** Two overlapping calls in one
 * process read their own PID as alive and the second one waits, which is right:
 * the lock guards a `dataDir`, and one process opening it twice corrupts the
 * file exactly as two processes would.
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
 * Waits for the lock rather than failing on it, because the holder is a
 * hundred milliseconds away.
 *
 * Measured 2026-08-26 against a real `dataDir`: a **warm** open-migrate-resolve-
 * close cycle is 80-96ms, of which the open is 70-85ms, the migration no-op 2ms
 * and the close 2ms. A **cold** one -- an empty directory, initdb and the first
 * migration -- is 1067ms. The default deadline has to clear the cold case with
 * margin or the first two processes to start against a fresh project race each
 * other into an error, so it is ten seconds and not one.
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
 * An embedded, single-writer PGlite file, held for exactly as long as the work
 * takes: lock, open, work, close.
 *
 * **This replaced a leader election.** The first process to win the lockfile
 * used to open PGlite, start a `PGLiteSocketServer`, and then connect *to
 * itself* over loopback TCP so that everyone -- including the owner -- talked
 * to it as a plain `pg.Client`. It was coherent, and it bought nothing the use
 * case needs. Multiple agents against one project cannot each hold a connection
 * under it either: the first one in owns the file and the rest connect through
 * it only while it lives, so releasing between units of work was already
 * forced rather than chosen. And the process that most often wants the file is
 * not another agent at all — it is a person running `labkit` in a terminal
 * while an agent session is open. What the socket added on top of that was a second
 * failure mode -- when the primary died, a secondary's next query raised an
 * uncaught `'error'` event from `pg` and killed the process before any `catch`
 * ran.
 *
 * The whole cycle is 80-96ms warm (measured 2026-08-26; see {@link acquireLock}
 * for the breakdown), against which a CLI invocation used to pay a speculative
 * TCP connect, possibly a lockfile race, possibly a 25ms poll, and then talk
 * over loopback anyway.
 *
 * **Migrations run on every open**, which is a change and a cheap one: the
 * no-op case is 2ms, and the alternative is a version gate of the kind PJ-005
 * reverted. There is no concurrent-writer race to reason about because the lock
 * is held across it.
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
 *
 * No lock: Postgres is its own arbiter and is already the single writer every
 * process can reach concurrently. This is the only route to a shared or
 * per-user database, and the reason {@link LabKitDB} has two permanent
 * implementations rather than collapsing into one.
 *
 * Migrations are deliberately NOT run by this backend (decided 2026-08-17,
 * see docs/project-journal/002_schema_dot_ts.md): with N processes connecting
 * concurrently and nothing serialising them, migrating here would be a race.
 * Against this backend migrations are an out-of-band deploy step, run once
 * before any LabKit process starts. A `pg_advisory_lock`-guarded in-process
 * migration would be the alternative if that stops being good enough.
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
