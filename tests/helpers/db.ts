import { PGlite } from "@electric-sql/pglite";
import { age } from "@electric-sql/pglite-age";
import { runMigrations } from "../../src/db/migrate";
import { bootstrapSession, type LabKitDB } from "../../src/db/backend";
import { traced } from "../../src/db/trace";

/**
 * One PGlite instance for the whole suite, handed to application code through
 * the `LabKitDB` seam — the same shape production talks through.
 *
 * **This file used to wrap that instance in a `PGLiteSocketServer` and hand
 * every test a fresh `pg.Client`, and the reason it no longer does is that the
 * justification inverted.** The stated reason was fidelity: production talked
 * to PGlite over a socket, so tests should too. Production does not any more —
 * `src/db/backend.ts` takes an exclusive lock and opens the file directly — so
 * sharing the instance is now the *more* faithful arrangement, not a shortcut.
 *
 * The fresh-connection-per-test rule went with it, and that is the bigger
 * change. It existed to contain a confirmed upstream concurrency bug in
 * `@electric-sql/pglite-socket` (electric-sql/pglite#1046), where two
 * connections racing could permanently desync one of them; a brand new
 * connection was immediately clean, so a connection per test bounded the blast
 * radius. **The bug is the socket.** With no socket there is nothing to
 * contain, and `openClient()` is now a labelled view onto the one session
 * rather than a real connection.
 *
 * Two consequences worth knowing before writing a test against this:
 *
 * - **`close()` on an opened client is a no-op**, kept so the harness's
 *   open/close bookkeeping (`tests/helpers/scenario.ts`) reads the same as it
 *   always did. Nothing here can prove that state survives a *reconnect*; it
 *   never could, and `Scenario.current()` says so in its own doc comment.
 * - **Session state is shared**, because there is one session. `search_path`,
 *   `SET ROLE` and any other session-scoped GUC set by one test is visible to
 *   the next. A test that wants its own session scoping has to open its own
 *   backend, as `tests/connection-lock.test.ts` does.
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
  /** A labelled view onto the shared session. Its `close()` is a no-op — see the file-level comment. */
  openClient(label?: string): Promise<LabKitDB & { close(): Promise<void> }>;
  /** Drops every AGE graph and truncates every LabKit-owned table — call in `afterEach`. */
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
 * Isolation comes from `reset()`, which truncates between tests.
 *
 * Graphs survive between files because `reset()` truncates rather than drops,
 * deliberately (see `reset()`), so the second file onward finds provisioning's
 * six-query steady path instead of its 83-query cold one.
 */
let shared: Promise<PGlite> | undefined;

async function boot(): Promise<PGlite> {
  const rawDb = new PGlite({ extensions: { age } });
  await runMigrations(rawDb);
  await bootstrapSession(rawDb);
  return rawDb;
}

export async function setupTestDb(): Promise<TestDb> {
  shared ??= boot();
  const rawDb = await shared;

  let opened = 0;
  async function openClient(label?: string): Promise<LabKitDB & { close(): Promise<void> }> {
    // Traced only when LABKIT_TRACE is set; otherwise `traced()` hands back the
    // same object and this costs nothing. Labelled per logical client because
    // telling two of them apart is most of what a trace is for — the teardown
    // race described above is invisible without it.
    const db = traced(
      { query: (sql, params) => rawDb.query(sql, params as unknown[]) },
      label ?? `conn-${++opened}`,
    );
    return { query: db.query, close: async () => {} };
  }

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
        // Three calls, not one semicolon-separated string. That form worked
        // over `pg`'s simple query protocol and **throws** against a raw PGlite
        // instance — `cannot insert multiple commands into a prepared
        // statement` — which is the same restriction the custom migrations
        // work around with `--> statement-breakpoint` (see CLAUDE.md).
        await admin.query(`set session_replication_role = replica;`);
        await admin.query(`truncate ${tableNames.join(", ")} restart identity cascade;`);
        await admin.query(`set session_replication_role = DEFAULT;`);
      }
    },
    /**
     * **Leaves the shared instance running** for the files after it.
     *
     * Tearing it down here would defeat the point: bun runs files in sequence,
     * so the first `afterAll` would kill the instance and the next file would
     * boot another. The process exits when the run ends and takes the WASM
     * instance with it.
     */
    async close() {
      await admin.close();
    },
  };
}
