import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { age } from "@electric-sql/pglite-age";
import { vector } from "@electric-sql/pglite-pgvector";
import { TenantGraph, bootstrapSession, parseAgtype, NODE_LABELS, NATURAL_ID_PREFIX, type NodeLabel, type DecisionProps } from "../src/db/graph";
import { runMigrations } from "../src/db/migrate";
import { resolveTenantContext, type TenantContext } from "../src/db/tenant";

/**
 * Exercises the LabKit domain model (docs/project-journal/001_git_init.md,
 * revised by docs/project-journal/003_review_domain_tenancy.md and
 * docs/project-journal/004_tenancy_implementation_plan.md) against Apache
 * AGE running inside an in-memory PGlite instance, migrated and provisioned
 * the same way a real connection would be (runMigrations() +
 * resolveTenantContext(), not hand-rolled setup). Each test corresponds to
 * one of the journal's MVP acceptance-criteria questions, or one of PJ-003
 * §15 / PJ-004's acceptance tests.
 */

let db: PGlite;
let ctx: TenantContext;
let graph: TenantGraph;

beforeAll(async () => {
  // creates single PgLite instance for all tests
  db = new PGlite({ extensions: { age, vector } });
});

afterAll(async () => {
  // closes PgLite instance after all tests
  await db.close();
});

beforeEach(async () => {
  // migrates the database and provisions a tenant graph for each test
  await runMigrations(db);
  await bootstrapSession(db);
  ctx = await resolveTenantContext(db, "labkit");
  graph = new TenantGraph(ctx, db);
});

afterEach(async () => {
  // tenant graph needs to be dropped before truncating tables
  // any other tenant graphs (multi-tenancy tests) need to clean up after themselves too
  if (graph){
      await graph.dropGraph();
  }

  const tables = await db.query<{ table_schema: string; table_name: string }>(`
    select table_schema, table_name 
    from information_schema.tables
    where table_schema not in ('pg_catalog', 'information_schema', 'ag_catalog', 'drizzle')
    order by table_schema, table_name;
  `);

  const tableNames = tables.rows.map((r) => `"${r.table_schema}"."${r.table_name}"`);

  if (tableNames.length > 0) {
    // Disable foreign key checks, truncate all tables, re-enable foreign key checks.
    await db.exec(`
      set session_replication_role = replica; 
      truncate ${tableNames.join(", ")} restart identity cascade; 
      set session_replication_role = DEFAULT;
    `);
  }
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

    const rows = await graph.cypher<{ e: string; comp: string }>(
      `MATCH (:Claim {natural_id: $claimId})<-[:SUPPORTS]-(e:Evidence)
       MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
       MATCH (u)-[:USES]->(comp:Computation)
       RETURN e, comp`,
      "(e agtype, comp agtype)",
      { claimId: claim.natural_id },
    );

    expect(rows).toHaveLength(1);
    const evidence = parseAgtype(rows[0]!.e);
    const computation = parseAgtype(rows[0]!.comp);
    expect(evidence.properties).toMatchObject({ statement: "evolved_T mean ΔMSE = -0.021, 95% CI [-0.025, -0.017]" });
    expect(computation.properties).toMatchObject({ external_run_id: "run-42", status: "completed" });
  });
});

