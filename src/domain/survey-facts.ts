/**
 * The facts a knowledge survey is made of.
 *
 * One definition per question the reader is really asking. Every report that
 * needs "is this answer promoted" or "did its prespecified checks pass" reads
 * the same fact, so the two cannot drift — which is the whole reason these are
 * named rather than inlined. See `./facts.ts` for the machinery and the three
 * defects that earned it.
 */

import { optional, vertexProps } from "../db/cypher";
import { ref } from "./report";
import type { CheckStatus, EvidenceRef } from "./report";
import type { Derived, Leaf, Row } from "./facts";

/** Shapes the folds below assert. A row is decoded, not typed, at the seam. */
interface Node {
  natural_id: string;
}
interface ClaimNode extends Node {
  kind?: string;
}
interface EvaluationNode extends Node {
  outcome: "pass" | "fail";
  evaluated_at: string;
  value: string;
}
interface CriterionNode extends Node {
  proposition: string;
}
interface BasisNode extends Node {
  statement: string;
}
interface ArtefactNode extends Node {
  invalidated?: boolean;
}

const id = (row: Row, key: string): string | null => (row[key] as Node | null)?.natural_id ?? null;

/** Grains. Each names the subject a fact answers about. */
export const byQuestion: (row: Row) => string | null = (row) => id(row, "q");
export const byClaim: (row: Row) => string | null = (row) => id(row, "answering");
export const byCriterion: (row: Row) => string | null = (row) => id(row, "crit");
export const byEvaluation: (row: Row) => string | null = (row) => id(row, "ev");

/**
 * The claim a closing decision rests on, **whichever way its evidence bears**.
 *
 * The one place the `SUPPORTS`/`CHALLENGES` pair is spelled, and the reason
 * this file exists. AGE has no edge alternation — `[:SUPPORTS|CHALLENGES]` is a
 * syntax error — so reaching a claim needs two clauses and a coalesce, and
 * writing only the first is a silent hole rather than an error: the row is
 * simply absent and the reader concludes nothing is wrong.
 *
 * A promoted **negative** result is a first-class case (S-18b), so the second
 * clause is not an edge case. It was missing from one reader and present in
 * another, and the two agreed while both were blind — quieter than a
 * contradiction and harder to find.
 */
export const answeringClaim: Leaf<ClaimNode | null> = {
  name: "answeringClaim",
  grain: byQuestion,
  clause: `OPTIONAL MATCH (closing:Decision)-[:RESOLVES]->(q)
           OPTIONAL MATCH (closing)-[:BASED_ON]->(cited:Evidence)
           OPTIONAL MATCH (cited)-[:SUPPORTS]->(supported:Claim)
           OPTIONAL MATCH (cited)-[:CHALLENGES]->(challenged:Claim)`,
  yields: {
    cited: optional(vertexProps<Node>()),
    supported: optional(vertexProps<ClaimNode>()),
    challenged: optional(vertexProps<ClaimNode>()),
  },
  empty: () => null,
  fold: (found, row) =>
    found ?? (row.supported as ClaimNode | null) ?? (row.challenged as ClaimNode | null),
};

/**
 * The evidence units a claim's checks hang off — **selected by handle**.
 *
 * The second place two readers disagreed. `whySupported` selected claims by
 * proposition wording narrowed to an enquiry; the survey selected by handle.
 * `recordAnalysis` mints a `Claim` per conclusion unconditionally, so two
 * analyses in one enquiry concluding the same sentence are two nodes sharing a
 * name — and the two verbs then gave contradictory answers about one claim's
 * standing. Demonstrated on 2026-08-27.
 *
 * Handle wins, which is S-5's argument: a claim has its own identity and
 * wording is not it. The same pair problem as above appears here too, because
 * an `EvidenceUnit` reaches its claim by whichever edge its evidence bears.
 */
