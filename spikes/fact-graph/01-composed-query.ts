/**
 * SPIKE v2 — facts fold, selection is named once, and the query runs on AGE.
 *
 * Three things v1 could not answer:
 *   1. row multiplication — N OPTIONAL MATCHes fan out; a fact must be a FOLD
 *   2. is `supports or challenges` expressible, given AGE has no alternation?
 *   3. does a composed query actually run?
 */
import { connectDb } from "../../src/db/connect";
import { resolveTenantContext } from "../../src/db/tenant";
import { TenantGraph } from "../../src/db/graph";
import { vertexProps, optional } from "../../src/db/cypher";

// ── machinery ────────────────────────────────────────────────────────────────

type Leaf<T> = { name: string; clause: string; yields: string[]; empty: () => T; fold: (a: T, r: any) => T };
type Derived<T> = { name: string; needs: AnyFact[]; from: (n: Record<string, any>) => T };
type AnyFact = Leaf<any> | Derived<any>;
const isLeaf = (f: AnyFact): f is Leaf<any> => "clause" in f;

function leavesOf(f: AnyFact, seen = new Map<string, Leaf<any>>()): Leaf<any>[] {
  if (isLeaf(f)) seen.set(f.name, f);
  else for (const n of f.needs) leavesOf(n, seen);
  return [...seen.values()];
}

/** Fold every row into one value per leaf, then compute the derived facts. */
function evaluate(f: AnyFact, rows: any[]): { value: any; because: Record<string, any> } {
  if (isLeaf(f)) return { value: rows.reduce(f.fold, f.empty()), because: {} };
  const because: Record<string, any> = {};
  const needs: Record<string, any> = {};
  for (const n of f.needs) {
    const sub = evaluate(n, rows);
    needs[n.name] = sub.value;
    because[n.name] = sub.value;
  }
  return { value: f.from(needs), because };
}

// ── facts ────────────────────────────────────────────────────────────────────

/**
 * THE ANSWERING CLAIM — and the whole point of naming it.
 *
 * AGE has no edge alternation: `[:SUPPORTS|CHALLENGES]` is a syntax error. So
 * "the claim that answers this question" needs TWO clauses and a coalesce, and
 * that dance is exactly what gets written once and forgotten the second time.
 * Here it is one fact, so every reader of it is right or wrong together.
 */
const answeringClaim: Leaf<{ id: string; kind?: string } | null> = {
  name: "answeringClaim",
  clause: `OPTIONAL MATCH (d:Decision)-[:RESOLVES]->(q)
           OPTIONAL MATCH (d)-[:BASED_ON]->(cited:Evidence)
           OPTIONAL MATCH (cited)-[:SUPPORTS]->(sc:Claim)
           OPTIONAL MATCH (cited)-[:CHALLENGES]->(ac:Claim)`,
  yields: ["sc", "ac"],
  empty: () => null,
  fold: (acc, r) => acc ?? (r.sc ?? r.ac ?? null),
};

/** Unmet prespecified checks. A SET, because rows fan out per criterion. */
const unmet: Leaf<Set<string>> = {
  name: "unmet",
  clause: `OPTIONAL MATCH (cited)-[:SUPPORTS]->(sc2:Claim)
           OPTIONAL MATCH (cited)-[:CHALLENGES]->(ac2:Claim)
           OPTIONAL MATCH (sc2)<-[:SUPPORTS]-(:Evidence)<-[:PRODUCES]-(su:EvidenceUnit)
           OPTIONAL MATCH (ac2)<-[:CHALLENGES]-(:Evidence)<-[:PRODUCES]-(au:EvidenceUnit)
           OPTIONAL MATCH (crit:Criterion)-[:QUALIFIES]->(su)
           OPTIONAL MATCH (crit2:Criterion)-[:QUALIFIES]->(au)
           OPTIONAL MATCH (crit)-[:EVALUATED_AS]->(ev:CriterionEvaluation)
           OPTIONAL MATCH (crit2)-[:EVALUATED_AS]->(ev2:CriterionEvaluation)`,
  yields: ["crit", "ev", "crit2", "ev2"],
  empty: () => new Set<string>(),
  fold: (acc, r) => {
    for (const [c, e] of [[r.crit, r.ev], [r.crit2, r.ev2]] as const) {
      if (c && e?.outcome !== "pass") acc.add(c.natural_id);
    }
    return acc;
  },
};

const worked: Leaf<boolean> = {
  name: "worked",
  clause: `OPTIONAL MATCH (q)-[:MOTIVATES]->(:LineOfEnquiry)<-[:ADDRESSES]-(w:EvidenceUnit)`,
  yields: ["w"],
  empty: () => false,
  fold: (acc, r) => acc || r.w !== null,
};

const standing: Derived<string> = {
  name: "standing",
  needs: [answeringClaim, unmet, worked],
  from: (n) =>
    n.answeringClaim && n.answeringClaim.kind === "confirmatory" && n.unmet.size === 0 ? "established"
    : n.answeringClaim ? "provisional"
    : n.worked ? "unresolved"
    : "untested",
};

// ── compose and run ──────────────────────────────────────────────────────────

const leaves = leavesOf(standing);
const cypher = [
  `MATCH (q:Question)`,
  ...leaves.map((l) => l.clause.trim()),
  `RETURN q, ${leaves.flatMap((l) => l.yields).join(", ")}`,
].join("\n");

const conn = await connectDb(process.env.LABKIT_HOME!);
const ctx = await resolveTenantContext(conn.db, conn.tx, "labkit");
const graph = new TenantGraph(ctx, conn.db, conn.tx);

const decoders: Record<string, any> = { q: vertexProps<any>() };
for (const y of leaves.flatMap((l) => l.yields)) decoders[y] = optional(vertexProps<any>());

console.log(`═══ composed from ${leaves.length} leaves, ${cypher.split("\n").length} lines ═══\n`);
const rows: any[] = await graph.query(cypher, decoders, {});
console.log(`ran on AGE: ${rows.length} rows for 2 questions (the fan-out)\n`);

const byQuestion = new Map<string, any[]>();
for (const r of rows) {
  const list = byQuestion.get(r.q.natural_id) ?? [];
  list.push(r);
  byQuestion.set(r.q.natural_id, list);
}
for (const [id, qrows] of byQuestion) {
  const { value, because } = evaluate(standing, qrows);
  console.log(JSON.stringify({
    question: id, asks: qrows[0].q.name, standing: value,
    because: { ...because, unmet: [...because.unmet], answeringClaim: because.answeringClaim?.natural_id ?? null },
    rows: qrows.length,
  }));
}
await conn.close();
