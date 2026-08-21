import { PGlite } from "@electric-sql/pglite";
import { age } from "@electric-sql/pglite-age";
import { vector } from "@electric-sql/pglite-pgvector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Client } from "pg";
import { runMigrations } from "../../src/db/migrate";
import { bootstrapSession, type LabKitDB } from "../../src/db/client";
import { dropTenantGraph } from "../../src/db/provisioning";
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
 * `graph "labkit_t1" does not exist` and `Connection terminated` bursts are a
 * teardown race, not Defect A: bun's 5000ms per-test timeout does not cancel
 * the test body, so an overrunning test keeps executing while the next one
 * starts, and its late `scenario.end()` resets the database and closes the next
 * test's connection. Instrumentation across a failing run tracked 59,086
 * queries with **zero** unfinished and found no desync signature at all. What
 * pushes a test to the ceiling is `provisionTenantGraph()` re-checking every
 * node and edge label on each `begin()` and `current()`. See `docs/TASKS.md`.
 */
export interface TestDb {
  /** Opens a fresh, independently-bootstrapped connection — call in `beforeEach`, not once for the whole file. See the file-level comment. */
  openClient(label?: string): Promise<LabKitDB & { close(): Promise<void> }>;
  /** Drops every AGE graph and truncates every LabKit-owned table — call in `afterEach`, before closing that test's client. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function setupTestDb(): Promise<TestDb> {
  const rawDb = new PGlite({ extensions: { age, vector } });

  // Migration ordering mirrors backend.ts's primary role exactly: migrate
  // the raw PGlite instance, then start serving it — runMigrations() is
  // typed to PGlite specifically (drizzle-orm/pglite/migrator needs the
  // concrete instance), so this is the one step that can't go through a
  // client below.
  await runMigrations(rawDb);
  await bootstrapSession(rawDb);

  const server = new PGLiteSocketServer({ db: rawDb, port: 0, host: "127.0.0.1", maxConnections: 16 });
  await server.start();
  const [host, portStr] = server.getServerConn().split(":");
  const port = Number(portStr);

  let opened = 0;
  async function openClient(label?: string): Promise<LabKitDB & { close(): Promise<void> }> {
    const c = new Client({ host, port, database: "postgres", user: "postgres" });
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
    async reset() {
      const graphs = await admin.query<{ name: string }>(`SELECT name FROM ag_catalog.ag_graph`);
      for (const { name } of graphs.rows) {
        await dropTenantGraph(admin, name);
      }

      const tables = await admin.query<{ table_schema: string; table_name: string }>(`
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
    async close() {
      await admin.close();
      await server.stop();
      await rawDb.close();
    },
  };
}
