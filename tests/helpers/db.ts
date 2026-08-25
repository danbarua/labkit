import { PGlite } from "@electric-sql/pglite";
import { age } from "@electric-sql/pglite-age";
import { vector } from "@electric-sql/pglite-pgvector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Client } from "pg";
import { runMigrations } from "../../src/db/migrate";
import { bootstrapSession, type LabKitDB } from "../../src/db/client";
import { traced } from "../../src/db/trace";

/**
 * Application-code tests should exercise `LabKitDB` the same way production
 * does — through a real `pg.Client` over `pglite-socket` — never a raw
 * `PGlite` instance directly. `src/db/backend.ts`'s primary role never hands
 * out its raw `PGlite` object either; it opens its own `selfClient` and
 * returns that. This file is the one place PGlite-specific setup/teardown
 * is allowed to live, so application-code test files never import
 * `@electric-sql/pglite`/`pglite-age`/`pglite-pgvector` themselves.
 *
 * `openClient()` opens a FRESH connection every call — `beforeEach` should
 * call it per test, not share one connection across a whole file. This is
 * load-bearing, not a style preference: `@electric-sql/pglite-socket` has
 * confirmed, open upstream bugs (electric-sql/pglite#1046) in how its
 * `QueryQueueManager` serializes concurrent connections — "Defect A"
 * interleaves two connections' extended-protocol message batches (Parse/
 * Bind/Describe/Execute/Sync) into the single shared PGlite session,
 * clobbering the unnamed prepared statement between them, with no
 * transaction required to trigger it. We reproduced this independently
 * (2026-08-18, see the postgres-age skill's "Upstream filing") before
 * finding the issue already open: a `pg.Client` connection that hits enough
 * of this eventually desyncs permanently ("unexpected parseComplete
 * message from backend", or silently wrong rows) and stays broken for the
 * rest of its life — but confirmed empirically that the corruption stays
 * contained to the connection that hit it; a brand new connection against
 * the same underlying PGlite instance is immediately clean. One shared
 * connection for an entire test file means one bad interaction anywhere in
 * that file can cascade into failing every test after it, at an
 * unpredictable point — which is exactly the flakiness this design avoids.
 *
 * **This header has been read as explaining the suite's intermittent failures.
 * It does not, and that misattribution cost two investigations.** The
 * `graph "labkit_t1" does not exist` and `Connection terminated` bursts were a
 * teardown race, not Defect A: bun's 5000ms per-test timeout does not cancel
 * the test body, so an overrunning test keeps executing while the next one
 * starts, and its late `scenario.end()` reset the database and closed the next
 * test's connection. **That cascade was fixed on 2026-08-22** — see
 * `tests/helpers/scenario.ts` and `tests/scenario-harness.test.ts`. Tests can
 * still cross the ceiling and fail; what they can no longer do is take the
 * next test with them. Instrumentation across a failing run tracked 59,086
 * queries with **zero** unfinished and found no desync signature at all.
 *
 * The last sentence here used to blame `provisionTenantGraph()`. It was wrong —
 * see CLAUDE.md, which carries the 2026-08-24 profile.
 */
export interface TestDb {
  /** Opens a fresh, independently-bootstrapped connection — call in `beforeEach`, not once for the whole file. See the file-level comment. */
  openClient(label?: string): Promise<LabKitDB & { close(): Promise<void> }>;
  /** Drops every AGE graph and truncates every LabKit-owned table — call in `afterEach`, before closing that test's client. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

/**
 * The one PGlite instance the whole suite shares, booted on first use.
 *
 * **Booting is the single largest cost in the suite and it was paid 44 times.**
 * Measured 2026-08-24: `setupTestDb()` takes ~900ms on a quiet machine and
 * **~2.5s with ten cores saturated**, while connecting and querying afterwards
 * cost 2-13ms. Forty-four files each called it from `beforeAll`, so 44-110s of a
 * ~200s suite was booting WASM, running migrations and starting socket servers
 * — which is why the query-count and off-budget work only moved 5-7%: both
 * optimised the minority.
 *
 * Bun runs every test file in one process, so one instance serves all of them.
 * Isolation is unchanged and still comes from `reset()`, which truncates
 * between tests, and from `openClient()`, which hands each test its own
 * connection — the containment for the pglite-socket defect described above.
 *
 * Graphs survive between files because `reset()` truncates rather than drops,
 * deliberately (see `reset()`), so the second file onward finds provisioning's
 * six-query steady path instead of its 83-query cold one.
 */
let shared:
  | Promise<{
      rawDb: PGlite;
      server: PGLiteSocketServer;
      host: string;
      port: number;
    }>
  | undefined;

async function boot() {
  const rawDb = new PGlite({ extensions: { age, vector } });

  // Migration ordering mirrors backend.ts's primary role exactly: migrate
  // the raw PGlite instance, then start serving it — runMigrations() is
  // typed to PGlite specifically (drizzle-orm/pglite/migrator needs the
  // concrete instance), so this is the one step that can't go through a
  // client below.
  await runMigrations(rawDb);
  await bootstrapSession(rawDb);

  const server = new PGLiteSocketServer({
    db: rawDb,
    port: 0,
    host: "127.0.0.1",
    maxConnections: 16,
  });
  await server.start();
  const [host, portStr] = server.getServerConn().split(":");
  return { rawDb, server, host: host!, port: Number(portStr) };
}

export async function setupTestDb(): Promise<TestDb> {
  shared ??= boot();
  const { host, port } = await shared;

  let opened = 0;
  async function openClient(label?: string): Promise<LabKitDB & { close(): Promise<void> }> {
    const c = new Client({
      host,
      port,
      database: "postgres",
      user: "postgres",
    });
    await c.connect();
    await bootstrapSession(c);
    // Traced only when LABKIT_TRACE is set; otherwise `traced()` hands back the
    // same object and this costs nothing. Labelled per connection because
    // telling two connections apart is most of what a trace is for -- the
    // teardown race described above is invisible without it.
    const db = traced({ query: c.query.bind(c) }, label ?? `conn-${++opened}`);
    return { query: db.query, close: () => c.end() };
  }

  // Dedicated to reset()/teardown, deliberately separate from whatever
  // connection each test opens for itself via openClient() — reset() runs
  // every test, so it's the one connection worth keeping simple and
  // unlikely to ever see an errored query itself.
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
        // No params — relies on pg's simple query protocol to run multiple
        // semicolon-separated statements in one call, unlike PGlite's
        // prepared-statement protocol (see CLAUDE.md's migrations note).
        await admin.query(`
          set session_replication_role = replica;
          truncate ${tableNames.join(", ")} restart identity cascade;
          set session_replication_role = DEFAULT;
        `);
      }
    },
    /**
     * Closes this file's admin connection and **leaves the shared instance
     * running** for the files after it.
     *
     * Tearing it down here would defeat the point: bun runs files in sequence,
     * so the first `afterAll` would kill the instance and the next file would
     * boot another. The process exits when the run ends and takes the socket
     * server and the WASM instance with it.
     */
    async close() {
      await admin.close();
    },
  };
}
