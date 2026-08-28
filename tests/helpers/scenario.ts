/**
 * Harness for the PJ-008 acceptance scenarios.
 *
 * Scenario tests assert that a researcher's intent can be carried out through
 * research verbs alone, so they must not import `src/db` — see the header of
 * tests/scenarios/s11_invalidate_analysis.test.ts. This file is the one place
 * allowed to know about tenants, graphs and connections, because it is
 * harness rather than caller: it hands the scenario a ready session target
 * and takes care of isolation between tests.
 */

import { resolveTenantContext, type TenantContext } from "../../src/db/tenant";
import { TenantGraph } from "../../src/db/graph";
import { setupTestDb, type TestClient, type TestDb } from "./db";

export interface Scenario {
  /** A fresh, empty tenant graph for one test. */
  begin(): Promise<TenantGraph>;
  /**
   * A second reader over the same graph — what an "Afterward" answer is
   * re-asserted through.
   *
   * Be precise about what this proves, because it is less than it looks.
   * It builds a **new** `TenantGraph`, so an assertion made through it cannot
   * be reading a value the test kept in a local variable, and it would catch
   * a `ResearchSession` or `TenantGraph` that started memoising. Today
   * neither holds any query state, so against a plain re-query on the same
   * session the marginal proof is **nil** — checked, not assumed: pointing
   * every durable read in S-3 back at the writing session leaves all nine
   * tests passing. This is cheap insurance against a future cache, not a
   * proof in itself, and it should not be described as one.
   *
   * It reuses the `TenantContext` `begin()` already resolved, rather than
   * calling `resolveTenantContext()` a second time. That call's
   * reconciliation pass is what `begin()` exists to prove happened; repeating
   * it microseconds later against the same tenant is waste, not a second
   * proof, and `begin()` still runs it unconditionally — the self-healing
   * guarantee PJ-005 argued for is exactly as strong as before. `TenantContext`
   * (`src/db/tenant.ts`) is plain `{tenantId, graphName}` data with no query
   * state of its own, so reusing it carries none of the memoising risk this
   * method exists to catch — that risk lives in the `TenantGraph`/
   * `ResearchSession` instance, and this still builds a fresh one every call.
   *
   * It does **not** open a new connection, and cannot: the suite shares one
   * database session (tests/helpers/db.ts). "Durable" here means *in the graph
   * rather than in memory*, not *survives a reconnect* — which was true when
   * this said the reason was containing a pglite-socket defect, and is true now
   * for a plainer reason.
   */
  current(): Promise<TenantGraph>;
  end(): Promise<void>;
  close(): Promise<void>;
}

export async function openScenario(): Promise<Scenario> {
  const testDb: TestDb = await setupTestDb();

  /**
   * Connections opened by `begin()` and not yet closed by `end()`, oldest
   * first. **Normally length one**; it reaches two exactly when a test
   * overran bun's ceiling and the next one started while its body was still
   * running.
   *
   * A single mutable `db` was what made that case destructive: the overrunning
   * test's late `end()` closed whatever `db` pointed at, and by then it pointed
   * at the *next* test's connection. See the header note below.
   */
  const open: TestClient[] = [];

  /**
   * The `TenantContext` the most recent `begin()` resolved. `current()`
   * reuses it instead of calling `resolveTenantContext()` again, so it does
   * not pay for a second full reconciliation pass on the same tenant
   * microseconds later — see the doc comment on `Scenario.current()` for why
   * that is sound. Always set in the same `begin()` call that pushes onto
   * `open`, so the two describe the same test's connection.
   */
  let ctx: TenantContext | undefined;

  return {
    async begin() {
      // Normally a no-op, and that is the point. `open` is empty on the happy
      // path, because the previous test's `end()` already reset — off-budget,
      // in `afterEach`. It is non-empty only when the previous test overran
      // bun's ceiling and never tore down, and *that* test's `end()` will find
      // this connection open and skip its reset. So this is the one place the
      // reset can happen for an abandoned predecessor, and it costs the normal
      // path nothing.
      if (open.length > 0) await testDb.reset();
      // A fresh connection per test -- see tests/helpers/db.ts on why that is
      // load-bearing rather than tidiness.
      const db = await testDb.openClient(`test-${open.length + 1}`);
      open.push(db);
      ctx = await resolveTenantContext(db, db.tx, "labkit");
      return new TenantGraph(ctx, db, db.tx);
    },
    async current() {
      const db = open[open.length - 1];
      if (!db || !ctx) throw new Error("scenario not begun");
      // The *same* transactor as `begin()`'s graph, not a second one: they are
      // one connection, so they are one transaction. See src/db/transactor.ts.
      return new TenantGraph(ctx, db, db.tx);
    },
    async end() {
      // Oldest first, which is the order `end()` calls arrive in even when one
      // of them is late: the overrunning test began first, so it also reaches
      // its own `end()` first. It therefore closes *its* connection and not
      // the live test's.
      await open.shift()?.close();

      // Reset only when nothing is left running. A late teardown from an
      // abandoned test finds the live test's connection still open and skips
      // it, which is the whole cascade: it used to drop the graphs of a test
      // already querying them.
      //
      // **Kept here rather than moved into `begin()`, and that placement is
      // load-bearing.** Twenty-three of the twenty-nine files call `end()`
      // from `afterEach`, which bun runs *outside* the per-test timeout, so
      // this cost is off-budget where it is. Moving it to `begin()` — tried,
      // measured, reverted — puts a graph drop and a truncate inside every
      // test's 5000ms allowance and pushes more tests over the ceiling than
      // the cascade ever cost: paired A/B gave BASE 0 failures in two runs,
      // that version 18 failures in one of two, at the lowest load of the
      // four.
      if (open.length === 0) await testDb.reset();
    },
    async close() {
      // Anything a test never ended -- an abandoned body that was still
      // running when the file finished.
      while (open.length > 0)
        await open
          .shift()
          ?.close()
          .catch(() => {});
      await testDb.close();
    },
  };
}
