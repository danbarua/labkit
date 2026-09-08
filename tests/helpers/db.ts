import { PGlite } from "@electric-sql/pglite";
import { age } from "@electric-sql/pglite-age";
import { Client } from "pg";
import { runMigrations, runMigrationsOnPostgres } from "../../src/db/migrate";
import { bootstrapSession, type LabKitDB, type QueryOptions } from "../../src/db/backend";
import { traced } from "../../src/db/trace";
import { type Transactor, transactor } from "../../src/db/transactor";

/**
 * The database the suite runs against, and there are two of them.
 */
export interface TestDb {
  /**
   * Under PGlite, a labelled view onto the shared session whose `close()` is a
   * no-op. Under `LABKIT_DB_URL`, a real connection that `close()` really
   * closes. Either way, call it in `beforeEach` and close it in `afterEach`.
   */
  openClient(label?: string): Promise<TestClient>;
  /** Truncates every LabKit-owned table and empties every tenant graph — call in `afterEach`. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

/**
 * What a test is handed: the seam, its transaction boundary, and a way to give it back.
 */
export interface TestClient extends LabKitDB {
  tx: Transactor;
  close(): Promise<void>;
}

/** True when the suite has been pointed at a real Postgres. See the file header. */
export const usingPostgres = (): boolean => Boolean(process.env.LABKIT_DB_URL);

/**
 * Everything a `TestDb` needs from whichever backend is in play: how to get a
 * connection, and how to give one back.
 */
interface Booted {
  open(): Promise<{ db: LabKitDB; close(): Promise<void> }>;
}

/**
 * The one PGlite instance the whole suite shares, or the one migrated container, booted on
 * first use.
 */
let shared: Promise<Booted> | undefined;

async function bootPglite(): Promise<Booted> {
  const rawDb = new PGlite({ extensions: { age } });
  await runMigrations(rawDb);
  await bootstrapSession(rawDb);
  return {
    async open() {
      return {
        // `opts` forwarded, not dropped. PGlite's third argument is already an
        // options object, so this is a rename — but dropping it is silent:
        // drizzle asks for `rowMode: "array"` and, given objects instead,
        // returns `[{}]` per row or dies inside an array column's decoder. It
        // did the latter here first, which is the luckier of the two.
        db: { query: (sql, params, opts) => rawDb.query(sql, params as unknown[], opts) },
        close: async () => {},
      };
    },
  };
}

async function bootPostgres(connectionString: string): Promise<Booted> {
  // Migrations are the out-of-band deploy step this backend expects, and a
  // test run is a legitimate instance of one: nothing else is going to
  // have migrated the container. Idempotent, so re-running the suite is free.
  const migrator = new Client({ connectionString });
  await migrator.connect();
  try {
    await runMigrationsOnPostgres(migrator);
  } finally {
    await migrator.end();
  }
  return {
    async open() {
      const c = new Client({ connectionString });
      await c.connect();
      // Wrapped rather than handed over: `pg.Client.query(sql, params, cb)`
      // takes a *callback* third, so `QueryOptions` has to travel in the
      // config-object form. Same wrap as `directPostgresBackend`.
      const db: LabKitDB = {
        query: async <T = Record<string, unknown>>(
          sql: string,
          params?: unknown[],
          opts?: QueryOptions,
        ) => {
          const r = await c.query({ text: sql, values: params, ...(opts ?? {}) });
          return { rows: r.rows as T[] };
        },
      };
      return { db, close: () => c.end() };
    },
  };
}

async function boot(): Promise<Booted> {
  const url = process.env.LABKIT_DB_URL;
  return url ? bootPostgres(url) : bootPglite();
}

export async function setupTestDb(): Promise<TestDb> {
  shared ??= boot();
  const booted = await shared;

  let opened = 0;
  async function openClient(label?: string): Promise<TestClient> {
    const { db: raw, close } = await booted.open();
    await bootstrapSession(raw);
    // Traced only when LABKIT_TRACE is set; otherwise `traced()` hands back the
    // same object and this costs nothing. Labelled per logical client because
    // telling two of them apart is most of what a trace is for — the teardown
    // race described above is invisible without it.
    const db = traced(
      { query: (sql, params, opts) => raw.query(sql, params, opts) },
      label ?? `conn-${++opened}`,
    );
    // One transactor per opened client, over the *traced* object, so a BEGIN
    // shows up in a trace like every other query.
    return { query: db.query, tx: transactor(db), close };
  }

  // Dedicated to reset()/teardown and kept open for the whole file. Under
  // Postgres it is a genuinely separate session from every test's, which is
  // what lets the truncate below run while a test's own connection is idle.
  const admin = await openClient("admin");

  return {
    openClient,
    /**
     * Empties every tenant graph **without dropping it**.
     */
    async reset() {
      const tables = await admin.query<{
        table_schema: string;
        table_name: string;
      }>(`
        select table_schema, table_name
        from information_schema.tables
        where table_schema not in ('pg_catalog', 'information_schema', 'ag_catalog', 'drizzle')
        order by table_schema, table_name;
      `);
      const tableNames = tables.rows.map((r) => `"${r.table_schema}"."${r.table_name}"`);
      if (tableNames.length > 0) {
        // Three calls, not one semicolon-separated string. That form works over `pg`'s simple
        // query protocol and **throws** against a raw PGlite instance — `cannot insert multiple
        // commands into a prepared statement` — which is the same restriction the custom
        // migrations work around with `--> statement-breakpoint`.
        await admin.query(`set session_replication_role = replica;`);
        await admin.query(`truncate ${tableNames.join(", ")} restart identity cascade;`);
        await admin.query(`set session_replication_role = DEFAULT;`);
      }
    },
    /**
     * Closes this file's admin connection and **leaves the shared boot in place** for the files
     * after it.
     */
    async close() {
      await admin.close();
    },
  };
}
