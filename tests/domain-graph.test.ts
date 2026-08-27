import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { TenantGraph } from "../src/db/graph";
import { agtypeValue, edgeProps, optional, scalar, vertexProps } from "../src/db/cypher";
import {
  NODE_LABELS,
  NODE_TYPES,
  type NodeLabel,
  type NodePropsByLabel,
  type ClaimProps,
  type ComputationProps,
  type DecisionProps,
  type EvidenceProps,
  type LineOfEnquiryProps,
} from "../src/db/domain";
import type { LabKitDB } from "../src/db/backend";
import { resolveTenantContext, type TenantContext } from "../src/db/tenant";
import { setupTestDb, type TestClient, type TestDb } from "./helpers/db";
import { transactor } from "../src/db/transactor";

/**
 * Exercises the LabKit domain model (docs/project-journal/001_git_init.md,
 * revised by docs/project-journal/003_review_domain_tenancy.md and
 * docs/project-journal/004_tenancy_implementation_plan.md) against Apache
 * AGE, migrated and provisioned the same way a real connection would be
 * (runMigrations() + resolveTenantContext(), not hand-rolled setup) and
 * queried through the same `LabKitDB` seam production uses (see
 * tests/helpers/db.ts).
 * Each test corresponds to one of the journal's MVP acceptance-criteria
 * questions, or one of PJ-003 §15 / PJ-004's acceptance tests.
 */

let testDb: TestDb;
let db: TestClient;
let ctx: TenantContext;
let graph: TenantGraph;

beforeAll(async () => {
  testDb = await setupTestDb();
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  // One labelled client per test. Several tests in this file deliberately
  // provoke DB-level errors, which used to be load-bearing: a pglite-socket
  // defect could permanently corrupt a connection that saw enough of them, and
  // a connection per test bounded that. The socket is gone and so is the
  // defect — see tests/helpers/db.ts.
  db = await testDb.openClient();
  ctx = await resolveTenantContext(db, db.tx, "labkit");
  graph = new TenantGraph(ctx, db, db.tx);
});

afterEach(async () => {
  // Drops every AGE graph (this test's tenant plus any others a
  // multi-tenancy test created) and truncates every table — see
  // tests/helpers/db.ts, no per-test cleanup discipline required.
  await testDb.reset();
  await db.close();
});

async function seedResearchThread() {
  const question = await graph.createNode("Question", {
    name: "does the accelerated ridge implementation match the reference?",
    posed_at: "2026-01-01T00:00:00.000Z",
  });
  const lineOfEnquiry = await graph.createNode("LineOfEnquiry", {
    name: "numerical equivalence of accelerated ridge",
  });
  const evidenceUnit = await graph.createNode("EvidenceUnit", {
    role: "verification",
  });
  const computation = await graph.createNode("Computation", {
    kind: "equivalence_check",
    status: "completed",
    backend: "wandb",
    external_run_id: "run-42",
  });
  const evidence = await graph.createNode("Evidence", {
    statement: "evolved_T mean ΔMSE = -0.021, 95% CI [-0.025, -0.017]",
  });
  const artefact = await graph.createNode("Artefact", {
    kind: "json",
    logical_name: "stage2b_confirmatory_results",
    invalidated: false,
  });
  const claim = await graph.createNode("Claim", {
    name: "accelerated ridge is numerically equivalent to reference",
    kind: "confirmatory",
  });

  await graph.createEdge(question.natural_id, "MOTIVATES", lineOfEnquiry.natural_id);
  await graph.createEdge(lineOfEnquiry.natural_id, "REQUIRES", evidence.natural_id);
  await graph.createEdge(evidenceUnit.natural_id, "ADDRESSES", lineOfEnquiry.natural_id);
  await graph.createEdge(evidenceUnit.natural_id, "USES", computation.natural_id);
  await graph.createEdge(evidenceUnit.natural_id, "PRODUCES", evidence.natural_id);
  await graph.createEdge(evidence.natural_id, "RECORDED_IN", artefact.natural_id);
  await graph.createEdge(evidence.natural_id, "SUPPORTS", claim.natural_id);

  return {
    question,
    lineOfEnquiry,
    evidenceUnit,
    computation,
    evidence,
    artefact,
    claim,
  };
}

