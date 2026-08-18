import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { age } from "@electric-sql/pglite-age";
import { vector } from "@electric-sql/pglite-pgvector";
import { createEdge, createNode, cypher, bootstrapSession, parseAgtype, NODE_LABELS, NATURAL_ID_PREFIX, type NodeLabel } from "../src/db/graph";
import { runMigrations } from "../src/db/migrate";
import { getOrCreateProject } from "../src/db/projects";

/**
 * Exercises the LabKit domain model (docs/project-journal/001_git_init.md)
 * against Apache AGE running inside an in-memory PGlite instance, migrated
 * the same way a real connection would be (src/db/migrate.ts's
 * runMigrations(), not hand-rolled setup). Each test corresponds to one of
 * the journal's MVP acceptance-criteria questions.
 */

let db: PGlite;

beforeEach(async () => {
  db = new PGlite({ extensions: { age, vector } });
  await runMigrations(db);
  await bootstrapSession(db);
});

afterEach(async () => {
  await db.close();
});

async function seedResearchThread() {
  await createNode(db, "Question", { project_id: "p1", name: "does the accelerated ridge implementation match the reference?" });
  await createNode(db, "LineOfEnquiry", { project_id: "p1", name: "numerical equivalence of accelerated ridge" });
  await createNode(db, "EvidenceUnit", { project_id: "p1", role: "verification" });
  await createNode(db, "Computation", { kind: "equivalence_check", status: "completed", backend: "wandb", external_run_id: "run-42" });
  await createNode(db, "Evidence", { project_id: "p1", statement: "evolved_T mean ΔMSE = -0.021, 95% CI [-0.025, -0.017]" });
  await createNode(db, "Artefact", { kind: "json", logical_name: "stage2b_confirmatory_results", invalidated: false });
  await createNode(db, "Claim", { project_id: "p1", name: "accelerated ridge is numerically equivalent to reference", kind: "confirmatory" });

  await createEdge(db, "Question", { name: "does the accelerated ridge implementation match the reference?" }, "MOTIVATES", "LineOfEnquiry", { name: "numerical equivalence of accelerated ridge" });
  await createEdge(db, "LineOfEnquiry", { name: "numerical equivalence of accelerated ridge" }, "REQUIRES", "Evidence", { statement: "evolved_T mean ΔMSE = -0.021, 95% CI [-0.025, -0.017]" });
  await createEdge(db, "EvidenceUnit", { role: "verification" }, "USES", "Computation", { external_run_id: "run-42" });
  await createEdge(db, "EvidenceUnit", { role: "verification" }, "PRODUCES", "Evidence", { statement: "evolved_T mean ΔMSE = -0.021, 95% CI [-0.025, -0.017]" });
  await createEdge(db, "Evidence", { statement: "evolved_T mean ΔMSE = -0.021, 95% CI [-0.025, -0.017]" }, "RECORDED_IN", "Artefact", { logical_name: "stage2b_confirmatory_results" });
  await createEdge(db, "Evidence", { statement: "evolved_T mean ΔMSE = -0.021, 95% CI [-0.025, -0.017]" }, "SUPPORTS", "Claim", { name: "accelerated ridge is numerically equivalent to reference" });
}

