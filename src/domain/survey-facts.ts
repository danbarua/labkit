/**
 * The facts a knowledge survey is made of.
 */

import { optional, vertexProps } from "../db/cypher";
import type { ColumnDecoder } from "../db/cypher";
import { ref } from "./report";
import type { CheckStatus, ClaimRef, EvaluationRecord, EvidenceRef } from "./report";
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

/** A question's answer, and whether any decision promoted it. */
export interface AnsweringClaim {
  claim: ClaimNode;
  vouchedFor: boolean;
}

/**
 * The claim a closing decision rests on, **for one bearing**.
 */
export function answeringClaimBearing(
  bearing: "SUPPORTS" | "CHALLENGES",
): Leaf<AnsweringClaim | null> {
  return {
    name: "answeringClaim",
    grain: byQuestion,
    // **One path, to the end.** Whether anyone vouched for the answer is the last hop of the
    // same walk, not a second question asked afterwards: a promotion is `Decision -PROMOTES->
    // Claim` and nothing else.
    clause: `OPTIONAL MATCH (closing:Decision)-[:RESOLVES]->(q)
           OPTIONAL MATCH (closing)-[:BASED_ON]->(cited:Evidence)
           OPTIONAL MATCH (cited)-[:${bearing}]->(answering:Claim)
           OPTIONAL MATCH (answering)<-[:PROMOTES]-(vouching:Decision)`,
    yields: {
      cited: optional(vertexProps<Node>()),
      answering: optional(vertexProps<ClaimNode>()),
      vouching: optional(vertexProps<Node>()),
    },
    empty: () => null,
    // The claim is the first one found, as before. The vouch is an OR across
    // rows: the same claim arrives once per promoting decision and once more
    // with none, so `found ?? row` would keep whichever row came first and
    // drop a real promotion on the strength of row order.
    fold: (found, row) => {
      const claim = found?.claim ?? (row.answering as ClaimNode | null);
      if (!claim) return found;
      return { claim, vouchedFor: (found?.vouchedFor ?? false) || row.vouching !== null };
    },
  };
}

/**
 * The prespecified checks a claim answers to — **selected by handle**.
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
 */
