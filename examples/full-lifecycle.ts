/**
 * Runnable, end-to-end walkthrough of LabKit's persistence layer: connect
 * (leader election), migrate, resolve the default tenant (provisioning its
 * AGE graph), build the journal's worked example provenance chain, then
 * read it back — printing ONLY natural ids. If a raw AGE graphid (a large
 * bigint) ever shows up in this script's output, the containment boundary
 * (`TenantGraph.createNode`) has regressed.
 *
 * **It read back through the per-tenant CQRS views, and those were deleted on
 * 2026-08-19 (`af5a1d2`).** It has been dying at
 * `relation "labkit_t1.claim" does not exist` for 221 commits, and nobody
 * noticed because CLAUDE.md said to ignore its exit code — a rule added the
 * same day, *after* the break, so the genuine failure had no watcher either.
 * The read-back now goes through `graph.query()`, which is the only read path
 * that exists.
 *
 * **The exit code means something again.** It used to exit 99 on a completely
 * successful run — a PGlite WASM teardown artefact — which is why the rule
 * existed. An explicit `process.exit(0)` after the last line makes success 0
 * and any throw non-zero, so this is a check rather than something a person
 * has to read.
 *
 * Usage: bun examples/full-lifecycle.ts
 * See ./full-lifecycle.md for the checklist this script exists to satisfy.
 */
import { connectDb, resolveTenantContext, TenantGraph, vertexProps } from "../src/db";

const conn = await connectDb(process.cwd());
console.log(`connected as ${conn.role}`);

const ctx = await resolveTenantContext(conn.db, "labkit-mvp-demo");
console.log(`tenant: ${ctx.graphName} (id ${ctx.tenantId})`);

const graph = new TenantGraph(ctx, conn.db);

const question = await graph.createNode("Question", {
  name: "does the accelerated ridge implementation match the reference?",
  posed_at: new Date().toISOString(),
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

console.log("\n--- reading back through the graph (natural ids only) ---");

const claims = await graph.query(
  `MATCH (c:Claim {name: $name}) RETURN c`,
  { c: vertexProps<{ natural_id: string; name: string; kind: string }>() },
  { name: claim.properties.name },
);
console.log("claims:", claims.map((r) => r.c));

const computations = await graph.query(
  `MATCH (c:Computation {external_run_id: $run}) RETURN c`,
  { c: vertexProps<{ natural_id: string; external_run_id: string; status: string }>() },
  { run: "run-42" },
);
console.log("computations:", computations.map((r) => r.c));

// The whole point of the script: nothing above may have leaked a graphid.
// Asserted rather than left for a reader to spot, because a reader is exactly
// what this script went without for 221 commits.
// Anchored on *this* run's question. The script appends to a persistent tenant
// rather than starting clean, so an unanchored walk finds every previous run's
// chain too -- which is how the first version of this assertion failed.
const chain = await graph.query(
  `MATCH (q:Question {natural_id: $question})-[:MOTIVATES]->(l:LineOfEnquiry)<-[:ADDRESSES]-(u:EvidenceUnit)-[:PRODUCES]->(e:Evidence)-[:SUPPORTS]->(c:Claim)
   RETURN q, l, u, e, c`,
  {
    q: vertexProps<{ natural_id: string }>(),
    l: vertexProps<{ natural_id: string }>(),
    u: vertexProps<{ natural_id: string }>(),
    e: vertexProps<{ natural_id: string }>(),
    c: vertexProps<{ natural_id: string }>(),
  },
  { question: question.natural_id },
);
if (chain.length !== 1) throw new Error(`expected one provenance chain, walked ${chain.length}`);
for (const [name, node] of Object.entries(chain[0]!)) {
  if (!/^[A-Z]+_\d+$/.test(node.natural_id))
    throw new Error(`${name} carries ${node.natural_id}, which is not a natural id`);
}
console.log("walked the chain end to end:", Object.values(chain[0]!).map((n) => n.natural_id).join(" -> "));

await conn.close();
console.log("\nclosed connection cleanly");

// Explicit, so the exit code is a verdict rather than a teardown artefact.
process.exit(0);