describe("evidence and computations supporting a claim", () => {
  test("shows evidence, the evidence unit, and the computation that generated it", async () => {
    const { claim } = await seedResearchThread();

    const rows = await graph.query(
      `MATCH (:Claim {natural_id: $claimId})<-[:SUPPORTS]-(e:Evidence)
       MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
       MATCH (u)-[:USES]->(comp:Computation)
       RETURN e, comp`,
      {
        e: vertexProps<EvidenceProps>(),
        comp: vertexProps<ComputationProps>(),
      },
      { claimId: claim.natural_id },
    );

    expect(rows).toHaveLength(1);
    const evidence = rows[0]!.e;
    const computation = rows[0]!.comp;
    expect(evidence).toMatchObject({
      statement: "evolved_T mean ΔMSE = -0.021, 95% CI [-0.025, -0.017]",
    });
    expect(computation).toMatchObject({
      external_run_id: "run-42",
      status: "completed",
    });
  });
});

describe("invalidation propagation", () => {
  test("finds claims, decisions, and lines of enquiry affected if an artefact is invalidated", async () => {
    const { artefact, claim, lineOfEnquiry, evidence } = await seedResearchThread();
    const decision = await graph.createNode("Decision", {
      reason: "promote accelerated ridge to production",
      invalidation_check: "equivalence within tolerance on held-out batch",
      decided_at: "2026-01-01T00:00:00.000Z",
    });
    await graph.createEdge(decision.natural_id, "BASED_ON", evidence.natural_id);

    // Follows only the edges that represent "depends on this evidence" —
    // RECORDED_IN/SUPPORTS/BASED_ON/REQUIRES — not PRODUCES/USES/ADDRESSES,
    // which are provenance of how the evidence came to exist and aren't
    // invalidated retroactively just because its durable record was.
    // "Affected" is not the same as "unsupported" (PJ-003 §11) — this
    // traversal answers "what needs reconsideration", not "what is now
    // false"; nothing here marks the claim unsupported.
    const rows = await graph.query(
      `MATCH (a:Artefact {natural_id: $artefactId})
       OPTIONAL MATCH (a)<-[:RECORDED_IN]-(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(claim:Claim)
       OPTIONAL MATCH (decision:Decision)-[:BASED_ON]->(e)
       OPTIONAL MATCH (loe:LineOfEnquiry)-[:REQUIRES]->(e)
       RETURN claim, decision, loe`,
      {
        claim: optional(vertexProps<ClaimProps>()),
        decision: optional(vertexProps<DecisionProps>()),
        loe: optional(vertexProps<LineOfEnquiryProps>()),
      },
      { artefactId: artefact.natural_id },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.claim).toMatchObject({ name: claim.properties.name });
    expect(rows[0]!.decision).toMatchObject({
      reason: decision.properties.reason,
    });
    expect(rows[0]!.loe).toMatchObject({ name: lineOfEnquiry.properties.name });
  });
});

describe("open lines of enquiry", () => {
  test("a line of enquiry is open when its motivating question has no resolving decision", async () => {
    const { lineOfEnquiry } = await seedResearchThread();

    const rows = await graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $loeId})
       OPTIONAL MATCH (d:Decision)-[:RESOLVES]->(q)
       RETURN q, d`,
      { q: vertexProps(), d: optional(vertexProps<DecisionProps>()) },
      { loeId: lineOfEnquiry.natural_id },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.d).toBeNull();
  });

  test("closes once a decision resolves the motivating question", async () => {
    const { question, lineOfEnquiry } = await seedResearchThread();
    const decision = await graph.createNode("Decision", {
      reason: "accelerated ridge confirmed equivalent",
      invalidation_check: "n/a",
      decided_at: "2026-01-01T00:00:00.000Z",
    });
    await graph.createEdge(decision.natural_id, "RESOLVES", question.natural_id);

    const rows = await graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $loeId})
       MATCH (d:Decision)-[:RESOLVES]->(q)
       RETURN d`,
      { d: vertexProps<DecisionProps>() },
      { loeId: lineOfEnquiry.natural_id },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.d).toMatchObject({
      reason: "accelerated ridge confirmed equivalent",
    });
  });
});