export function verdictsWhere(
  name: string,
  evaluationClause: string,
  alsoYields: Record<string, ColumnDecoder<unknown>> = {},
): Leaf<Verdict> {
  return {
    name,
    grain: byEvaluation,
    // **Standing is per finding, not per artefact**: a finding is superseded when a decision
    // stands instead of the claim it bears on. **Two clauses because AGE has no edge
    // alternation.** Naming one is silent: `[:SUPPORTS|CHALLENGES]` is a syntax error, and a
    // verdict resting on a challenging finding would simply never match.
    clause: `${evaluationClause}
           OPTIONAL MATCH (ev)-[:ABOUT]->(judged:Claim)
           OPTIONAL MATCH (judged)<-[:SUPERSEDES]-(:Decision)-[:MOTIVATES]->(instead:Claim)
           OPTIONAL MATCH (ev)-[:BASED_ON]->(basis:Evidence)
           OPTIONAL MATCH (basis)-[:SUPPORTS]->(supported:Claim)<-[:SUPERSEDES]-(:Decision)
           OPTIONAL MATCH (basis)-[:CHALLENGES]->(challenged:Claim)<-[:SUPERSEDES]-(:Decision)`,
    yields: {
      ev: optional(vertexProps<EvaluationNode>()),
      judged: optional(vertexProps<Node>()),
      instead: optional(vertexProps<Node>()),
      basis: optional(vertexProps<Node>()),
      supported: optional(vertexProps<Node>()),
      challenged: optional(vertexProps<Node>()),
      ...alsoYields,
    },
    empty: () => ({
      cited: 0,
      standing: 0,
      outcome: null,
      at: "",
      value: "",
      basis: [],
      elsewhere: false,
    }),
    fold: (verdict, row) => {
      const evaluation = row.ev as EvaluationNode | null;
      // The subject as it now stands: the successor when one exists.
      const judged = (row.instead as Node | null) ?? (row.judged as Node | null);
      // Only the gate-scoped leaf yields `trig`; everywhere else both are
      // undefined and every verdict is at home.
      const reachedFor = row.trig as Node | null | undefined;
      const readThrough = row.g as Node | null | undefined;
      const elsewhere =
        reachedFor != null &&
        readThrough != null &&
        reachedFor.natural_id !== readThrough.natural_id;
      const seen: Verdict = evaluation
        ? {
            ...verdict,
            elsewhere,
            outcome: evaluation.outcome,
            at: evaluation.evaluated_at,
            value: evaluation.value,
            // Present only when the act named one. Absent is the ordinary
            // case — a criterion evaluated as a whole — and must stay
            // absent rather than becoming a placeholder.
            ...(judged ? { about: ref("claim", judged.natural_id) } : {}),
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
  /** The finding it judged, when one criterion is applied to several (#133). */
  about?: ClaimRef;
  /**
   * Reached for a gate other than the one this row was read through. False
   * when the act named no gate, and false for every reader that is not asking
   * about a particular gate.
   */
  elsewhere: boolean;
}

/**
 * Whether a verdict bears on the gate the row was read through. A **fail**
 * bears on every gate the criterion governs; a **pass** only on the gate it
 * was reached for, so evidence gathered elsewhere never clears a gate nobody
 * checked. `elsewhere` is false for every reader not asking about a gate.
 */
const bearsHere = (v: Verdict): boolean => !v.elsewhere || v.outcome === "fail";

/** The four states a prespecified condition can be in. */
export type CheckState = "passed" | "failed" | "never-run" | "no-standing-verdict";

/** Retracted: it cited findings, and every one has since been invalidated. */
const retracted = (v: Verdict): boolean => v.cited > 0 && v.standing === 0;

/**
 * One subject's state, over whichever verdicts the caller chose.
 */
function stateOf(group: Verdict[]): CheckState {
  const standing = group.filter((v) => !retracted(v));
  if (standing.length === 0) return group.length > 0 ? "no-standing-verdict" : "never-run";
  return standing.some((v) => v.outcome === "fail") ? "failed" : "passed";
}

/**
 * A criterion's verdicts, grouped by the finding each judged.
 */
function bySubject(found: Map<string, Verdict>): Map<string, Verdict[]> {
  const groups = new Map<string, Verdict[]>();
  for (const v of found.values()) {
    if (!bearsHere(v)) continue;
    const key = v.about ?? "";
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  return groups.size > 0 ? groups : new Map([["", []]]);
}

/**
 * A criterion's state across every subject it was judged for.
 */
export function checkStateOver(verdicts: Leaf<Verdict>): Derived<CheckState> {
  return {
    name: "checkState",
    grain: byCriterion,
    needs: [verdicts],
    from: (needs) => {
      const states = [...bySubject(needs[verdicts.name] as Map<string, Verdict>).values()].map(
        stateOf,
      );
      if (states.includes("failed")) return "failed";
      if (states.includes("no-standing-verdict")) return "no-standing-verdict";
      if (states.includes("never-run")) return "never-run";
      return "passed";
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

/**
 * Every evaluation of a criterion, each marked with whether it was reached for
 * a gate other than the one the row came through. The filtering is `bearsHere`
 * in TypeScript rather than a `WHERE` in Cypher: the predicate is
 * outcome-dependent, and AGE's null handling across two `OPTIONAL MATCH`es is
 * where that goes silently wrong.
 */
export const verdictBearingOnGate = verdictsWhere(
  "verdictBearingOnGate",
  `OPTIONAL MATCH (crit)-[:EVALUATED_AS]->(ev:CriterionEvaluation)
           OPTIONAL MATCH (ev)-[:TRIGGERS]->(trig:Gate)`,
  { trig: optional(vertexProps<Node>()), g: vertexProps<Node>() },
);

/** How a check bears on a finding: every verdict counts. */
export const checkState = checkStateOver(anyVerdict);

/** A finding's prespecified conditions, itemised. */
export const checkStatus = checkStatusOver(anyVerdict);

/** A gate's conditions, itemised, over the verdicts that bear on that gate. */
export const checkStatusForGate = checkStatusOver(verdictBearingOnGate);

/** Every evaluation of a criterion, whatever gate it was run for. */
export const criterionEvaluations = evaluationsOver(anyVerdict);

/**
 * One criterion's state and its evaluations, from one query.
 */
export const criterionDetail: Derived<{
  state: CheckState;
  proposition: string;
  evaluations: EvaluationRecord[];
}> = {
  name: "criterionDetail",
  grain: byCriterion,
  needs: [checkState, criterionProps, criterionEvaluations],
  from: (needs) => ({
    // **`checkState`, not `checkStatus`.** The second is one entry per subject a rule was
    // judged against, and `why <criterion>` asks about the criterion as a whole -- which is the
    // worst of those, the fold `checkState` already is.
    state: needs[checkState.name] as CheckState,
    proposition: (needs.criterionProps as CriterionNode).proposition,
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
    ...(v.about ? { about: v.about } : {}),
    ...(retracted(v) ? { withdrawn: true as const } : {}),
  }));
}

/**
 * Every evaluation of one criterion, in full — the detail a gate's page no longer carries.
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
 */
export function checkStatusOver(verdicts: Leaf<Verdict>): Derived<CheckStatus[]> {
  return {
    name: "checkStatus",
    grain: byCriterion,
    needs: [verdicts, criterionProps],
    from: (needs) => {
      const found = needs[verdicts.name] as Map<string, Verdict>;
      const criterion = needs.criterionProps as CriterionNode;
      const ordered = [...found]
        .map(([evaluation, v]) => ({ evaluation, ...v }))
        .filter(bearsHere)
        .sort((a, b) => a.at.localeCompare(b.at) || a.evaluation.localeCompare(b.evaluation));
      const records = recordsOf(ordered, criterion.natural_id);

      // **One check per subject, not per criterion.** A rule judged against
      // four controls is four conditions on a gate: three passing and one
      // never re-checked is `incomplete`, and folding them into one line said
      // `passed` (#293). Grouped here rather than at a coarser grain because
      // every verdict for the criterion is already in hand.
      const groups = new Map<string, typeof ordered>();
      for (const v of ordered) {
        const key = v.about ?? "";
        groups.set(key, [...(groups.get(key) ?? []), v]);
      }
      if (groups.size === 0) groups.set("", []);

      return [...groups].map(([subject, group]) => {
        const standing = group.filter((v) => !retracted(v));
        const decisive = standing.find((v) => v.outcome === "fail") ?? standing[0];
        const decided = decisive && records.find((r) => r.evaluation === decisive.evaluation);
        return {
          criterion: ref("criterion", criterion.natural_id),
          proposition: criterion.proposition,
          state: stateOf(group),
          ...(subject ? { about: ref("claim", subject) } : {}),
          // **The verdict's sentence is not carried here** -- see
          // `DecidingEvaluation`. A gate governing many criteria is asked what
          // state everything is in, and the sentences are the whole of its size.
          ...(decided
            ? {
                decidedBy: {
                  evaluation: decided.evaluation,
                  outcome: decided.outcome,
                  at: decided.at,
                  ...(decided.about ? { about: decided.about } : {}),
                },
              }
            : {}),
        } as CheckStatus;
      });
    },
  };
}

/**
 * Whether the answer stood as promoted **at a moment**, and whether it had been resolved by
 * then.
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
 * The conditions **in force** on a gate, with the amendment that retired each one bound beside
 * it.
 */
export function gateConditionsAnchor(scope: "one" | "every"): string {
  const gate = scope === "one" ? "(g:Gate {natural_id: $id})" : "(g:Gate)";
  return `MATCH (crit:Criterion)-[:GOVERNS]->${gate}
       OPTIONAL MATCH (amended:Decision)-[:CHANGES]->(crit)`;
}

/** The rows of {@link gateConditionsAnchor} whose condition nothing has amended away. */
export function inForce(rows: Row[]): Row[] {
  return rows.filter((r) => r.amended === null);
}

/**
 * The anchor for "the checks this claim answers to", **for one bearing**.
 */
export function checksAnchor(bearing: "SUPPORTS" | "CHALLENGES"): string {
  return `MATCH (cl:Claim {natural_id: $claim})<-[:${bearing}]-(e:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       MATCH (e)-[:RECORDED_IN]->(out:Artefact)
       MATCH (crit:Criterion)-[:QUALIFIES]->(u)`;
}