describe("invalidation propagation", () => {
  test("finds claims, decisions, and lines of enquiry affected if an artefact is invalidated", async () => {
    const { artefact, claim, lineOfEnquiry, evidence } = await seedResearchThread();
    const decision = await graph.createNode("Decision", {
      reason: "promote accelerated ridge to production",
      invalidation_check: "equivalence within tolerance on held-out batch",
    });
    await graph.createEdge(decision.natural_id, "BASED_ON", evidence.natural_id);

    // Follows only the edges that represent "depends on this evidence" —
    // RECORDED_IN/SUPPORTS/BASED_ON/REQUIRES — not PRODUCES/USES/ADDRESSES,
    // which are provenance of how the evidence came to exist and aren't
    // invalidated retroactively just because its durable record was.
    // "Affected" is not the same as "unsupported" (PJ-003 §11) — this
    // traversal answers "what needs reconsideration", not "what is now
    // false"; nothing here marks the claim unsupported.
    const rows = await graph.cypher<{ claim: string | null; decision: string | null; loe: string | null }>(
      `MATCH (a:Artefact {natural_id: $artefactId})
       OPTIONAL MATCH (a)<-[:RECORDED_IN]-(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(claim:Claim)
       OPTIONAL MATCH (decision:Decision)-[:BASED_ON]->(e)
       OPTIONAL MATCH (loe:LineOfEnquiry)-[:REQUIRES]->(e)
       RETURN claim, decision, loe`,
      "(claim agtype, decision agtype, loe agtype)",
      { artefactId: artefact.natural_id },
    );

    expect(rows).toHaveLength(1);
    expect(parseAgtype(rows[0]!.claim!).properties).toMatchObject({ name: claim.properties.name });
    expect(parseAgtype(rows[0]!.decision!).properties).toMatchObject({ reason: decision.properties.reason });
    expect(parseAgtype(rows[0]!.loe!).properties).toMatchObject({ name: lineOfEnquiry.properties.name });
  });
});

describe("open lines of enquiry", () => {
  test("a line of enquiry is open when its motivating question has no resolving decision", async () => {
    const { lineOfEnquiry } = await seedResearchThread();

    const rows = await graph.cypher<{ q: string; d: string | null }>(
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $loeId})
       OPTIONAL MATCH (d:Decision)-[:RESOLVES]->(q)
       RETURN q, d`,
      "(q agtype, d agtype)",
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
    });
    await graph.createEdge(decision.natural_id, "RESOLVES", question.natural_id);

    const rows = await graph.cypher<{ d: string }>(
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $loeId})
       MATCH (d:Decision)-[:RESOLVES]->(q)
       RETURN d`,
      "(d agtype)",
      { loeId: lineOfEnquiry.natural_id },
    );

    expect(rows).toHaveLength(1);
    expect(parseAgtype(rows[0]!.d).properties).toMatchObject({ reason: "accelerated ridge confirmed equivalent" });
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

    const rows = await graph.cypher<{ loe: string }>(
      `MATCH (:Computation {natural_id: $compId})<-[:USES]-(:EvidenceUnit)-[:ADDRESSES]->(loe:LineOfEnquiry)
       RETURN loe`,
      "(loe agtype)",
      { compId: computation.natural_id },
    );

    expect(rows).toHaveLength(1);
    expect(parseAgtype(rows[0]!.loe).properties).toMatchObject({ name: "does approach X scale" });
  });
});

describe("decision amendments", () => {
  test("an amendment is a decision that supersedes an earlier one", async () => {
    const d1 = await graph.createNode("Decision", { reason: "use float32 batching", invalidation_check: "n/a" });
    const d2 = await graph.createNode("Decision", { reason: "switch to float64 for stability", invalidation_check: "n/a" });
    await graph.createEdge(d2.natural_id, "SUPERSEDES", d1.natural_id);

    const rows = await graph.cypher<{ old: string }>(
      `MATCH (:Decision {natural_id: $id})-[:SUPERSEDES]->(old:Decision)
       RETURN old`,
      "(old agtype)",
      { id: d2.natural_id },
    );

    expect(rows).toHaveLength(1);
    expect(parseAgtype(rows[0]!.old).properties).toMatchObject({ reason: "use float32 batching" });
  });

  test("walks the full amendment chain back to the original decision", async () => {
    const d1 = await graph.createNode("Decision", { reason: "d1-original", invalidation_check: "n/a" });
    const d2 = await graph.createNode("Decision", { reason: "d2-amendment", invalidation_check: "n/a" });
    const d3 = await graph.createNode("Decision", { reason: "d3-amendment", invalidation_check: "n/a" });
    await graph.createEdge(d3.natural_id, "SUPERSEDES", d2.natural_id);
    await graph.createEdge(d2.natural_id, "SUPERSEDES", d1.natural_id);

    const rows = await graph.cypher<{ x: string }>(
      `MATCH (:Decision {natural_id: $id})-[:SUPERSEDES*1..5]->(x:Decision)
       RETURN x`,
      "(x agtype)",
      { id: d3.natural_id },
    );

    const chain = rows.map((r) => (parseAgtype(r.x).properties as { reason: string }).reason);
    expect(chain).toEqual(["d2-amendment", "d1-original"]);
  });
});