describe("failed/planned inquiry provenance", () => {
  test("answers 'why was this computation run' even with no resulting Evidence", async () => {
    const lineOfEnquiry = await graph.createNode("LineOfEnquiry", {
      name: "does approach X scale",
    });
    const evidenceUnit = await graph.createNode("EvidenceUnit", {
      role: "feasibility",
    });
    const computation = await graph.createNode("Computation", {
      kind: "scaling_probe",
      status: "failed",
    });

    await graph.createEdge(evidenceUnit.natural_id, "ADDRESSES", lineOfEnquiry.natural_id);
    await graph.createEdge(evidenceUnit.natural_id, "USES", computation.natural_id);
    // deliberately no Evidence/PRODUCES edge — the computation failed

    const rows = await graph.query(
      `MATCH (:Computation {natural_id: $compId})<-[:USES]-(:EvidenceUnit)-[:ADDRESSES]->(loe:LineOfEnquiry)
       RETURN loe`,
      { loe: vertexProps<LineOfEnquiryProps>() },
      { compId: computation.natural_id },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.loe).toMatchObject({ name: "does approach X scale" });
  });
});

describe("decision amendments", () => {
  test("an amendment is a decision that supersedes an earlier one", async () => {
    const d1 = await graph.createNode("Decision", {
      reason: "use float32 batching",
      invalidation_check: "n/a",
      decided_at: "2026-01-01T00:00:00.000Z",
    });
    const d2 = await graph.createNode("Decision", {
      reason: "switch to float64 for stability",
      invalidation_check: "n/a",
      decided_at: "2026-01-01T00:00:00.000Z",
    });
    await graph.createEdge(d2.natural_id, "SUPERSEDES", d1.natural_id);

    const rows = await graph.query(
      `MATCH (:Decision {natural_id: $id})-[:SUPERSEDES]->(old:Decision)
       RETURN old`,
      { old: vertexProps<DecisionProps>() },
      { id: d2.natural_id },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.old).toMatchObject({ reason: "use float32 batching" });
  });

  test("walks the full amendment chain back to the original decision", async () => {
    const d1 = await graph.createNode("Decision", {
      reason: "d1-original",
      invalidation_check: "n/a",
      decided_at: "2026-01-01T00:00:00.000Z",
    });
    const d2 = await graph.createNode("Decision", {
      reason: "d2-amendment",
      invalidation_check: "n/a",
      decided_at: "2026-01-01T00:00:00.000Z",
    });
    const d3 = await graph.createNode("Decision", {
      reason: "d3-amendment",
      invalidation_check: "n/a",
      decided_at: "2026-01-01T00:00:00.000Z",
    });
    await graph.createEdge(d3.natural_id, "SUPERSEDES", d2.natural_id);
    await graph.createEdge(d2.natural_id, "SUPERSEDES", d1.natural_id);

    const rows = await graph.query(
      `MATCH (:Decision {natural_id: $id})-[:SUPERSEDES*1..5]->(x:Decision)
       RETURN x`,
      { x: vertexProps<DecisionProps>() },
      { id: d3.natural_id },
    );

    const chain = rows.map((r) => r.x.reason);
    expect(chain).toEqual(["d2-amendment", "d1-original"]);
  });
});

