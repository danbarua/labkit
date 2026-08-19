/**
 * Additive reconciliation of a tenant graph (PJ-005).
 *
 * `provisionTenantGraph()` re-runs on every `resolveTenantContext()` call
 * specifically so a label or index added to the codebase reaches
 * tenants whose graphs were provisioned before that change shipped. This test
 * exercises that for the case it was built for — the S-11 edge additions
 * (`CONSUMES`, `EVALUATES: Review->EvidenceUnit`) were the first new edge
 * labels since the machinery landed, so "additive by design" had never
 * actually been demonstrated on the deployment path.
 *
 * Reconciliation is exercised through `resolveTenantContext()`, the same path
 * production uses, never by calling provisioning internals.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { setupTestDb, type TestDb } from "./helpers/db";
import { resolveTenantContext } from "../src/db/tenant";
import { TenantGraph } from "../src/db/graph";
import { scalar } from "../src/db/cypher";

let testDb: TestDb;
beforeAll(async () => { testDb = await setupTestDb(); });
afterAll(async () => { await testDb.close(); });

test("a tenant provisioned before CONSUMES/EVALUATES existed picks them up on re-resolve", async () => {
  const db = await testDb.openClient();
  const ctx = await resolveTenantContext(db, "labkit");

  // Simulate a graph provisioned by an older build: remove a label this
  // commit adds, leaving everything else intact.
  await db.query(`SELECT ag_catalog.drop_label($1, $2)`, [ctx.graphName, "CONSUMES"]);
  const gone = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ag_catalog.ag_label WHERE name = 'CONSUMES'
     AND graph = (SELECT graphid FROM ag_catalog.ag_graph WHERE name = $1)`, [ctx.graphName]);
  expect(gone.rows[0]!.n).toBe("0");

  // The production path: resolving the tenant again reconciles it.
  await resolveTenantContext(db, "labkit");

  const back = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ag_catalog.ag_label WHERE name = 'CONSUMES'
     AND graph = (SELECT graphid FROM ag_catalog.ag_graph WHERE name = $1)`, [ctx.graphName]);
  expect(back.rows[0]!.n).toBe("1");

  // ...and the edge is actually usable, plus its uniqueness index is back.
  const graph = new TenantGraph(ctx, db);
  const comp = await graph.createNode("Computation", { kind: "k", status: "done" });
  const art = await graph.createNode("Artefact", { kind: "observations", logical_name: "obs" });
  await graph.createEdge(comp.natural_id, "CONSUMES", art.natural_id);
  await graph.createEdge(comp.natural_id, "CONSUMES", art.natural_id); // idempotent
  const n = await graph.query(`MATCH (:Computation)-[e:CONSUMES]->(:Artefact) RETURN count(e)`,
    { count: scalar<number>() });
  expect(n[0]!.count).toBe(1);
  await db.close();
});
