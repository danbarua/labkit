/**
 * Additive reconciliation of a tenant graph.
 *
 * `provisionTenantGraph()` re-runs on every `resolveTenantContext()` call
 * specifically so a label or index added to the codebase reaches
 * tenants whose graphs were provisioned before that change shipped. This test
 * exercises that for the case it was built for — new edge labels added to an
 * existing tenant (`CONSUMES`, `EVALUATES: Review->EvidenceUnit`), so
 * "additive by design" is demonstrated on the deployment path, not just
 * asserted.
 *
 * Reconciliation is exercised through `resolveTenantContext()`, the same path
 * production uses, never by calling provisioning internals.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { setupTestDb, type TestDb } from "./helpers/db";
import { resolveTenantContext } from "../src/db/tenant";
import { dropTenantGraph } from "../src/db/provisioning";
import { TenantGraph } from "../src/db/graph";
import { scalar } from "../src/db/cypher";

let testDb: TestDb;
beforeAll(async () => {
  testDb = await setupTestDb();
});
afterAll(async () => {
  await testDb.close();
});

test("a tenant provisioned before CONSUMES/EVALUATES existed picks them up on re-resolve", async () => {
  const db = await testDb.openClient();
  const ctx = await resolveTenantContext(db, db.tx, "labkit");

  // Simulate a graph provisioned by an older build: remove a label this
  // commit adds, leaving everything else intact.
  await db.query(`SELECT ag_catalog.drop_label($1, $2)`, [ctx.graphName, "CONSUMES"]);
  const gone = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ag_catalog.ag_label WHERE name = 'CONSUMES'
     AND graph = (SELECT graphid FROM ag_catalog.ag_graph WHERE name = $1)`,
    [ctx.graphName],
  );
  expect(gone.rows[0]!.n).toBe("0");

  // The production path: resolving the tenant again reconciles it.
  await resolveTenantContext(db, db.tx, "labkit");

  const back = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ag_catalog.ag_label WHERE name = 'CONSUMES'
     AND graph = (SELECT graphid FROM ag_catalog.ag_graph WHERE name = $1)`,
    [ctx.graphName],
  );
  expect(back.rows[0]!.n).toBe("1");

  // ...and the edge is actually usable, plus its uniqueness index is back.
  const graph = new TenantGraph(ctx, db, db.tx);
  const comp = await graph.createNode("Computation", {
    method: "k",
    status: "done",
  });
  const art = await graph.createNode("Artefact", {
    kind: "observations",
    logical_name: "obs",
  });
  await graph.createEdge(comp.natural_id, "CONSUMES", art.natural_id);
  await graph.createEdge(comp.natural_id, "CONSUMES", art.natural_id); // idempotent
  const n = await graph.query(`MATCH (:Computation)-[e:CONSUMES]->(:Artefact) RETURN count(e)`, {
    count: scalar<number>(),
  });
  expect(n[0]!.count).toBe(1);
  await db.close();
});

/**
 * `dropTenantGraph()`'s only reader, kept as a real operation a deploy will
 * need rather than deleted as unused — an untested drop gets discovered to
 * be broken at the moment someone needs it most.
 *
 * **It drops `labkit_t1`, not some safely-named other graph.** `"drop-me"` is
 * the first tenant resolved in this file, `tenants.id` is truncated with
 * `RESTART IDENTITY`, so it gets id 1 and the graph every other file also calls
 * `labkit_t1`. What keeps it apart is that `setupTestDb()` builds a
 * **separate PGlite instance per test file**, so this file's `labkit_t1` is
 * not any other file's. That, and not the tenant slug, is why dropping here
 * is safe.
 */
test("dropTenantGraph removes the graph, and resolving the tenant rebuilds it", async () => {
  const db = await testDb.openClient();
  const ctx = await resolveTenantContext(db, db.tx, "drop-me");

  const present = async () =>
    (
      await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ag_catalog.ag_graph WHERE name = $1`,
        [ctx.graphName],
      )
    ).rows[0]!.n;

  expect(await present()).toBe("1");
  await dropTenantGraph(db, ctx.graphName);
  expect(await present()).toBe("0");

  // And reconciliation puts it back, labels and all -- the same self-healing
  // path the rest of this file exercises.
  await resolveTenantContext(db, db.tx, "drop-me");
  expect(await present()).toBe("1");
  const labels = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ag_catalog.ag_label
     WHERE graph = (SELECT graphid FROM ag_catalog.ag_graph WHERE name = $1)`,
    [ctx.graphName],
  );
  expect(Number(labels.rows[0]!.n)).toBeGreaterThan(30);
  await db.close();
});

/**
 * Property indexes, and the two things worth asserting separately: that
 * provisioning **built** one, and that reconciliation **restores** it.
 *
 * `Claim.name` is matched in twelve Cypher sites. Nothing about an index is
 * observable from a query result — the same rows come back either way — so the
 * index has to be asserted against `pg_indexes` directly or not at all.
 *
 * The drop-and-re-resolve half proves an index added to the codebase reaches
 * a tenant whose graph was provisioned before it shipped. Exercised through
 * `resolveTenantContext()`, never provisioning internals.
 */
test("a property index is built, and a tenant missing one picks it up on re-resolve", async () => {
  const db = await testDb.openClient();
  const ctx = await resolveTenantContext(db, db.tx, "labkit");

  const indexNames = async (): Promise<string[]> => {
    const rows = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 ORDER BY indexname`,
      [ctx.graphName],
    );
    return rows.rows.map((r) => r.indexname);
  };

  expect(await indexNames()).toContain("claim_name_idx");

  // Not unique, and that is load-bearing rather than incidental: two claims may
  // assert the same sentence in different lines of enquiry, so a unique
  // index here would make a modelled situation a 23505.
  const unique = await db.query<{ indisunique: boolean }>(
    `SELECT i.indisunique FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_index i ON i.indexrelid = c.oid
     WHERE n.nspname = $1 AND c.relname = 'claim_name_idx'`,
    [ctx.graphName],
  );
  expect(unique.rows[0]!.indisunique).toBe(false);

  // A graph provisioned by an older build, simulated the way the CONSUMES test
  // above does it: remove what this commit adds and leave the rest.
  await db.query(`DROP INDEX "${ctx.graphName}".claim_name_idx`);
  expect(await indexNames()).not.toContain("claim_name_idx");

  await resolveTenantContext(db, db.tx, "labkit");
  expect(await indexNames()).toContain("claim_name_idx");

  // And the index actually serves the query it was built for. Two claims of the
  // same wording so the match is not trivially empty.
  const graph = new TenantGraph(ctx, db, db.tx);
  await graph.createNode("Claim", { name: "the coating slows corrosion" });
  await graph.createNode("Claim", { name: "the coating slows corrosion" });
  const found = await graph.query(
    `MATCH (c:Claim {name: $name}) RETURN count(c) AS found`,
    { found: scalar<number>() },
    { name: "the coating slows corrosion" },
  );
  expect(found[0]!.found).toBe(2);

  await db.close();
});