describe("edge integrity", () => {
  test("createEdge throws when the (fromLabel, toLabel) pair isn't in EDGE_SCHEMA", async () => {
    const claim = await graph.createNode("Claim", { name: "c" });
    const loe = await graph.createNode("LineOfEnquiry", { name: "loe" });

    await expect(graph.createEdge(claim.natural_id, "MOTIVATES", loe.natural_id)).rejects.toThrow(
      /does not allow/,
    );
  });

  test("createEdge throws when the source natural id doesn't exist", async () => {
    const loe = await graph.createNode("LineOfEnquiry", { name: "loe" });
    await expect(graph.createEdge("Q_999", "MOTIVATES", loe.natural_id)).rejects.toThrow(
      /not found/,
    );
  });

  test("createEdge throws when the target natural id doesn't exist", async () => {
    const question = await graph.createNode("Question", {
      name: "q",
      posed_at: "2026-01-01T00:00:00.000Z",
    });
    await expect(graph.createEdge(question.natural_id, "MOTIVATES", "LOE_999")).rejects.toThrow(
      /not found/,
    );
  });

  test("createEdge is idempotent — calling it twice creates exactly one edge", async () => {
    const question = await graph.createNode("Question", {
      name: "q",
      posed_at: "2026-01-01T00:00:00.000Z",
    });
    const loe = await graph.createNode("LineOfEnquiry", { name: "loe" });

    await graph.createEdge(question.natural_id, "MOTIVATES", loe.natural_id);
    await graph.createEdge(question.natural_id, "MOTIVATES", loe.natural_id);

    const rows = await graph.query(
      `MATCH (:Question {natural_id: $qId})-[r:MOTIVATES]->(:LineOfEnquiry {natural_id: $loeId}) RETURN r`,
      { r: edgeProps() },
      { qId: question.natural_id, loeId: loe.natural_id },
    );
    expect(rows).toHaveLength(1);
  });
});

describe("Gate is reconnected to what it actually gates", () => {
  test("Criterion -> CriterionEvaluation -> Gate -> Computation chains all the way through", async () => {
    const criterion = await graph.createNode("Criterion", {
      proposition: "max_prediction_error <= 1e-8",
    });
    const evaluation = await graph.createNode("CriterionEvaluation", {
      value: "3.2e-9",
      outcome: "pass",
      evaluated_at: "2026-08-17T00:00:00Z",
    });
    const gate = await graph.createNode("Gate", {
      consequence: "accelerated ridge implementation may be promoted",
    });
    const computation = await graph.createNode("Computation", {
      kind: "promotion_run",
      status: "pending",
    });
    const evidence = await graph.createNode("Evidence", {
      statement: "3.2e-9 max error observed",
    });

    await graph.createEdge(criterion.natural_id, "EVALUATED_AS", evaluation.natural_id);
    await graph.createEdge(evaluation.natural_id, "TRIGGERS", gate.natural_id);
    await graph.createEdge(gate.natural_id, "GATES", computation.natural_id);
    // decision #5: evidence_ref replaced with a real edge
    await graph.createEdge(evaluation.natural_id, "BASED_ON", evidence.natural_id);

    const rows = await graph.query(
      `MATCH (:Criterion {natural_id: $critId})-[:EVALUATED_AS]->(:CriterionEvaluation {outcome: 'pass'})-[:TRIGGERS]->(:Gate)-[:GATES]->(comp:Computation)
       RETURN comp`,
      { comp: vertexProps<ComputationProps>() },
      { critId: criterion.natural_id },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.comp).toMatchObject({ kind: "promotion_run" });
  });
});

describe("all node labels", () => {
  // Minimal valid props per label's *Props interface in src/db/domain.ts.
  // Exists so every label (not just the ones exercised by the acceptance
  // queries above) actually round-trips through createNode(), which is the
  // only thing that would catch a NODE_TYPES[label].prefix entry drifting
  // out of sync with the sequence names in drizzle/0002_natural_ids.sql.
  //
  // Typed per-label rather than as Record<string, unknown>: a fixture that
  // doesn't satisfy its label's *Props interface is now a compile error
  // here, not a runtime surprise inside AGE.
  const fixtures: { [L in NodeLabel]: NodePropsByLabel[L] } = {
    Question: { name: "q", posed_at: "2026-01-01T00:00:00.000Z" },
    LineOfEnquiry: { name: "loe" },
    EvidenceUnit: { role: "experiment" },
    Evidence: { statement: "e" },
    Claim: { name: "c" },
    Decision: {
      reason: "r",
      invalidation_check: "x",
      decided_at: "2026-01-01T00:00:00.000Z",
    },
    Criterion: { proposition: "p" },
    CriterionEvaluation: {
      value: "v",
      outcome: "pass",
      evaluated_at: "2026-08-17T00:00:00Z",
    },
    Gate: { consequence: "c" },
    Review: { verdict: "v" },
    Artefact: { kind: "json", logical_name: "a" },
    Computation: { kind: "k", status: "s" },
    Task: { objective: "o", mayRead: ["a.csv"], outputs: "o", acceptance: "a" },
  };

  // Generic helper rather than an inline call: inside it `L` is a single
  // label, so `fixtures[L]` resolves to that label's props type. At the loop
  // itself `label` is the whole NodeLabel union and would not narrow.
  const createFixture = <L extends NodeLabel>(label: L) => graph.createNode(label, fixtures[label]);

  for (const label of NODE_LABELS) {
    test(`${label} creates with a well-formed natural id`, async () => {
      const node = await createFixture(label);
      expect(node.natural_id).toMatch(new RegExp(`^${NODE_TYPES[label].prefix}_\\d+$`));
      expect(node).not.toHaveProperty("id");
    });
  }
});