export const checksOf: Leaf<Set<string>> = {
  name: "checksOf",
  grain: byClaim,
  // Declares the claim fact so its clause is emitted first: these patterns read
  // `supported` and `challenged`, which nothing else binds.
  needs: [answeringClaim],
  clause: `OPTIONAL MATCH (supported)<-[:SUPPORTS]-(:Evidence)<-[:PRODUCES]-(su:EvidenceUnit)
           OPTIONAL MATCH (challenged)<-[:CHALLENGES]-(:Evidence)<-[:PRODUCES]-(cu:EvidenceUnit)
           OPTIONAL MATCH (crit:Criterion)-[:QUALIFIES]->(su)
           OPTIONAL MATCH (crit2:Criterion)-[:QUALIFIES]->(cu)`,
  yields: {
    su: optional(vertexProps<Node>()),
    cu: optional(vertexProps<Node>()),
    crit: optional(vertexProps<Node>()),
    crit2: optional(vertexProps<Node>()),
  },
  empty: () => new Set<string>(),
  fold: (criteria, row) => {
    for (const key of ["crit", "crit2"]) {
      const found = id(row, key);
      if (found !== null) criteria.add(found);
    }
    return criteria;
  },
};

/**
 * One evaluation, folded: its verdict, and how much of its basis still stands.
 *
 * **Parameterised by which evaluations count**, because two scopes are
 * deliberately different and the difference is load-bearing (S-17 with S-3):
 *
 * - **gate-scoped** — has this condition been checked *for this gate*?
 * - **criterion-scoped** — has this check ever been shown able to fail?
 *
 * One criterion can govern several gates and be evaluated separately against
 * each — the same hash check run against staging and against release.
 * Collapsing the two made a gate nobody had evaluated report as blocked
 * because its criterion had failed somewhere else. That distinction used to
 * live in a paragraph above one of the two queries; here it is an argument, so
 * a caller has to choose rather than inherit whichever query they copied.
 *
 * A verdict is **retracted** when everything it cited has been invalidated,
 * which is not failing — that difference is `no-standing-verdict` (S-3c). A
 * verdict citing nothing cannot be retracted at all, which stops S-8's
 * asserted-versus-measured distinction becoming a loophole.
 */
export function verdictsWhere(name: string, evaluationClause: string): Leaf<Verdict> {
  return {
    name,
    grain: byEvaluation,
    clause: `${evaluationClause}
           OPTIONAL MATCH (ev)-[:BASED_ON]->(basis:Evidence)
           OPTIONAL MATCH (basis)-[:RECORDED_IN]->(basisout:Artefact)`,
    yields: {
      ev: optional(vertexProps<EvaluationNode>()),
      basis: optional(vertexProps<Node>()),
      basisout: optional(vertexProps<ArtefactNode>()),
    },
    empty: () => ({ cited: 0, standing: 0, outcome: null, at: "", value: "", basis: [] }),
    fold: (verdict, row) => {
      const evaluation = row.ev as EvaluationNode | null;
      const seen: Verdict = evaluation
        ? {
            ...verdict,
            outcome: evaluation.outcome,
            at: evaluation.evaluated_at,
            value: evaluation.value,
          }
        : verdict;
      const basis = row.basis as BasisNode | null;
      if (basis === null) return seen;
      // By handle, not by sentence: one evaluation citing several findings
      // arrives as several rows, and two findings can state the same thing.
      const known = seen.basis.some((b) => b.evidence === basis.natural_id);
      return {
        ...seen,
        basis: known
          ? seen.basis
          : [
              ...seen.basis,
              { evidence: ref("evidence", basis.natural_id), states: basis.statement },
            ],
        cited: seen.cited + 1,
        standing: seen.standing + ((row.basisout as ArtefactNode | null)?.invalidated ? 0 : 1),
      };
    },
  };
}

/** A verdict and how much of its basis stands. `outcome` is null when none exists. */
export interface Verdict {
  cited: number;
  standing: number;
  outcome: "pass" | "fail" | null;
  at: string;
  value: string;
  /** The findings it was reached against, deduplicated by handle. */
  basis: { evidence: EvidenceRef; states: string }[];
}

/** The four states a prespecified condition can be in. */
export type CheckState = "passed" | "failed" | "never-run" | "no-standing-verdict";

/** Retracted: it cited findings, and every one has since been invalidated. */
const retracted = (v: Verdict): boolean => v.cited > 0 && v.standing === 0;

