/**
 * Harness for the acceptance scenarios.
 */

import { resolveTenantContext, type TenantContext } from "../../src/db/tenant";
import { TenantGraph } from "../../src/db/graph";
import { setupTestDb, type TestClient, type TestDb } from "./db";

export interface Scenario {
  /** A fresh, empty tenant graph for one test. */
  begin(): Promise<TenantGraph>;
  /**
   * A second reader over the same graph — what an "Afterward" answer is re-asserted through.
   */
  current(): Promise<TenantGraph>;
  end(): Promise<void>;
  close(): Promise<void>;
}

export async function openScenario(): Promise<Scenario> {
  const testDb: TestDb = await setupTestDb();

  /**
   * Connections opened by `begin()` and not yet closed by `end()`, oldest first. **Normally
   * length one**; it reaches two exactly when a test overran bun's ceiling and the next one
   * started while its body was still running.
   */
  const open: TestClient[] = [];

  /**
   * The `TenantContext` the most recent `begin()` resolved.
   */
  let ctx: TenantContext | undefined;

  return {
    async begin() {
      // Normally a no-op, and that is the point. `open` is empty on the happy path, because the
      // previous test's `end()` already reset — off-budget, in `afterEach`. It is non-empty
      // only when the previous test overran bun's ceiling and never tore down, and *that*
      // test's `end()` will find this connection open and skip its reset.
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

      // Reset only when nothing is left running. A late teardown from an abandoned test finds
      // the live test's connection still open and skips it — without that check, it would drop
      // the graphs of a test already querying them.
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