describe("tenant resolution", () => {
  test("resolving the same slug twice returns the same tenant", async () => {
    const again = await resolveTenantContext(db, db.tx, "labkit");
    expect(again.tenantId).toBe(ctx.tenantId);
    expect(again.graphName).toBe(ctx.graphName);
  });

  test("graph_name is derived server-side from the tenant id, never from the slug", async () => {
    const rows = await db.query<{
      id: number;
      slug: string;
      graph_name: string;
    }>(`select id, slug, graph_name from tenants where id = $1`, [ctx.tenantId]);
    expect(rows.rows[0]).toMatchObject({
      slug: "labkit",
      graph_name: `labkit_t${ctx.tenantId}`,
    });
  });
});

describe("tenant isolation", () => {
  test("two tenants can hold nodes with identical properties without any query crossing between them", async () => {
    const ctxA = await resolveTenantContext(db, db.tx, "tenant-a");
    const ctxB = await resolveTenantContext(db, db.tx, "tenant-b");
    expect(ctxA.graphName).not.toBe(ctxB.graphName);
    const graphA = new TenantGraph(ctxA, db, db.tx);
    const graphB = new TenantGraph(ctxB, db, db.tx);

    const claimA = await graphA.createNode("Claim", { name: "x" });
    const claimB = await graphB.createNode("Claim", { name: "x" });
    expect(claimA.natural_id).not.toBe(claimB.natural_id); // natural ids are global, but the nodes are still in disjoint graphs

    const rowsA = await graphA.query(`MATCH (c:Claim) RETURN c`, {
      c: vertexProps<ClaimProps>(),
    });
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]!.c).toMatchObject({ name: "x" });
  });

  test("an edge operation in tenant A cannot address a node that lives in tenant B", async () => {
    const ctxA = await resolveTenantContext(db, db.tx, "tenant-a");
    const ctxB = await resolveTenantContext(db, db.tx, "tenant-b");
    const graphA = new TenantGraph(ctxA, db, db.tx);
    const graphB = new TenantGraph(ctxB, db, db.tx);

    const questionA = await graphA.createNode("Question", {
      name: "q-in-a",
      posed_at: "2026-01-01T00:00:00.000Z",
    });
    const loeB = await graphB.createNode("LineOfEnquiry", { name: "loe-in-b" });

    await expect(
      graphA.createEdge(questionA.natural_id, "MOTIVATES", loeB.natural_id),
    ).rejects.toThrow(/not found/);
  });
});

