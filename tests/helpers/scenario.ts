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

import { resolveTenantContext } from "../../src/db/tenant";
import { TenantGraph } from "../../src/db/graph";
import type { LabKitDB } from "../../src/db/client";
import { setupTestDb, type TestDb } from "./db";

export interface Scenario {
  /** A fresh, empty tenant graph for one test. */
  begin(): Promise<TenantGraph>;
  /**
   * A second reader over the same graph — what an "Afterward" answer is
   * re-asserted through.
   *
   * Be precise about what this proves, because it is less than it looks.
   * It re-resolves the tenant and builds a **new** `TenantGraph`, so an
   * assertion made through it cannot be reading a value the test kept in a
   * local variable, and it would catch a `ResearchSession` or `TenantGraph`
   * that started memoising. Today neither holds any query state, so against a
   * plain re-query on the same session the marginal proof is **nil** — checked,
   * not assumed: pointing every durable read in S-3 back at the writing session
   * leaves all nine tests passing. This is cheap insurance against a future
   * cache, not a proof in itself, and it should not be described as one.
   *
   * It deliberately does **not** open a new connection: `@electric-sql/pglite-socket`
   * has a confirmed concurrency bug (see tests/helpers/db.ts and PJ-006), so
   * one connection per test is the containment strategy. "Durable" here means
   * *in the graph rather than in memory*, not *survives a reconnect*.
   */
  current(): Promise<TenantGraph>;
  end(): Promise<void>;
  close(): Promise<void>;
}

export async function openScenario(): Promise<Scenario> {
  const testDb: TestDb = await setupTestDb();
  let db: (LabKitDB & { close(): Promise<void> }) | undefined;

  return {
    async begin() {
      // A fresh connection per test -- see tests/helpers/db.ts on why that is
      // load-bearing rather than tidiness.
      db = await testDb.openClient();
      const ctx = await resolveTenantContext(db, "labkit");
      return new TenantGraph(ctx, db);
    },
    async current() {
      if (!db) throw new Error("scenario not begun");
      const ctx = await resolveTenantContext(db, "labkit");
      return new TenantGraph(ctx, db);
    },
    async end() {
      await testDb.reset();
      await db?.close();
      db = undefined;
    },
    async close() {
      await testDb.close();
    },
  };
}
