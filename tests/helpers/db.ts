import { PGlite } from "@electric-sql/pglite";
import { age } from "@electric-sql/pglite-age";
import { Client } from "pg";
import { runMigrations, runMigrationsOnPostgres } from "../../src/db/migrate";
import { bootstrapSession, type LabKitDB, type QueryOptions } from "../../src/db/backend";
import { traced } from "../../src/db/trace";
import { type Transactor, transactor } from "../../src/db/transactor";

/**
 * The database the suite runs against, and there are two of them.
 *
 * **Default: one embedded PGlite instance for the whole suite**, handed to
 * application code through the `LabKitDB` seam — the same shape production
 * talks through.
 *
 * **`LABKIT_DB_URL` set: a real Postgres**, one connection per `openClient()`.
 * `bun run test:pg` points that at `docker-compose.yml`'s
 * `apache/age:release_PG18_1.7.0`. It is the same environment variable
 * production reads (`src/db/connect.ts`), so a suite run and a `labkit` command
 * are pointed at a container by the same means.
 *
 * That second backend is not decoration. It is the **only** one on which two
 * connections can be live at once — PGlite is single-writer and the whole suite
 * shares one session — so anything about isolation, session-scoped role or
 * tenant, or advisory locking under contention can only be *demonstrated*
 * there. It is also a disagreeing measurement: a `pg.Client` and a raw PGlite
 * do not decode identically (`count(*)` is a string on one and a number on the
 * other, measured 2026-08-26), and a suite that only ever sees one of them
 * cannot notice.
 *
 * Nothing runs it for you. There is no CI, and `bun run check` uses the default.
 *
 * `src/db/backend.ts` takes an exclusive lock and opens the PGlite file
 * directly, with no socket in between, which is what sharing one instance
 * across the suite mirrors: on the PGlite path `openClient()` is a labelled
 * view onto that one shared session rather than a real connection. On the
 * Postgres path it is a real connection, for the plainer reason that there
 * is a server to connect to.
 *
 * Two consequences worth knowing before writing a test against the default:
 *
 * - **`close()` on an opened client is a no-op under PGlite**, kept so the
 *   harness's open/close bookkeeping (`tests/helpers/scenario.ts`) reads the
 *   same either way. Nothing there can prove state survives a *reconnect*; it
 *   never could, and `Scenario.current()` says so in its own doc comment.
 * - **Session state is shared under PGlite**, because there is one session.
 *   `search_path`, `SET ROLE` and any other session-scoped GUC set by one test
 *   is visible to the next. A test whose subject *is* session scoping has to
 *   say so, and run against `LABKIT_DB_URL`.
 *
 * A separate, older note that is still true: **this file's header has been read
 * as explaining the suite's intermittent failures, and it does not.** The
 * `graph "labkit_t1" does not exist` and `Connection terminated` bursts were a
 * teardown race — bun's 5000ms per-test timeout does not cancel the test body,
 * so an overrunning test kept executing while the next one started, and its
 * late `scenario.end()` reset the database underneath it. That cascade was
 * fixed on 2026-08-22; see `tests/scenario-harness.test.ts`. Instrumentation
 * across a failing run tracked 59,086 queries with **zero** unfinished and
 * found no desync signature at all. Misattributing it cost two investigations.
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
 * What a test is handed: the seam, its transaction boundary, and a way to give
 * it back.
 *
 * `tx` is here rather than made on demand because a `TenantGraph` requires one
 * and **two graphs over one connection must share it** — `scenario.current()`
 * and the two-tenant cases in `tests/domain-graph.test.ts` both build a second
 * graph. See `src/db/transactor.ts`.
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
 * The one PGlite instance the whole suite shares, or the one migrated
 * container, booted on first use.
 *
 * **Booting is the single largest cost in the suite and it was paid 44 times.**
 * Measured 2026-08-24: `setupTestDb()` takes ~900ms on a quiet machine and
 * **~2.5s with ten cores saturated**, while connecting and querying afterwards
 * cost 2-13ms. Forty-four files each called it from `beforeAll`, so 44-110s of a
 * ~200s suite was booting WASM, running migrations and starting socket servers
 * — which is why the query-count and off-budget work only moved 5-7%: both
 * optimised the minority.
 *
 * Bun runs every test file in one process, so one boot serves all of them.
 * Isolation comes from `reset()`, which truncates between tests.
 *
 * Graphs survive between files because `reset()` truncates rather than drops,
 * deliberately (see `reset()`), so the second file onward finds provisioning's
 * six-query steady path instead of its 83-query cold one.
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
     *
     * Dropping was the obvious way and it was expensive in a way nothing was
     * measuring: an AGE graph is a Postgres schema and every label in it is a
     * real table, so dropping one destroys thirteen node labels, twenty-five
     * edge labels and thirty-eight indexes that the next `resolveTenantContext()`
     * then has to build again — about seventy-seven DDL round trips per test.
     * Traced over one scenario file (`LABKIT_TRACE=all`), that was **24% of
     * every query the file issued**, and almost all of it was *creating*, not
     * checking. `6eeeb92` made the checking cheap; nothing had made the
     * rebuilding cheap, because nothing had noticed it was happening.
     *
     * Truncating leaves the graph, its labels and its indexes in place, so
     * provisioning finds everything present and settles for three round trips.
     * That matters beyond speed: what pushes a test over bun's 5000ms ceiling
     * is exactly this cost, and a test that crosses the ceiling is how the
     * suite flakes (see `tests/helpers/scenario.ts`).
     *
     * The truncate below already covered these tables — a graph's schema is not
     * one of the four exclusions — so the drop was doing nothing the truncate
     * did not, at seventy-seven times the price.
     *
     * **This is destructive to whatever `LABKIT_DB_URL` names.** It truncates
     * every table outside four system schemas, so point it at a throwaway
     * container and nothing else.
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
        // Three calls, not one semicolon-separated string. That form works over
        // `pg`'s simple query protocol and **throws** against a raw PGlite
        // instance — `cannot insert multiple commands into a prepared
        // statement` — which is the same restriction the custom migrations work
        // around with `--> statement-breakpoint`. Three calls work on both, so
        // there is one code path rather than a branch.
        await admin.query(`set session_replication_role = replica;`);
        await admin.query(`truncate ${tableNames.join(", ")} restart identity cascade;`);
        await admin.query(`set session_replication_role = DEFAULT;`);
      }
    },
    /**
     * Closes this file's admin connection and **leaves the shared boot in
     * place** for the files after it.
     *
     * Tearing it down here would defeat the point: bun runs files in sequence,
     * so the first `afterAll` would kill it and the next file would boot again.
     * The process exits when the run ends and takes the WASM instance, or the
     * last connections, with it.
     */
    async close() {
      await admin.close();
    },
  };
}