describe("provisioning reconciliation", () => {
  // Every test here re-resolves the SAME production path
  // (resolveTenantContext -> provisionTenantGraph, transaction + advisory
  // lock) that every real connection uses — not an internal reconciliation
  // function called directly. Reconciliation that only a test can reach
  // isn't the thing being claimed; it has to hold for actual tenant
  // resolution, unconditionally, every time.

  test("re-resolving the tenant restores a dropped natural-id index", async () => {
    await db.query(`DROP INDEX "${ctx.graphName}".claim_natural_id_idx`);
    const before = await db.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = 'claim_natural_id_idx'`,
      [ctx.graphName],
    );
    expect(before.rows).toHaveLength(0);

    await resolveTenantContext(db, db.tx, "labkit");

    const after = await db.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = 'claim_natural_id_idx'`,
      [ctx.graphName],
    );
    expect(after.rows).toHaveLength(1);
  });

  test("a new NODE_LABELS entry reaches an already-provisioned tenant on the next resolution", async () => {
    // Simulates "the codebase gained a label after this tenant was already
    // provisioned" without actually changing NODE_LABELS: drop one label's
    // vertex table entirely (as if it never existed for this tenant), then
    // confirm the next ordinary resolveTenantContext() call notices and
    // recreates it — this is exactly the schema-evolution gap PJ-004's
    // original all-or-nothing "provision only if the graph itself is
    // absent" check couldn't close, now proven closed through the real
    // path rather than a test-only shortcut.
    await db.query(`SELECT ag_catalog.drop_label($1, 'Task', false)`, [ctx.graphName]);
    const before = await db.query(
      `SELECT 1 FROM ag_catalog.ag_label WHERE name = 'Task' AND graph = (SELECT graphid FROM ag_catalog.ag_graph WHERE name = $1)`,
      [ctx.graphName],
    );
    expect(before.rows).toHaveLength(0);

    await resolveTenantContext(db, db.tx, "labkit");

    const task = await graph.createNode("Task", {
      objective: "o",
      mayRead: ["a.csv"],
      outputs: "o",
      acceptance: "a",
    });
    expect(task.natural_id).toMatch(/^TASK_\d+$/);
  });
});

describe("edge uniqueness is DB-enforced, not just app-checked", () => {
  test("a duplicate CREATE that bypasses the app-level check is still blocked at the database", async () => {
    const question = await graph.createNode("Question", {
      name: "q",
      posed_at: "2026-01-01T00:00:00.000Z",
    });
    const loe = await graph.createNode("LineOfEnquiry", { name: "loe" });
    await graph.createEdge(question.natural_id, "MOTIVATES", loe.natural_id);

    // Bypass TenantGraph.createEdge()'s own existence check to prove the
    // constraint — not the app-level check — is what's actually stopping
    // a second edge.
    await expect(
      graph.query(
        `MATCH (a:Question {natural_id: $from}), (b:LineOfEnquiry {natural_id: $to}) CREATE (a)-[:MOTIVATES]->(b)`,
        { x: vertexProps() },
        { from: question.natural_id, to: loe.natural_id },
      ),
    ).rejects.toThrow(/duplicate key value violates unique constraint/);
  });

  // NOT a real Promise.all() race against two live connections, and the reason
  // has outlived the bug it started as. It was originally that concurrent
  // queries against pglite-socket were not reliable enough to depend on
  // (confirmed 2026-08-18; see the postgres-age skill's "Upstream filing").
  // There is no socket now: the embedded database is single-writer and held
  // under an exclusive lock, so two live connections to it is not a state this
  // deployment can reach at all. What is actually testable deterministically:
  // the DB
  // constraint itself (the "duplicate CREATE... blocked at the database"
  // test above, one connection, no race needed) and createEdge()'s own
  // handling of losing that race — proven here by making the CREATE step
  // specifically throw a synthetic 23505, the same shape Postgres would
  // raise from a real conflict, without needing two connections to
  // actually collide to get there.
  test("createEdge treats a 23505 from the CREATE step as success, not a race failure", async () => {
    const question = await graph.createNode("Question", {
      name: "q",
      posed_at: "2026-01-01T00:00:00.000Z",
    });
    const loe = await graph.createNode("LineOfEnquiry", { name: "loe" });

    let createAttempts = 0;
    const flakyDb: LabKitDB = {
      async query(sql: string, params?: unknown[]) {
        // `CREATE (a)-[e:` — the CREATE binds and returns the edge now, so
        // that `createEdge()` can tell "created" from "matched nothing" and
        // charge the endpoint-existence queries only to the failure path.
        if (sql.includes("CREATE (a)-[e:")) {
          createAttempts++;
          const err = new Error("duplicate key value violates unique constraint") as Error & {
            code?: string;
          };
          err.code = "23505";
          throw err;
        }
        return db.query(sql, params);
      },
    };
    const flakyGraph = new TenantGraph(ctx, flakyDb, transactor(flakyDb));

    await expect(
      flakyGraph.createEdge(question.natural_id, "MOTIVATES", loe.natural_id),
    ).resolves.toBeUndefined();
    expect(createAttempts).toBe(1); // confirms the CREATE step actually ran, not that it was skipped some other way

    const rows = await graph.query(
      `MATCH (:Question {natural_id: $qId})-[r:MOTIVATES]->(:LineOfEnquiry {natural_id: $loeId}) RETURN r`,
      { r: edgeProps() },
      { qId: question.natural_id, loeId: loe.natural_id },
    );
    // The mock never actually created the edge (every CREATE attempt threw)
    // — this confirms createEdge() didn't fabricate success, it correctly
    // treated "someone else already created it" as the end state, which
    // for this test means zero, since nothing real ever ran the CREATE.
    expect(rows).toHaveLength(0);
  });
});

