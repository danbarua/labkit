import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { TenantGraph } from "../src/db/graph";
import { edgeProps, optional, vertexProps } from "../src/db/cypher";
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
import type { LabKitDB } from "../src/db/client";
import { resolveTenantContext, type TenantContext } from "../src/db/tenant";
import { setupTestDb, type TestDb } from "./helpers/db";

/**
 * Exercises the LabKit domain model (docs/project-journal/001_git_init.md,
 * revised by docs/project-journal/003_review_domain_tenancy.md and
 * docs/project-journal/004_tenancy_implementation_plan.md) against Apache
 * AGE, migrated and provisioned the same way a real connection would be
 * (runMigrations() + resolveTenantContext(), not hand-rolled setup) and
 * queried through the same `pg.Client`-over-`pglite-socket` path production
 * uses — never a raw `PGlite` instance directly (see tests/helpers/db.ts).
 * Each test corresponds to one of the journal's MVP acceptance-criteria
 * questions, or one of PJ-003 §15 / PJ-004's acceptance tests.
 */

let testDb: TestDb;
let db: LabKitDB & { close(): Promise<void> };
let ctx: TenantContext;
let graph: TenantGraph;

beforeAll(async () => {
  testDb = await setupTestDb();
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  // A fresh connection every test, not one shared for the whole file — see
  // tests/helpers/db.ts's file-level comment on why that's load-bearing,
  // not a style preference (a confirmed pglite-socket bug can permanently
  // corrupt a connection that sees enough error/concurrency exposure, and
  // several tests in this file deliberately provoke DB-level errors).
  db = await testDb.openClient();
  ctx = await resolveTenantContext(db, "labkit");
  graph = new TenantGraph(ctx, db);
});

afterEach(async () => {
  // Drops every AGE graph (this test's tenant plus any others a
  // multi-tenancy test created) and truncates every table — see
  // tests/helpers/db.ts, no per-test cleanup discipline required.
  await testDb.reset();
  await db.close();
});

async function seedResearchThread() {
  const question = await graph.createNode("Question", { name: "does the accelerated ridge implementation match the reference?" });
  const lineOfEnquiry = await graph.createNode("LineOfEnquiry", { name: "numerical equivalence of accelerated ridge" });
  const evidenceUnit = await graph.createNode("EvidenceUnit", { role: "verification" });
  const computation = await graph.createNode("Computation", { kind: "equivalence_check", status: "completed", backend: "wandb", external_run_id: "run-42" });
  const evidence = await graph.createNode("Evidence", { statement: "evolved_T mean ΔMSE = -0.021, 95% CI [-0.025, -0.017]" });
  const artefact = await graph.createNode("Artefact", { kind: "json", logical_name: "stage2b_confirmatory_results", invalidated: false });
  const claim = await graph.createNode("Claim", { name: "accelerated ridge is numerically equivalent to reference", kind: "confirmatory" });

  await graph.createEdge(question.natural_id, "MOTIVATES", lineOfEnquiry.natural_id);
  await graph.createEdge(lineOfEnquiry.natural_id, "REQUIRES", evidence.natural_id);
  await graph.createEdge(evidenceUnit.natural_id, "ADDRESSES", lineOfEnquiry.natural_id);
  await graph.createEdge(evidenceUnit.natural_id, "USES", computation.natural_id);
  await graph.createEdge(evidenceUnit.natural_id, "PRODUCES", evidence.natural_id);
  await graph.createEdge(evidence.natural_id, "RECORDED_IN", artefact.natural_id);
  await graph.createEdge(evidence.natural_id, "SUPPORTS", claim.natural_id);

  return { question, lineOfEnquiry, evidenceUnit, computation, evidence, artefact, claim };
}

describe("evidence and computations supporting a claim", () => {
  test("shows evidence, the evidence unit, and the computation that generated it", async () => {
    const { claim } = await seedResearchThread();

    const rows = await graph.query(
      `MATCH (:Claim {natural_id: $claimId})<-[:SUPPORTS]-(e:Evidence)
       MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
       MATCH (u)-[:USES]->(comp:Computation)
       RETURN e, comp`,
      { e: vertexProps<EvidenceProps>(), comp: vertexProps<ComputationProps>() },
      { claimId: claim.natural_id },
    );

    expect(rows).toHaveLength(1);
    const evidence = rows[0]!.e;
    const computation = rows[0]!.comp;
    expect(evidence).toMatchObject({ statement: "evolved_T mean ΔMSE = -0.021, 95% CI [-0.025, -0.017]" });
    expect(computation).toMatchObject({ external_run_id: "run-42", status: "completed" });
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
    expect(rows[0]!.decision).toMatchObject({ reason: decision.properties.reason });
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
    expect(rows[0]!.d).toMatchObject({ reason: "accelerated ridge confirmed equivalent" });
  });
});