describe("evidence and computations supporting a claim", () => {
  test("shows evidence, the evidence unit, and the computation that generated it", async () => {
    await seedResearchThread();

    const rows = await cypher<{ e: string; comp: string }>(
      db,
      `MATCH (:Claim {name: 'accelerated ridge is numerically equivalent to reference'})<-[:SUPPORTS]-(e:Evidence)
       MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
       MATCH (u)-[:USES]->(comp:Computation)
       RETURN e, comp`,
      "(e agtype, comp agtype)",
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
    await seedResearchThread();
    await createNode(db, "Decision", {
      project_id: "p1",
      reason: "promote accelerated ridge to production",
      evidence: "stage2b_confirmatory_results",
      invalidation_check: "equivalence within tolerance on held-out batch",
    });
    await createEdge(
      db,
      "Decision",
      { reason: "promote accelerated ridge to production" },
      "BASED_ON",
      "Evidence",
      { statement: "evolved_T mean ΔMSE = -0.021, 95% CI [-0.025, -0.017]" },
    );

    // Follows only the edges that represent "depends on this evidence" —
    // RECORDED_IN/SUPPORTS/BASED_ON/REQUIRES — not PRODUCES/USES, which are
    // provenance of how the evidence came to exist and aren't invalidated
    // retroactively just because its durable record was. A blind undirected
    // `*` traversal would also sweep in the Computation and Question that
    // led to this evidence, which is the wrong direction for "what breaks".
    const rows = await cypher<{ claim: string | null; decision: string | null; loe: string | null }>(
      db,
      `MATCH (a:Artefact {logical_name: 'stage2b_confirmatory_results'})
       OPTIONAL MATCH (a)<-[:RECORDED_IN]-(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(claim:Claim)
       OPTIONAL MATCH (decision:Decision)-[:BASED_ON]->(e)
       OPTIONAL MATCH (loe:LineOfEnquiry)-[:REQUIRES]->(e)
       RETURN claim, decision, loe`,
      "(claim agtype, decision agtype, loe agtype)",
    );

    expect(rows).toHaveLength(1);
    expect(parseAgtype(rows[0]!.claim!).properties).toMatchObject({ name: "accelerated ridge is numerically equivalent to reference" });
    expect(parseAgtype(rows[0]!.decision!).properties).toMatchObject({ reason: "promote accelerated ridge to production" });
    expect(parseAgtype(rows[0]!.loe!).properties).toMatchObject({ name: "numerical equivalence of accelerated ridge" });
  });
});

describe("open lines of enquiry", () => {
  test("a line of enquiry is open when its motivating question has no resolving decision", async () => {
    await seedResearchThread();

    const rows = await cypher<{ q: string; d: string | null }>(
      db,
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {name: 'numerical equivalence of accelerated ridge'})
       OPTIONAL MATCH (d:Decision)-[:RESOLVES]->(q)
       RETURN q, d`,
      "(q agtype, d agtype)",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.d).toBeNull();
  });

  test("closes once a decision resolves the motivating question", async () => {
    await seedResearchThread();
    await createNode(db, "Decision", {
      project_id: "p1",
      reason: "accelerated ridge confirmed equivalent",
      evidence: "stage2b_confirmatory_results",
      invalidation_check: "n/a",
    });
    await createEdge(
      db,
      "Decision",
      { reason: "accelerated ridge confirmed equivalent" },
      "RESOLVES",
      "Question",
      { name: "does the accelerated ridge implementation match the reference?" },
    );

    const rows = await cypher<{ d: string }>(
      db,
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {name: 'numerical equivalence of accelerated ridge'})
       MATCH (d:Decision)-[:RESOLVES]->(q)
       RETURN d`,
      "(d agtype)",
    );

    expect(rows).toHaveLength(1);
    expect(parseAgtype(rows[0]!.d).properties).toMatchObject({ reason: "accelerated ridge confirmed equivalent" });
  });
});

describe("decision amendments", () => {
  test("an amendment is a decision that supersedes an earlier one", async () => {
    await createNode(db, "Decision", { project_id: "p1", reason: "use float32 batching", evidence: "e-early", invalidation_check: "n/a" });
    await createNode(db, "Decision", { project_id: "p1", reason: "switch to float64 for stability", evidence: "e-later", invalidation_check: "n/a" });
    await createEdge(
      db,
      "Decision",
      { reason: "switch to float64 for stability" },
      "SUPERSEDES",
      "Decision",
      { reason: "use float32 batching" },
    );

    const rows = await cypher<{ old: string }>(
      db,
      `MATCH (:Decision {reason: 'switch to float64 for stability'})-[:SUPERSEDES]->(old:Decision)
       RETURN old`,
      "(old agtype)",
    );

    expect(rows).toHaveLength(1);
    expect(parseAgtype(rows[0]!.old).properties).toMatchObject({ reason: "use float32 batching" });
  });

  test("walks the full amendment chain back to the original decision", async () => {
    await createNode(db, "Decision", { project_id: "p1", reason: "d1-original", evidence: "e", invalidation_check: "n/a" });
    await createNode(db, "Decision", { project_id: "p1", reason: "d2-amendment", evidence: "e", invalidation_check: "n/a" });
    await createNode(db, "Decision", { project_id: "p1", reason: "d3-amendment", evidence: "e", invalidation_check: "n/a" });
    await createEdge(db, "Decision", { reason: "d3-amendment" }, "SUPERSEDES", "Decision", { reason: "d2-amendment" });
    await createEdge(db, "Decision", { reason: "d2-amendment" }, "SUPERSEDES", "Decision", { reason: "d1-original" });

    const rows = await cypher<{ x: string }>(
      db,
      `MATCH (:Decision {reason: 'd3-amendment'})-[:SUPERSEDES*1..5]->(x:Decision)
       RETURN x`,
      "(x agtype)",
    );

    const chain = rows.map((r) => (parseAgtype(r.x).properties as { reason: string }).reason);
    expect(chain).toEqual(["d2-amendment", "d1-original"]);
  });
});

describe("relational/graph seam", () => {
  test("a graph node's project_id resolves back to a real projects row", async () => {
    const project = await getOrCreateProject(db, "labkit-mvp");
    expect(project.id).toBeTruthy();

    const node = await createNode(db, "Question", { project_id: project.id, name: "does the accelerated ridge implementation match the reference?" });
    expect(node.natural_id).toMatch(/^Q-\d+$/);

    const rows = await cypher<{ q: string }>(
      db,
      `MATCH (q:Question {project_id: $project_id}) RETURN q`,
      "(q agtype)",
      { project_id: project.id },
    );

    expect(rows).toHaveLength(1);
    expect(parseAgtype(rows[0]!.q).properties).toMatchObject({ name: "does the accelerated ridge implementation match the reference?" });

    // insert-or-fetch: calling again with the same name returns the same row,
    // not a duplicate (this is the ON CONFLICT DO NOTHING path).
    const again = await getOrCreateProject(db, "labkit-mvp");
    expect(again.id).toBe(project.id);
  });
});