/**
 * Row T says "edges cannot carry properties". They can, and this is the check
 * that keeps the correction from being re-derived wrongly.
 *
 * Every AGE label is a real Postgres table, edge labels included, and an edge
 * row has the same `properties` agtype column a vertex row has. So the
 * constraint row T describes is not a storage limit at all — it is two narrower
 * facts about this codebase:
 *
 *   1. `createEdge(from, edge, to)` takes no properties. An API choice.
 *   2. Edge identity is `UNIQUE (start_id, end_id)`, so a property can annotate
 *      a relationship but can never distinguish two of them. That one is real
 *      and is the honest statement of the row.
 *
 * Written through `graph.query()` rather than `createEdge()` on purpose: the
 * point is what the backend supports, not what the write surface exposes.
 */
test("an edge carries properties, in Cypher and in the table underneath it", async () => {
  const question = await graph.createNode("Question", {
    name: "q",
    posed_at: "2026-01-01T00:00:00.000Z",
  });
  const loe = await graph.createNode("LineOfEnquiry", { name: "loe" });

  await graph.query(
    `MATCH (a:Question {natural_id: $from}), (b:LineOfEnquiry {natural_id: $to})
     CREATE (a)-[e:MOTIVATES {why: $why}]->(b) RETURN e`,
    { e: agtypeValue() },
    {
      from: question.natural_id,
      to: loe.natural_id,
      why: "the reviewer asked for it",
    },
  );

  const read = await graph.query(
    `MATCH (:Question)-[e:MOTIVATES]->(:LineOfEnquiry) RETURN e.why AS why`,
    { why: scalar<string>() },
  );
  expect(read.map((r) => r.why)).toEqual(["the reviewer asked for it"]);

  // And from plain SQL, because the edge label is a table like any other --
  // which is how natural-id uniqueness and edge uniqueness already work.
  const rows = await db.query(`SELECT properties::text AS props FROM ${ctx.graphName}."MOTIVATES"`);
  expect(rows.rows[0]?.props).toContain("the reviewer asked for it");
});

/**
 * `createEdge()` writes properties, and the idempotency contract decides what
 * happens on the second call. Row T again, from the write surface this time.
 *
 * Create-if-absent means a repeat call is a no-op, so properties it carries are
 * dropped. Asserted rather than left to be discovered: an upsert would let two
 * callers race to overwrite each other under a contract that promises retries
 * are free, and a property that needs to change later wants its own verb and
 * its own argument.
 */
test("createEdge writes edge properties, and a repeat call does not change them", async () => {
  const question = await graph.createNode("Question", {
    name: "q",
    posed_at: "2026-01-01T00:00:00.000Z",
  });
  const loe = await graph.createNode("LineOfEnquiry", { name: "loe" });

  await graph.createEdge(question.natural_id, "MOTIVATES", loe.natural_id, {
    why: "the reviewer asked for it",
    ordinal: 1,
  });
  const written = await graph.query(
    `MATCH (:Question)-[e:MOTIVATES]->(:LineOfEnquiry) RETURN e.why AS why, e.ordinal AS ordinal`,
    { why: scalar<string>(), ordinal: scalar<number>() },
  );
  expect(written).toEqual([{ why: "the reviewer asked for it", ordinal: 1 }]);

  // The second call is the same no-op it has always been. Properties are not
  // part of edge identity -- UNIQUE (start_id, end_id) is -- so this neither
  // creates a parallel edge nor overwrites the first one's properties.
  await graph.createEdge(question.natural_id, "MOTIVATES", loe.natural_id, {
    why: "something else entirely",
  });
  const after = await graph.query(
    `MATCH (:Question)-[e:MOTIVATES]->(:LineOfEnquiry) RETURN e.why AS why`,
    { why: scalar<string>() },
  );
  expect(after).toEqual([{ why: "the reviewer asked for it" }]);
});

