/**
 * SPIKE v3 — does the four-state check rule decompose into facts?
 *
 * The hard case. checksFrom() is 84 lines and spans FOUR subject levels:
 *   question -> criterion -> evaluation -> basis
 * each folding into the one above. A flat Fact cannot say that, so the
 * machinery grows one concept: GRAIN, the key a fact is computed per.
 */
import { connectDb } from "../../src/db/connect";
import { resolveTenantContext } from "../../src/db/tenant";
import { TenantGraph } from "../../src/db/graph";
import { vertexProps, optional } from "../../src/db/cypher";

// ── machinery: +8 lines over v2, all of it `grain` ──────────────────────────

type Grain = (row: any) => string | null;
type Leaf<T> = { name: string; grain: Grain; empty: () => T; fold: (a: T, r: any) => T };
type Derived<T> = { name: string; grain: Grain; needs: AnyFact[]; from: (n: any) => T };
type AnyFact = Leaf<any> | Derived<any>;
const isLeaf = (f: AnyFact): f is Leaf<any> => "fold" in f;

/** One value per distinct grain key. Rows with a null key do not contribute. */
function per<T>(f: AnyFact, rows: any[]): Map<string, T> {
  const out = new Map<string, T>();
  const keyed = new Map<string, any[]>();
  for (const r of rows) {
    const k = f.grain(r);
    if (k === null) continue;
    keyed.set(k, [...(keyed.get(k) ?? []), r]);
  }
  for (const [k, group] of keyed) {
    if (isLeaf(f)) out.set(k, group.reduce(f.fold, f.empty()));
    else {
      const n: any = {};
      for (const d of f.needs) {
        const sub = per(d, group);
        // THE GRAIN RULE, found by getting it wrong: a dependency at the SAME
        // grain is one value, not a map of one. Only a FINER grain fans out.
        n[d.name] = d.grain === f.grain ? [...sub.values()][0] : sub;
      }
      out.set(k, f.from(n));
    }
  }
  return out;
}

// ── the facts.  Each level is named. ─────────────────────────────────────────

const byEvaluation: Grain = (r) => r.ev?.natural_id ?? null;
const byCriterion: Grain = (r) => r.crit?.natural_id ?? null;

/** LEVEL 4 -> 3.  An evaluation is withdrawn when everything it cited was. */
const withdrawn: Leaf<{ cited: number; standing: number }> = {
  name: "withdrawn",
  grain: byEvaluation,
  empty: () => ({ cited: 0, standing: 0 }),
  fold: (a, r) =>
    r.basis === null ? a
    : { cited: a.cited + 1, standing: a.standing + (r.basisout?.invalidated ? 0 : 1) },
};

/** LEVEL 3 -> 2.  Every standing verdict on this criterion, in time order. */
const verdicts: Derived<{ id: string; outcome: string; at: string }[]> = {
  name: "verdicts",
  grain: byCriterion,
  needs: [withdrawn],
  from: (n) => {
    const out: any[] = [];
    for (const [id, w] of n.withdrawn as Map<string, any>) {
      if (w.cited > 0 && w.standing === 0) continue;   // withdrawn: retracted, not failing
      out.push({ id, ...(evalMeta.get(id) ?? {}) });
    }
    return out.sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.id.localeCompare(b.id));
  },
};

/** LEVEL 2.  The four states, and the precedence that earned them. */
const checkState: Derived<string> = {
  name: "checkState",
  grain: byCriterion,
  needs: [verdicts, withdrawn],
  from: (n) => {
    const standing = n.verdicts as any[];
    const any = (n.withdrawn as Map<string, any>).size > 0;
    const decisive = standing.find((e) => e.outcome === "fail") ?? standing[0];
    return decisive ? (decisive.outcome === "fail" ? "failed" : "passed")
         : any ? "no-standing-verdict"
         : "never-run";
  },
};

// ── run it ───────────────────────────────────────────────────────────────────

const evalMeta = new Map<string, { outcome: string; at: string }>();

const conn = await connectDb(process.env.LABKIT_HOME!);
const ctx = await resolveTenantContext(conn.db, conn.tx, "labkit");
const g = new TenantGraph(ctx, conn.db, conn.tx);

const rows: any[] = await g.query(
  `MATCH (cl:Claim)<-[:SUPPORTS]-(e:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
   MATCH (crit:Criterion)-[:QUALIFIES]->(u)
   OPTIONAL MATCH (crit)-[:EVALUATED_AS]->(ev:CriterionEvaluation)
   OPTIONAL MATCH (ev)-[:BASED_ON]->(basis:Evidence)
   OPTIONAL MATCH (basis)-[:RECORDED_IN]->(basisout:Artefact)
   RETURN cl, crit, ev, basis, basisout`,
  { cl: vertexProps<any>(), crit: vertexProps<any>(), ev: optional(vertexProps<any>()),
    basis: optional(vertexProps<any>()), basisout: optional(vertexProps<any>()) },
  {},
);
for (const r of rows) if (r.ev) evalMeta.set(r.ev.natural_id, { outcome: r.ev.outcome, at: r.ev.evaluated_at });

console.log(`${rows.length} rows\n`);
const byClaim = new Map<string, any[]>();
for (const r of rows) byClaim.set(r.cl.natural_id, [...(byClaim.get(r.cl.natural_id) ?? []), r]);
for (const [claim, crows] of [...byClaim].sort()) {
  for (const [crit, state] of per(checkState, crows))
    console.log(`  ${claim}  ${crit}  -> ${state}`);
}
await conn.close();
