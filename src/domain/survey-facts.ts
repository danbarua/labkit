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
import type { CheckStatus, EvaluationRecord, EvidenceRef } from "./report";
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

const id = (row: Row, key: string): string | null => (row[key] as Node | null)?.natural_id ?? null;

/** Grains. Each names the subject a fact answers about. */
export const byQuestion: (row: Row) => string | null = (row) => id(row, "q");
export const byClaim: (row: Row) => string | null = (row) => id(row, "answering");
export const byCriterion: (row: Row) => string | null = (row) => id(row, "crit");
export const byEvaluation: (row: Row) => string | null = (row) => id(row, "ev");

/**
 * The claim a closing decision rests on, **for one bearing**.
 *
 * AGE has no edge alternation — `[:SUPPORTS|CHALLENGES]` is a syntax error — so
 * a claim is reached one edge at a time. Writing them as two clauses in one
 * query binding two column names is how the defect survives: a fold can collect
 * both names while the **grain** reads one, so a criterion arriving down the
 * challenged path is dropped. Two places knew
 * there were two paths and only one was updated.
 *
 * So the bearing is a parameter and the caller runs both, merging the results.
 * Downstream there is one `answering` and one `crit`, and nothing after this
 * function can be written to know about only half of it. `WITH coalesce(…)` was
 * measured and does work on AGE, but it collapses the query — every later
 * clause would have to be projected forward by hand, which a composable
 * system cannot ask of its callers.
 *
 * A promoted **negative** result is a first-class case: this is not an edge
 * condition, it is half the domain.
 */
export function answeringClaimBearing(bearing: "SUPPORTS" | "CHALLENGES"): Leaf<ClaimNode | null> {
  return {
    name: "answeringClaim",
    grain: byQuestion,
    clause: `OPTIONAL MATCH (closing:Decision)-[:RESOLVES]->(q)
           OPTIONAL MATCH (closing)-[:BASED_ON]->(cited:Evidence)
           OPTIONAL MATCH (cited)-[:${bearing}]->(answering:Claim)`,
    yields: {
      cited: optional(vertexProps<Node>()),
      answering: optional(vertexProps<ClaimNode>()),
    },
    empty: () => null,
    fold: (found, row) => found ?? (row.answering as ClaimNode | null),
  };
}

/**
 * The prespecified checks a claim answers to — **selected by handle**.
 *
 * The second place two readers disagreed, before this. `whySupported` selected
 * claims by proposition wording narrowed to an enquiry; the survey selected by
 * handle. `recordAnalysis` mints a `Claim` per conclusion unconditionally, so
 * two analyses in one enquiry concluding the same sentence are two nodes
 * sharing a name — and the two verbs gave contradictory answers about one
 * claim's standing.
 *
 * Handle wins: a claim has its own identity and wording is not it. **Findings
 * are the opposite and deliberately so** — see `findingsBearing` in `read.ts`.
 */
export function checksOfBearing(bearing: "SUPPORTS" | "CHALLENGES"): Leaf<Set<string>> {
  return {
    name: "checksOf",
    grain: byClaim,
    needs: [answeringClaimBearing(bearing)],
    clause: `OPTIONAL MATCH (answering)<-[:${bearing}]-(:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
           OPTIONAL MATCH (crit:Criterion)-[:QUALIFIES]->(u)`,
    yields: {
      u: optional(vertexProps<Node>()),
      crit: optional(vertexProps<Node>()),
    },
    empty: () => new Set<string>(),
    fold: (criteria, row) => {
      const found = id(row, "crit");
      if (found !== null) criteria.add(found);
      return criteria;
    },
  };
}