/** A property key cannot smuggle clause text into the CREATE. */
test("createEdge refuses a property key that is not an identifier", async () => {
  const question = await graph.createNode("Question", {
    name: "q",
    posed_at: "2026-01-01T00:00:00.000Z",
  });
  const loe = await graph.createNode("LineOfEnquiry", { name: "loe" });
  await expect(
    graph.createEdge(question.natural_id, "MOTIVATES", loe.natural_id, {
      "why}]->(:X) CREATE (a)-[:MOTIVATES": "injected",
    }),
  ).rejects.toThrow();
});

/**
 * `inTransaction()`'s depth counter must survive a failing COMMIT, and a
 * failing ROLLBACK must not replace the error that caused it.
 *
 * Found incidentally while investigating the suite flake, and it was never
 * observed to fire in a real run — every capture had COMMIT succeed. It is a
 * latent defect rather than a live one, which is why it gets a demonstration
 * before a fix: the old code decremented `depth` before COMMIT *and* again in
 * the catch, so a throwing COMMIT left `depth` at **-1**. Re-entrancy is
 * keyed on `depth > 0`, so the next compound verb would open a transaction
 * that read as depth 0, and a verb nested inside it would issue a **second
 * BEGIN** rather than joining the outer one. That is the re-entrancy contract
 * silently inverted, and it survives for the life of the TenantGraph.
 */
test("a failing COMMIT does not corrupt the transaction depth", async () => {
  const issued: string[] = [];
  let failCommit = true;
  const brittleDb: LabKitDB = {
    async query(sql: string, params?: unknown[]) {
      if (typeof sql === "string" && /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) {
        issued.push(sql.trim());
        if (sql.trim() === "COMMIT" && failCommit) {
          failCommit = false;
          throw new Error("injected: COMMIT failed");
        }
      }
      return db.query(sql, params);
    },
  };
  const brittle = new TenantGraph(ctx, brittleDb, transactor(brittleDb));

  await expect(brittle.inTransaction(async () => "done")).rejects.toThrow(/injected/);

  // The depth is not observable directly, so observe what it controls: a
  // nested call must join the outer transaction rather than opening its own.
  issued.length = 0;
  await brittle.inTransaction(async () => {
    await brittle.inTransaction(async () => "nested");
  });
  expect(issued.filter((s) => s === "BEGIN")).toEqual(["BEGIN"]);
  expect(issued.filter((s) => s === "COMMIT")).toEqual(["COMMIT"]);
});

/**
 * A failing ROLLBACK must not mask the error that triggered it.
 *
 * Fully mocked rather than wrapping the real connection: injecting a ROLLBACK
 * failure into a live session leaves it in an aborted transaction, and the
 * teardown that follows then stalls for five seconds — which is the very
 * failure mode this test file is helping to characterise. A test that
 * reproduces the bug it is adjacent to is not a useful test.
 */
test("a failing ROLLBACK does not replace the original error", async () => {
  const issued: string[] = [];
  const brittleDb: LabKitDB = {
    async query(sql: unknown) {
      const text = String(sql).trim();
      issued.push(text);
      if (text === "ROLLBACK") throw new Error("injected: ROLLBACK failed");
      return { rows: [] } as never;
    },
  } as LabKitDB;
  const brittle = new TenantGraph(ctx, brittleDb, transactor(brittleDb));

  await expect(
    brittle.inTransaction(async () => {
      throw new Error("the real problem");
    }),
  ).rejects.toThrow(/the real problem/);
  expect(issued).toEqual(["BEGIN", "ROLLBACK"]);
});