/**
 * A criterion's state, over whichever verdicts the caller chose.
 *
 * A failure **sticks** among verdicts that still stand, so re-running until
 * green is not evidence (S-3). A wholly-retracted verdict is a retraction and
 * not a failure (S-3c). And `never-run` is a first-class value rather than the
 * absence of one, because a check nobody performed must be distinguishable
 * from one that failed (S-17).
 */
export function checkStateOver(verdicts: Leaf<Verdict>): Derived<CheckState> {
  return {
    name: "checkState",
    grain: byCriterion,
    needs: [verdicts],
    from: (needs) => {
      const all = [...(needs[verdicts.name] as Map<string, Verdict>).values()];
      const standing = all.filter((v) => !retracted(v));
      if (standing.length === 0) return all.length > 0 ? "no-standing-verdict" : "never-run";
      return standing.some((v) => v.outcome === "fail") ? "failed" : "passed";
    },
  };
}

/** The criterion node itself, so a check can report what it requires. */
export const criterionProps: Leaf<CriterionNode> = {
  name: "criterionProps",
  grain: byCriterion,
  clause: "",
  yields: {},
  empty: () => ({ natural_id: "", proposition: "" }),
  fold: (found, row) => (row.crit as CriterionNode | null) ?? found,
};

/** Every evaluation of a criterion, whichever gate it was reached for. */
export const anyVerdict = verdictsWhere(
  "anyVerdict",
  `OPTIONAL MATCH (crit)-[:EVALUATED_AS]->(ev:CriterionEvaluation)`,
);

/** Only the evaluations reached **for this gate** (S-17 with S-3; see above). */
export const verdictForGate = verdictsWhere(
  "verdictForGate",
  `OPTIONAL MATCH (crit)-[:EVALUATED_AS]->(ev:CriterionEvaluation)-[:TRIGGERS]->(g)`,
);

/** How a check bears on a finding: every verdict counts. */
export const checkState = checkStateOver(anyVerdict);

/** A finding's prespecified conditions, itemised. */
export const checkStatus = checkStatusOver(anyVerdict);

/** A gate's conditions, itemised, scoped to verdicts reached for that gate. */
export const checkStatusForGate = checkStatusOver(verdictForGate);

/** Every prespecified check on the answering claim passed. Vacuously true when there are none. */
export const checksMet: Derived<boolean> = {
  name: "checksMet",
  grain: byClaim,
  needs: [checksOf, checkState],
  from: (needs) => {
    const required = needs.checksOf as Set<string>;
    const states = needs.checkState as Map<string, CheckState>;
    return [...required].every((criterion) => states.get(criterion) === "passed");
  },
};

/**
 * A check, itemised — the shape a reader is shown, not just its state.
 *
 * Replaces `checksFrom`, and with it the last place the four-state rule was
 * written out. Three reports need this — a gate's conditions, the standard a
 * finding was held to, and the survey's own bucketing — and each used to fold
 * it separately from a query it also wrote separately.
 *
 * Evaluations are ordered by time then identity because **Cypher imposes no
 * ordering**, and without it *which* verdict is reported as "the" value of a
 * check is not a stable contract between runs.
 */
export function checkStatusOver(verdicts: Leaf<Verdict>): Derived<CheckStatus> {
  const state = checkStateOver(verdicts);
  return {
    name: "checkStatus",
    grain: byCriterion,
    needs: [verdicts, state, criterionProps],
    from: (needs) => {
      const found = needs[verdicts.name] as Map<string, Verdict>;
      const criterion = needs.criterionProps as CriterionNode;
      const ordered = [...found]
        .map(([evaluation, v]) => ({ evaluation, ...v }))
        .sort((a, b) => a.at.localeCompare(b.at) || a.evaluation.localeCompare(b.evaluation));
      const records = ordered.map((v) => ({
        evaluation: ref("evaluation", v.evaluation),
        criterion: ref("criterion", criterion.natural_id),
        value: v.value ?? "",
        outcome: (v.outcome ?? "pass") as "pass" | "fail",
        at: v.at,
        basis: v.basis,
        ...(retracted(v) ? { withdrawn: true as const } : {}),
      }));
      const standing = ordered.filter((v) => !retracted(v));
      const decisive = standing.find((v) => v.outcome === "fail") ?? standing[0];
      return {
        criterion: ref("criterion", criterion.natural_id),
        proposition: criterion.proposition,
        state: needs[state.name] as CheckState,
        evaluations: records,
        ...(decisive
          ? { decidedBy: records.find((r) => r.evaluation === decisive.evaluation) }
          : {}),
      } as CheckStatus;
    },
  };
}

