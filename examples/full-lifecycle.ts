/**
 * Runnable, end-to-end walkthrough of LabKit's persistence layer: connect
 * (leader election), migrate, resolve the default tenant (provisioning its
 * AGE graph), build the journal's worked example provenance chain, then
 * read it back through the CQRS views — printing ONLY natural ids. If a raw
 * AGE graphid (a large bigint) ever shows up in this script's output,
 * something in the containment boundary (TenantGraph.createNode / the
 * per-tenant views) has regressed.
 *
 * Usage: bun examples/full-lifecycle.ts
 * See ./full-lifecycle.md for the checklist this script exists to satisfy.
 */
import { connectDb, resolveTenantContext, TenantGraph } from "../src/db";

const conn = await connectDb(process.cwd());
console.log(`connected as ${conn.role}`);

const ctx = await resolveTenantContext(conn.db, "labkit-mvp-demo");
console.log(`tenant: ${ctx.graphName} (id ${ctx.tenantId})`);

const graph = new TenantGraph(ctx, conn.db);

const question = await graph.createNode("Question", {
  name: "does the accelerated ridge implementation match the reference?",
});
console.log(`created ${question.natural_id}`);

const lineOfEnquiry = await graph.createNode("LineOfEnquiry", {
  name: "numerical equivalence of accelerated ridge",
});
console.log(`created ${lineOfEnquiry.natural_id}`);

const evidenceUnit = await graph.createNode("EvidenceUnit", {
  role: "verification",
});
console.log(`created ${evidenceUnit.natural_id}`);

const computation = await graph.createNode("Computation", {
  kind: "equivalence_check",
  status: "completed",
  backend: "wandb",
  external_run_id: "run-42",
});
console.log(`created ${computation.natural_id}`);

const evidence = await graph.createNode("Evidence", {
  statement: "evolved_T mean ΔMSE = -0.021, 95% CI [-0.025, -0.017]",
});
console.log(`created ${evidence.natural_id}`);

const claim = await graph.createNode("Claim", {
  name: "accelerated ridge is numerically equivalent to reference",
  kind: "confirmatory",
});
console.log(`created ${claim.natural_id}`);

await graph.createEdge(question.natural_id, "MOTIVATES", lineOfEnquiry.natural_id);
await graph.createEdge(evidenceUnit.natural_id, "ADDRESSES", lineOfEnquiry.natural_id);
await graph.createEdge(lineOfEnquiry.natural_id, "REQUIRES", evidence.natural_id);
await graph.createEdge(evidenceUnit.natural_id, "USES", computation.natural_id);
await graph.createEdge(evidenceUnit.natural_id, "PRODUCES", evidence.natural_id);
await graph.createEdge(evidence.natural_id, "SUPPORTS", claim.natural_id);
console.log("linked the provenance chain");

console.log("\n--- reading back through CQRS views (natural ids only) ---");

const claims = await conn.db.query<{ natural_id: string; name: string; kind: string }>(
  `SELECT natural_id, name, kind FROM "${ctx.graphName}".claim WHERE name = $1`,
  [claim.properties.name],
);
console.log("claims:", claims.rows);

const computations = await conn.db.query<{ natural_id: string; external_run_id: string; status: string }>(
  `SELECT natural_id, external_run_id, status FROM "${ctx.graphName}".computation WHERE external_run_id = $1`,
  ["run-42"],
);
console.log("computations:", computations.rows);

await conn.close();
console.log("\nclosed connection cleanly");