describe("decision lifecycle integrity", () => {
  test("createNode rejects a Decision created already-open with closed_at set", async () => {
    await expect(graph.createNode("Decision", { reason: "r", invalidation_check: "x", is_open: true, closed_at: "2026-08-18T00:00:00Z" })).rejects.toThrow(
      /cannot have closed_at/,
    );
  });

  test("createNode rejects a Decision created already-closed without closed_at", async () => {
    await expect(graph.createNode("Decision", { reason: "r", invalidation_check: "x", is_open: false })).rejects.toThrow(/requires closed_at/);
  });

  test("createNode defaults is_open to true when omitted", async () => {
    const d = await graph.createNode("Decision", { reason: "r", invalidation_check: "x" });
    const props = d.properties as DecisionProps;
    expect(props.is_open).toBe(true);
    expect(props.closed_at).toBeUndefined();
  });

  test("closeDecision sets is_open and closed_at together", async () => {
    const d = await graph.createNode("Decision", { reason: "r", invalidation_check: "x" });
    await graph.closeDecision(d.natural_id, "2026-08-18T12:00:00Z");

    const rows = await graph.cypher<{ n: string }>(`MATCH (n:Decision {natural_id: $id}) RETURN n`, "(n agtype)", { id: d.natural_id });
    expect(parseAgtype(rows[0]!.n).properties).toMatchObject({ is_open: false, closed_at: "2026-08-18T12:00:00Z" });
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

    const rows = await graph.cypher<{ r: string }>(
      `MATCH (:Question {natural_id: $qId})-[r:MOTIVATES]->(:LineOfEnquiry {natural_id: $loeId}) RETURN r`,
      "(r agtype)",
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

    const rows = await graph.cypher<{ comp: string }>(
      `MATCH (:Criterion {natural_id: $critId})-[:EVALUATED_AS]->(:CriterionEvaluation {outcome: 'pass'})-[:TRIGGERS]->(:Gate)-[:GATES]->(comp:Computation)
       RETURN comp`,
      "(comp agtype)",
      { critId: criterion.natural_id },
    );

    expect(rows).toHaveLength(1);
    expect(parseAgtype(rows[0]!.comp).properties).toMatchObject({ kind: "promotion_run" });
  });
});

describe("all node labels", () => {
  // Minimal valid props per label's *Props interface in src/db/graph.ts.
  // Exists so every label (not just the ones exercised by the acceptance
  // queries above) actually round-trips through createNode(), which is the
  // only thing that would catch a NATURAL_ID_PREFIX entry drifting out of
  // sync with the sequence names in drizzle/0002_natural_ids.sql.
  const fixtures: Record<NodeLabel, Record<string, unknown>> = {
    Question: { name: "q" },
    LineOfEnquiry: { name: "loe" },
    EvidenceUnit: { role: "experiment" },
    Evidence: { statement: "e" },
    Claim: { name: "c" },
    Decision: { reason: "r", invalidation_check: "x" },
    Criterion: { proposition: "p" },
    CriterionEvaluation: { value: "v", outcome: "pass", evaluated_at: "2026-08-17T00:00:00Z" },
    Gate: { consequence: "c" },
    Review: { verdict: "v" },
    Artefact: { kind: "json", logical_name: "a" },
    Computation: { kind: "k", status: "s" },
    Task: { objective: "o", inputs: "i", outputs: "o", acceptance: "a" },
  };

  for (const label of NODE_LABELS) {
    test(`${label} creates with a well-formed natural id`, async () => {
      const node = await graph.createNode(label, fixtures[label]);
      expect(node.natural_id).toMatch(new RegExp(`^${NATURAL_ID_PREFIX[label]}_\\d+$`));
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

    const rowsA = await graphA.cypher<{ c: string }>(`MATCH (c:Claim) RETURN c`, "(c agtype)");
    expect(rowsA).toHaveLength(1);
    expect(parseAgtype(rowsA[0]!.c).properties).toMatchObject({ name: "x" });

    await graphA.dropGraph();
    await graphB.dropGraph();
  });

  test("an edge operation in tenant A cannot address a node that lives in tenant B", async () => {
    const ctxA = await resolveTenantContext(db, "tenant-a");
    const ctxB = await resolveTenantContext(db, "tenant-b");
    const graphA = new TenantGraph(ctxA, db);
    const graphB = new TenantGraph(ctxB, db);

    const questionA = await graphA.createNode("Question", { name: "q-in-a" });
    const loeB = await graphB.createNode("LineOfEnquiry", { name: "loe-in-b" });

    await expect(graphA.createEdge(questionA.natural_id, "MOTIVATES", loeB.natural_id)).rejects.toThrow(/not found/);

    await graphA.dropGraph();
    await graphB.dropGraph();
  });
});

describe("provisioning reconciliation", () => {
  // Every test here re-resolves the SAME production path
  // (resolveTenantContext -> provisionTenantGraph, transaction + advisory
  // lock) that every real connection uses — not an internal reconciliation
  // function called directly. Reconciliation that only a test can reach
  // isn't the thing being claimed; it has to hold for actual tenant
  // resolution, unconditionally, every time.

  test("re-resolving the tenant restores a dropped view", async () => {
    await db.query(`DROP VIEW "${ctx.graphName}".question`);
    const before = await db.query(`SELECT 1 FROM information_schema.views WHERE table_schema = $1 AND table_name = 'question'`, [ctx.graphName]);
    expect(before.rows).toHaveLength(0);

    await resolveTenantContext(db, "labkit");

    const after = await db.query(`SELECT 1 FROM information_schema.views WHERE table_schema = $1 AND table_name = 'question'`, [ctx.graphName]);
    expect(after.rows).toHaveLength(1);
  });

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
    await db.query(`DROP VIEW "${ctx.graphName}".task`);
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
      graph.cypher(
        `MATCH (a:Question {natural_id: $from}), (b:LineOfEnquiry {natural_id: $to}) CREATE (a)-[:MOTIVATES]->(b)`,
        "(x agtype)",
        { from: question.natural_id, to: loe.natural_id },
      ),
    ).rejects.toThrow(/duplicate key value violates unique constraint/);
  });

  test("createEdge survives losing a race to a concurrent caller", async () => {
    const question = await graph.createNode("Question", { name: "q" });
    const loe = await graph.createNode("LineOfEnquiry", { name: "loe" });

    // Two concurrent createEdge() calls for the same (from, edge, to): both
    // resolve without throwing and exactly one edge results. This doesn't
    // instrument which call actually hit the UNIQUE (start_id, end_id)
    // constraint's 23505 vs. which won the pre-check — either is a
    // legitimate outcome of the race — only that the end state is correct
    // regardless of interleaving, which is the actual guarantee that matters.
    await Promise.all([
      graph.createEdge(question.natural_id, "MOTIVATES", loe.natural_id),
      graph.createEdge(question.natural_id, "MOTIVATES", loe.natural_id),
    ]);

    const rows = await graph.cypher<{ r: string }>(
      `MATCH (:Question {natural_id: $qId})-[r:MOTIVATES]->(:LineOfEnquiry {natural_id: $loeId}) RETURN r`,
      "(r agtype)",
      { qId: question.natural_id, loeId: loe.natural_id },
    );
    expect(rows).toHaveLength(1);
  });
});

describe("CQRS read-side views", () => {
  test("the per-tenant computation view exposes only natural ids, never raw graph ids", async () => {
    await graph.createNode("Computation", {
      kind: "equivalence_check",
      status: "completed",
      backend: "wandb",
      external_run_id: "run-42",
    });

    const rows = await db.query<{ natural_id: string; kind: string; status: string; external_run_id: string }>(
      `SELECT natural_id, kind, status, external_run_id FROM "${ctx.graphName}".computation WHERE external_run_id = $1`,
      ["run-42"],
    );

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ kind: "equivalence_check", status: "completed", external_run_id: "run-42" });
    expect(rows.rows[0]!.natural_id).toMatch(/^COMP_\d+$/);
  });
});