/**
 * One evaluation, folded: its verdict, and how much of its basis still stands.
 *
 * **Parameterised by which evaluations count**, because two scopes are
 * deliberately different and the difference is load-bearing:
 *
 * - **gate-scoped** — has this condition been checked *for this gate*?
 * - **criterion-scoped** — has this check ever been shown able to fail?
 *
 * One criterion can govern several gates and be evaluated separately against
 * each — the same hash check run against staging and against release.
 * Collapsing the two makes a gate nobody has evaluated report as blocked
 * because its criterion failed somewhere else. It is a parameter rather than a
 * paragraph above one of two queries, so a caller has to choose rather than
 * inherit whichever query they copied.
 *
 * A verdict is **retracted** when everything it cited has been invalidated,
 * which is not failing — that difference is `no-standing-verdict`. A verdict
 * citing nothing cannot be retracted at all, which stops an asserted verdict
 * being indistinguishable from a measured one.
 */
export function verdictsWhere(name: string, evaluationClause: string): Leaf<Verdict> {
  return {
    name,
    grain: byEvaluation,
    // **Standing is per finding, not per artefact**: a finding is superseded
    // when a decision stands instead of the claim it bears on.
    //
    // **Two clauses because AGE has no edge alternation.** Naming one is
    // silent: `[:SUPPORTS|CHALLENGES]` is a syntax error, and a verdict
    // resting on a challenging finding would simply never match. The fold
    // below reads both.
    clause: `${evaluationClause}
           OPTIONAL MATCH (ev)-[:BASED_ON]->(basis:Evidence)
           OPTIONAL MATCH (basis)-[:SUPPORTS]->(supported:Claim)<-[:SUPERSEDES]-(:Decision)
           OPTIONAL MATCH (basis)-[:CHALLENGES]->(challenged:Claim)<-[:SUPERSEDES]-(:Decision)`,
    yields: {
      ev: optional(vertexProps<EvaluationNode>()),
      basis: optional(vertexProps<Node>()),
      supported: optional(vertexProps<Node>()),
      challenged: optional(vertexProps<Node>()),
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
        // Either bearing. A finding superseded on the challenging side counts
        // exactly as one superseded on the supporting side; reading one is the
        // silent half of the two-clause pair above.
        standing: seen.standing + (row.supported || row.challenged ? 0 : 1),
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
 * green is not evidence. A wholly-retracted verdict is a retraction and not a
 * failure. And `never-run` is a first-class value rather than the absence of
 * one, because a check nobody performed must be distinguishable from one that
 * failed.
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

/** Every evaluation of a criterion, whatever gate it was run for. */
export const criterionEvaluations = evaluationsOver(anyVerdict);

/**
 * One criterion's state and its evaluations, from one query.
 *
 * A `Derived` needing both rather than folding the two over rows composed from
 * one of them: `compose` builds its clauses from the root fact's leaves, so
 * reading a second fact off those rows would work only for as long as the
 * first happened to need the same ones — the silent-omission shape `facts.ts`
 * exists to prevent, arrived at from the caller's side.
 */
export const criterionDetail: Derived<{
  status: CheckStatus;
  evaluations: EvaluationRecord[];
}> = {
  name: "criterionDetail",
  grain: byCriterion,
  needs: [checkStatus, criterionEvaluations],
  from: (needs) => ({
    status: needs[checkStatus.name] as CheckStatus,
    evaluations: needs[criterionEvaluations.name] as EvaluationRecord[],
  }),
};

/** Every prespecified check on the answering claim passed. Vacuously true when there are none. */
export function checksMetBearing(bearing: "SUPPORTS" | "CHALLENGES"): Derived<boolean> {
  return {
    name: "checksMet",
    grain: byClaim,
    needs: [checksOfBearing(bearing), checkState],
    from: (needs) => {
      const required = needs.checksOf as Set<string>;
      const states = needs.checkState as Map<string, CheckState>;
      return [...required].every((criterion) => states.get(criterion) === "passed");
    },
  };
}

/** The two ways a claim is reached. Callers run both and merge; see {@link answeringClaimBearing}. */
export const BEARINGS = ["SUPPORTS", "CHALLENGES"] as const;

/**
 * One criterion's evaluations as records, oldest first, ties broken by
 * identity — the ordering rule `checkStatusOver` states, applied in the one
 * place both readers get it from.
 */
function recordsOf(
  ordered: (Verdict & { evaluation: string })[],
  criterion: string,
): EvaluationRecord[] {
  return ordered.map((v) => ({
    evaluation: ref("evaluation", v.evaluation),
    criterion: ref("criterion", criterion),
    value: v.value ?? "",
    outcome: (v.outcome ?? "pass") as "pass" | "fail",
    at: v.at,
    basis: v.basis,
    ...(retracted(v) ? { withdrawn: true as const } : {}),
  }));
}

/**
 * Every evaluation of one criterion, in full — the detail a gate's page no
 * longer carries.
 *
 * Separate from {@link checkStatusOver} because the two are asked different
 * questions: a gate wants each check's *state*, and a reader looking at one
 * criterion wants what was actually said. Sharing `recordsOf` is what keeps
 * the ordering one rule rather than two.
 */
export function evaluationsOver(verdicts: Leaf<Verdict>): Derived<EvaluationRecord[]> {
  return {
    name: `${verdicts.name}Records`,
    grain: byCriterion,
    needs: [verdicts, criterionProps],
    from: (needs) => {
      const found = needs[verdicts.name] as Map<string, Verdict>;
      const criterion = needs.criterionProps as CriterionNode;
      const ordered = [...found]
        .map(([evaluation, v]) => ({ evaluation, ...v }))
        .sort((a, b) => a.at.localeCompare(b.at) || a.evaluation.localeCompare(b.evaluation));
      return recordsOf(ordered, criterion.natural_id);
    },
  };
}

/**
 * A check, itemised — the shape a reader is shown, not just its state.
 *
 * Three reports need it — a gate's conditions, the standard a finding was held
 * to, and the survey's own bucketing — so the four-state rule is written out
 * here and nowhere else.
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
      const records = recordsOf(ordered, criterion.natural_id);
      const standing = ordered.filter((v) => !retracted(v));
      const decisive = standing.find((v) => v.outcome === "fail") ?? standing[0];
      const decided = decisive && records.find((r) => r.evaluation === decisive.evaluation);
      return {
        criterion: ref("criterion", criterion.natural_id),
        proposition: criterion.proposition,
        state: needs[state.name] as CheckState,
        // **The verdict's sentence is not carried here** -- see
        // `DecidingEvaluation`. A gate governing many criteria is asked what
        // state everything is in, and the sentences are the whole of its size.
        ...(decided
          ? {
              decidedBy: {
                evaluation: decided.evaluation,
                outcome: decided.outcome,
                at: decided.at,
              },
            }
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
 * Takes the bearing, like every other fact here. It was the last one holding
 * two column names for one subject — `supported`/`challenged` with a fold
 * reading both — which was *correct* and was the shape that failed elsewhere:
 * `checksOf` held two names and its **grain** read one. This survived only
 * because its consumer was the fold in the same object rather than a separate
 * function. Uniform now, so the pattern is not there to be copied.
 */
export function standingAsOf(
  at: string,
  bearing: "SUPPORTS" | "CHALLENGES",
): Leaf<{ resolved: boolean; promoted: boolean }> {
  return {
    name: "standingAsOf",
    grain: byQuestion,
    clause: `OPTIONAL MATCH (resolving:Decision)-[:RESOLVES]->(q)
           OPTIONAL MATCH (resolving)-[:BASED_ON]->(cited:Evidence)
           OPTIONAL MATCH (cited)-[:${bearing}]->(answering:Claim)
           OPTIONAL MATCH (vouching:Decision)-[:PROMOTES]->(answering)`,
    yields: {
      resolving: optional(vertexProps<{ decided_at: string }>()),
      cited: optional(vertexProps<Node>()),
      answering: optional(vertexProps<ClaimNode>()),
      vouching: optional(vertexProps<{ decided_at: string }>()),
    },
    empty: () => ({ resolved: false, promoted: false }),
    fold: (standing, row) => {
      const resolving = row.resolving as { decided_at: string } | null;
      // A decision taken after the moment asked about has not happened yet.
      const resolvedByThen = resolving !== null && resolving.decided_at <= at;
      const vouched = row.vouching as { decided_at: string } | null;
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
