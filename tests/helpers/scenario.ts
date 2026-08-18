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
  /** The same graph again, for asserting that state is durable rather than held in a session's memory. */
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