describe("failed/planned inquiry provenance", () => {
  test("answers 'why was this computation run' even with no resulting Evidence", async () => {
    const lineOfEnquiry = await graph.createNode("LineOfEnquiry", { name: "does approach X scale" });
    const evidenceUnit = await graph.createNode("EvidenceUnit", { role: "feasibility" });
    const computation = await graph.createNode("Computation", { kind: "scaling_probe", status: "failed" });

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
    const d1 = await graph.createNode("Decision", { reason: "use float32 batching", invalidation_check: "n/a", decided_at: "2026-01-01T00:00:00.000Z" });
    const d2 = await graph.createNode("Decision", { reason: "switch to float64 for stability", invalidation_check: "n/a", decided_at: "2026-01-01T00:00:00.000Z" });
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
    const d1 = await graph.createNode("Decision", { reason: "d1-original", invalidation_check: "n/a", decided_at: "2026-01-01T00:00:00.000Z" });
    const d2 = await graph.createNode("Decision", { reason: "d2-amendment", invalidation_check: "n/a", decided_at: "2026-01-01T00:00:00.000Z" });
    const d3 = await graph.createNode("Decision", { reason: "d3-amendment", invalidation_check: "n/a", decided_at: "2026-01-01T00:00:00.000Z" });
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

describe("decision lifecycle integrity", () => {
  test("createNode rejects a Decision created already-open with closed_at set", async () => {
    await expect(graph.createNode("Decision", { reason: "r", invalidation_check: "x", decided_at: "2026-01-01T00:00:00.000Z", is_open: true, closed_at: "2026-08-18T00:00:00Z" })).rejects.toThrow(
      /cannot have closed_at/,
    );
  });

  test("createNode rejects a Decision created already-closed without closed_at", async () => {
    await expect(graph.createNode("Decision", { reason: "r", invalidation_check: "x", decided_at: "2026-01-01T00:00:00.000Z", is_open: false })).rejects.toThrow(/requires closed_at/);
  });

  test("createNode defaults is_open to true when omitted", async () => {
    const d = await graph.createNode("Decision", { reason: "r", invalidation_check: "x", decided_at: "2026-01-01T00:00:00.000Z" });
    const props = d.properties as DecisionProps;
    expect(props.is_open).toBe(true);
    expect(props.closed_at).toBeUndefined();
  });

  test("closeDecision sets is_open and closed_at together", async () => {
    const d = await graph.createNode("Decision", { reason: "r", invalidation_check: "x", decided_at: "2026-01-01T00:00:00.000Z" });
    await graph.closeDecision(d.natural_id, "2026-08-18T12:00:00Z");

    const rows = await graph.query(`MATCH (n:Decision {natural_id: $id}) RETURN n`, { n: vertexProps<DecisionProps>() }, { id: d.natural_id });
    expect(rows[0]!.n).toMatchObject({ is_open: false, closed_at: "2026-08-18T12:00:00Z" });
  });

  test("closeDecision throws for a nonexistent decision", async () => {
    await expect(graph.closeDecision("DEC_999")).rejects.toThrow(/not found/);
  });
});

describe("edge integrity", () => {
  test("createEdge throws when the (fromLabel, toLabel) pair isn't in EDGE_SCHEMA", async () => {
    const claim = await graph.createNode("Claim", { name: "c" });
    const loe = await graph.createNode("LineOfEnquiry", { name: "loe" });

    await expect(graph.createEdge(claim.natural_id, "MOTIVATES", loe.natural_id)).rejects.toThrow(/does not allow/);
  });

  test("createEdge throws when the source natural id doesn't exist", async () => {
    const loe = await graph.createNode("LineOfEnquiry", { name: "loe" });
    await expect(graph.createEdge("Q_999", "MOTIVATES", loe.natural_id)).rejects.toThrow(/not found/);
  });

  test("createEdge throws when the target natural id doesn't exist", async () => {
    const question = await graph.createNode("Question", { name: "q" });
    await expect(graph.createEdge(question.natural_id, "MOTIVATES", "LOE_999")).rejects.toThrow(/not found/);
  });

  test("createEdge is idempotent — calling it twice creates exactly one edge", async () => {
    const question = await graph.createNode("Question", { name: "q" });
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
    const criterion = await graph.createNode("Criterion", { proposition: "max_prediction_error <= 1e-8" });
    const evaluation = await graph.createNode("CriterionEvaluation", { value: "3.2e-9", outcome: "pass", evaluated_at: "2026-08-17T00:00:00Z" });
    const gate = await graph.createNode("Gate", { consequence: "accelerated ridge implementation may be promoted" });
    const computation = await graph.createNode("Computation", { kind: "promotion_run", status: "pending" });
    const evidence = await graph.createNode("Evidence", { statement: "3.2e-9 max error observed" });

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
    Question: { name: "q" },
    LineOfEnquiry: { name: "loe" },
    EvidenceUnit: { role: "experiment" },
    Evidence: { statement: "e" },
    Claim: { name: "c" },
    Decision: { reason: "r", invalidation_check: "x", decided_at: "2026-01-01T00:00:00.000Z" },
    Criterion: { proposition: "p" },
    CriterionEvaluation: { value: "v", outcome: "pass", evaluated_at: "2026-08-17T00:00:00Z" },
    Gate: { consequence: "c" },
    Review: { verdict: "v" },
    Artefact: { kind: "json", logical_name: "a" },
    Computation: { kind: "k", status: "s" },
    Task: { objective: "o", inputs: "i", outputs: "o", acceptance: "a" },
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
    const again = await resolveTenantContext(db, "labkit");
    expect(again.tenantId).toBe(ctx.tenantId);
    expect(again.graphName).toBe(ctx.graphName);
  });

  test("graph_name is derived server-side from the tenant id, never from the slug", async () => {
    const rows = await db.query<{ id: number; slug: string; graph_name: string }>(`select id, slug, graph_name from tenants where id = $1`, [ctx.tenantId]);
    expect(rows.rows[0]).toMatchObject({ slug: "labkit", graph_name: `labkit_t${ctx.tenantId}` });
  });
});

describe("tenant isolation", () => {
  test("two tenants can hold nodes with identical properties without any query crossing between them", async () => {
    const ctxA = await resolveTenantContext(db, "tenant-a");
    const ctxB = await resolveTenantContext(db, "tenant-b");
    expect(ctxA.graphName).not.toBe(ctxB.graphName);
    const graphA = new TenantGraph(ctxA, db);
    const graphB = new TenantGraph(ctxB, db);

    const claimA = await graphA.createNode("Claim", { name: "x" });
    const claimB = await graphB.createNode("Claim", { name: "x" });
    expect(claimA.natural_id).not.toBe(claimB.natural_id); // natural ids are global, but the nodes are still in disjoint graphs

    const rowsA = await graphA.query(`MATCH (c:Claim) RETURN c`, { c: vertexProps<ClaimProps>() });
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]!.c).toMatchObject({ name: "x" });
  });

  test("an edge operation in tenant A cannot address a node that lives in tenant B", async () => {
    const ctxA = await resolveTenantContext(db, "tenant-a");
    const ctxB = await resolveTenantContext(db, "tenant-b");
    const graphA = new TenantGraph(ctxA, db);
    const graphB = new TenantGraph(ctxB, db);

    const questionA = await graphA.createNode("Question", { name: "q-in-a" });
    const loeB = await graphB.createNode("LineOfEnquiry", { name: "loe-in-b" });

    await expect(graphA.createEdge(questionA.natural_id, "MOTIVATES", loeB.natural_id)).rejects.toThrow(/not found/);
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
    const before = await db.query(`SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = 'claim_natural_id_idx'`, [ctx.graphName]);
    expect(before.rows).toHaveLength(0);

    await resolveTenantContext(db, "labkit");

    const after = await db.query(`SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = 'claim_natural_id_idx'`, [ctx.graphName]);
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

    await resolveTenantContext(db, "labkit");

    const task = await graph.createNode("Task", { objective: "o", inputs: "i", outputs: "o", acceptance: "a" });
    expect(task.natural_id).toMatch(/^TASK_\d+$/);
  });
});

describe("edge uniqueness is DB-enforced, not just app-checked", () => {
  test("a duplicate CREATE that bypasses the app-level check is still blocked at the database", async () => {
    const question = await graph.createNode("Question", { name: "q" });
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

  // NOT a real Promise.all() race against two live connections — genuine
  // concurrent queries against pglite-socket are not reliable enough for a
  // deterministic suite to depend on (confirmed 2026-08-18: two SEPARATE
  // pg.Client connections issuing overlapping queries where one errors,
  // e.g. this exact 23505, corrupt the connection after a handful of
  // iterations — reproducible with plain SQL, nothing AGE-specific about
  // it; see the postgres-age skill's "Upstream filing"). That's a real bug
  // in @electric-sql/pglite-socket, not something to work around by wanting
  // harder — and it matters beyond this test, since pgliteLeaderElectionBackend's
  // whole design is every secondary process hitting the primary's socket
  // concurrently. What's actually testable deterministically: the DB
  // constraint itself (the "duplicate CREATE... blocked at the database"
  // test above, one connection, no race needed) and createEdge()'s own
  // handling of losing that race — proven here by making the CREATE step
  // specifically throw a synthetic 23505, the same shape Postgres would
  // raise from a real conflict, without needing two connections to
  // actually collide to get there.
  test("createEdge treats a 23505 from the CREATE step as success, not a race failure", async () => {
    const question = await graph.createNode("Question", { name: "q" });
    const loe = await graph.createNode("LineOfEnquiry", { name: "loe" });

    let createAttempts = 0;
    const flakyDb: LabKitDB = {
      async query(sql: string, params?: unknown[]) {
        if (sql.includes("CREATE (a)-[:")) {
          createAttempts++;
          const err = new Error("duplicate key value violates unique constraint") as Error & { code?: string };
          err.code = "23505";
          throw err;
        }
        return db.query(sql, params);
      },
    };
    const flakyGraph = new TenantGraph(ctx, flakyDb);

    await expect(flakyGraph.createEdge(question.natural_id, "MOTIVATES", loe.natural_id)).resolves.toBeUndefined();
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

