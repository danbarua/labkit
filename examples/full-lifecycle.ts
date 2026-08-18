/**
 * Runnable, end-to-end walkthrough of LabKit's persistence layer: connect
 * (leader election), migrate, create a project, build the journal's worked
 * example provenance chain, then read it back through the CQRS views —
 * printing ONLY natural ids. If a raw AGE graphid (a large bigint) ever
 * shows up in this script's output, something in the containment boundary
 * (src/db/graph.ts's createNode / the labkit_* views) has regressed.
 *
 * Usage: bun examples/full-lifecycle.ts
 * See ./full-lifecycle.md for the checklist this script exists to satisfy.
 */
import { connectDb } from "../src/db";
import { getOrCreateProject } from "../src/db/projects";
import { createEdge, createNode } from "../src/db/graph";

const conn = await connectDb(process.cwd());
console.log(`connected as ${conn.role}`);

const project = await getOrCreateProject(conn.db, "labkit-mvp-demo");
console.log(`project: ${project.name} (${project.id})`);

const question = await createNode(conn.db, "Question", {
  project_id: project.id,
  name: "does the accelerated ridge implementation match the reference?",
});
console.log(`created ${question.natural_id}`);

const lineOfEnquiry = await createNode(conn.db, "LineOfEnquiry", {
  project_id: project.id,
  name: "numerical equivalence of accelerated ridge",
});
console.log(`created ${lineOfEnquiry.natural_id}`);

const evidenceUnit = await createNode(conn.db, "EvidenceUnit", {
  project_id: project.id,
  role: "verification",
});
console.log(`created ${evidenceUnit.natural_id}`);

const computation = await createNode(conn.db, "Computation", {
  kind: "equivalence_check",
  status: "completed",
  backend: "wandb",
  external_run_id: "run-42",
});
console.log(`created ${computation.natural_id}`);

const evidence = await createNode(conn.db, "Evidence", {
  project_id: project.id,
  statement: "evolved_T mean ΔMSE = -0.021, 95% CI [-0.025, -0.017]",
});
console.log(`created ${evidence.natural_id}`);

const claim = await createNode(conn.db, "Claim", {
  project_id: project.id,
  name: "accelerated ridge is numerically equivalent to reference",
  kind: "confirmatory",
});
console.log(`created ${claim.natural_id}`);

await createEdge(conn.db, "Question", { name: question.properties.name }, "MOTIVATES", "LineOfEnquiry", { name: lineOfEnquiry.properties.name });
await createEdge(conn.db, "LineOfEnquiry", { name: lineOfEnquiry.properties.name }, "REQUIRES", "Evidence", { statement: evidence.properties.statement });
await createEdge(conn.db, "EvidenceUnit", { role: evidenceUnit.properties.role }, "USES", "Computation", { external_run_id: computation.properties.external_run_id });
await createEdge(conn.db, "EvidenceUnit", { role: evidenceUnit.properties.role }, "PRODUCES", "Evidence", { statement: evidence.properties.statement });
await createEdge(conn.db, "Evidence", { statement: evidence.properties.statement }, "SUPPORTS", "Claim", { name: claim.properties.name });
console.log("linked the provenance chain");

console.log("\n--- reading back through CQRS views (natural ids only) ---");

const claims = await conn.db.query<{ natural_id: string; name: string; kind: string }>(
  `SELECT natural_id, name, kind FROM labkit_claims WHERE name = $1`,
  [claim.properties.name],
);
console.log("labkit_claims:", claims.rows);

const computations = await conn.db.query<{ natural_id: string; external_run_id: string; status: string }>(
  `SELECT natural_id, external_run_id, status FROM labkit_computations WHERE external_run_id = $1`,
  ["run-42"],
);
console.log("labkit_computations:", computations.rows);

await conn.close();
console.log("\nclosed connection cleanly");