describe("natural ids", () => {
  test("createNode never exposes AGE's internal graphid", async () => {
    const node = await createNode(db, "Computation", { kind: "equivalence_check", status: "completed" });
    expect(node).not.toHaveProperty("id");
    expect(node.properties).not.toHaveProperty("id");
    expect(node.properties).not.toHaveProperty("natural_id");
    expect(node.natural_id).toMatch(/^COMP-\d+$/);
  });

  test("natural ids increment per label without collisions across many creates", async () => {
    const nodes = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createNode(db, "Claim", { project_id: "p1", name: `claim-${i}` })),
    );
    const ids = nodes.map((n) => n.natural_id);
    expect(new Set(ids).size).toBe(5);
    for (const id of ids) expect(id).toMatch(/^CLM-\d+$/);
  });
});

describe("all node labels", () => {
  // Minimal valid props per label's *Props interface in src/db/graph.ts.
  // Exists so every label (not just the ones exercised by the acceptance
  // queries above — Review and Task otherwise never get created by
  // anything) actually round-trips through createNode(), which is the only
  // thing that would catch a NATURAL_ID_PREFIX entry drifting out of sync
  // with the sequence names in drizzle/0002_natural_ids.sql (a typo there
  // fails at runtime with "sequence does not exist", not at typecheck).
  const fixtures: Record<NodeLabel, Record<string, unknown>> = {
    Question: { project_id: "p1", name: "q" },
    LineOfEnquiry: { project_id: "p1", name: "loe" },
    EvidenceUnit: { project_id: "p1", role: "experiment" },
    Evidence: { project_id: "p1", statement: "e" },
    Claim: { project_id: "p1", name: "c" },
    Decision: { project_id: "p1", reason: "r", evidence: "e", invalidation_check: "x" },
    Criterion: { project_id: "p1", proposition: "p" },
    CriterionEvaluation: { value: "v", outcome: "pass", evaluated_at: "2026-08-17T00:00:00Z" },
    Gate: { project_id: "p1", consequence: "c" },
    Review: { project_id: "p1", verdict: "v" },
    Artefact: { kind: "json", logical_name: "a" },
    Computation: { kind: "k", status: "s" },
    Task: { objective: "o", inputs: "i", outputs: "o", acceptance: "a" },
  };

  for (const label of NODE_LABELS) {
    test(`${label} creates with a well-formed natural id`, async () => {
      const node = await createNode(db, label, fixtures[label]);
      expect(node.natural_id).toMatch(new RegExp(`^${NATURAL_ID_PREFIX[label]}-\\d+$`));
      expect(node).not.toHaveProperty("id");
    });
  }
});

describe("CQRS read-side views", () => {
  test("labkit_computations exposes only natural ids, never raw graph ids", async () => {
    await createNode(db, "Computation", {
      kind: "equivalence_check",
      status: "completed",
      backend: "wandb",
      external_run_id: "run-42",
    });

    const rows = await db.query<{ natural_id: string; kind: string; status: string; external_run_id: string }>(
      `SELECT natural_id, kind, status, external_run_id FROM labkit_computations WHERE external_run_id = $1`,
      ["run-42"],
    );

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ kind: "equivalence_check", status: "completed", external_run_id: "run-42" });
    expect(rows.rows[0]!.natural_id).toMatch(/^COMP-\d+$/);
  });
});

describe("criterion evaluation and gating", () => {
  test("a criterion evaluation triggers a gate", async () => {
    await createNode(db, "Criterion", { project_id: "p1", proposition: "max_prediction_error <= 1e-8" });
    await createNode(db, "CriterionEvaluation", { value: "3.2e-9", outcome: "pass", evaluated_at: "2026-08-17T00:00:00Z" });
    await createNode(db, "Gate", { project_id: "p1", consequence: "accelerated ridge implementation may be promoted" });

    await createEdge(db, "Criterion", { proposition: "max_prediction_error <= 1e-8" }, "EVALUATED_AS", "CriterionEvaluation", { value: "3.2e-9" });
    await createEdge(db, "CriterionEvaluation", { value: "3.2e-9" }, "TRIGGERS", "Gate", { consequence: "accelerated ridge implementation may be promoted" });

    const rows = await cypher<{ g: string }>(
      db,
      `MATCH (:Criterion {proposition: 'max_prediction_error <= 1e-8'})-[:EVALUATED_AS]->(ce:CriterionEvaluation {outcome: 'pass'})-[:TRIGGERS]->(g:Gate)
       RETURN g`,
      "(g agtype)",
    );

    expect(rows).toHaveLength(1);
    expect(parseAgtype(rows[0]!.g).properties).toMatchObject({ consequence: "accelerated ridge implementation may be promoted" });
  });
});