/**
 * Whether the answer stood as promoted **at a moment**, and whether it had been
 * resolved by then.
 *
 * A historical survey cannot read `Claim.kind`, which carries no time: it has
 * to ask whether a promoting decision had been taken yet. That is a third
 * definition of "promoted" living beside the other two, and the reason it is
 * here rather than inline is that the first two drifted — the survey learned to
 * consult prespecified checks and the historical one did not, four lines apart
 * in shape.
 *
 * Both bearings again, and for the same reason as {@link answeringClaim}: a
 * promoted *negative* result is settled by evidence that `CHALLENGES`, and
 * matching only `SUPPORTS` reads it as scratch (S-18b).
 */
export function standingAsOf(at: string): Leaf<{ resolved: boolean; promoted: boolean }> {
  return {
    name: "standingAsOf",
    grain: byQuestion,
    clause: `OPTIONAL MATCH (resolving:Decision)-[:RESOLVES]->(q)
           OPTIONAL MATCH (resolving)-[:BASED_ON]->(cited:Evidence)
           OPTIONAL MATCH (cited)-[:SUPPORTS]->(supported:Claim)
           OPTIONAL MATCH (cited)-[:CHALLENGES]->(challenged:Claim)
           OPTIONAL MATCH (promoting:Decision)-[:PROMOTES]->(supported)
           OPTIONAL MATCH (denying:Decision)-[:PROMOTES]->(challenged)`,
    yields: {
      resolving: optional(vertexProps<{ decided_at: string }>()),
      cited: optional(vertexProps<Node>()),
      supported: optional(vertexProps<ClaimNode>()),
      challenged: optional(vertexProps<ClaimNode>()),
      promoting: optional(vertexProps<{ decided_at: string }>()),
      denying: optional(vertexProps<{ decided_at: string }>()),
    },
    empty: () => ({ resolved: false, promoted: false }),
    fold: (standing, row) => {
      const resolving = row.resolving as { decided_at: string } | null;
      // A decision taken after the moment asked about has not happened yet.
      const resolvedByThen = resolving !== null && resolving.decided_at <= at;
      const vouched = (row.promoting ?? row.denying) as { decided_at: string } | null;
      return {
        resolved: standing.resolved || (resolvedByThen && row.cited !== null),
        promoted:
          standing.promoted || (resolvedByThen && vouched !== null && vouched.decided_at <= at),
      };
    },
  };
}

/**
 * The anchor for "the checks this claim answers to", **for one bearing**.
 *
 * Called once per bearing and the results merged, which is the idiom
 * `findingsBearing` already uses in this codebase — and it is here rather than
 * inline because writing it inline is what keeps going wrong. AGE has no edge
 * alternation, so a hand-written anchor names one edge, and naming only
 * `SUPPORTS` is **silent**: a promoted negative result reports *held to no
 * prespecified standard* while the record holds the check.
 *
 * That has now happened three times — twice in shipped readers, and once in the
 * spike written to demonstrate it. The third was in an anchor written *after*
 * the fact existed, which is why the anchor is a function now and not a
 * template a caller fills in.
 *
 * Evidence recorded in an invalidated artefact is excluded: a superseded
 * analysis's checks are not this claim's standard any more.
 */
export function checksAnchor(bearing: "SUPPORTS" | "CHALLENGES"): string {
  return `MATCH (cl:Claim {natural_id: $claim})<-[:${bearing}]-(e:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       MATCH (e)-[:RECORDED_IN]->(out:Artefact)
       WHERE out.invalidated IS NULL OR out.invalidated = false
       MATCH (crit:Criterion)-[:QUALIFIES]->(u)`;
}
