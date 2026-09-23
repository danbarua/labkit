/**
 * A criterion's checks: its evaluations, read once with everything that decides whether each
 * still speaks, and the state and itemised status computed from them.
 */

import { optional, vertexProps, type ColumnDecoder } from "@labkit/core-db/cypher";
import type { TenantGraph } from "@labkit/core-db/graph";
import { ref } from "../report";
import type { CheckStatus, ClaimRef, EvaluationRecord, EvidenceRef } from "../report";

interface Node {
  natural_id: string;
}
interface EvaluationNode extends Node {
  outcome: "pass" | "fail";
  evaluated_at: string;
  value: string;
}
interface BasisNode extends Node {
  statement: string;
}

/** The four states a prespecified condition can be in. */
export type CheckState = "passed" | "failed" | "never-run" | "no-standing-verdict";

/** One evaluation, with how much of its basis still stands. */
export interface Verdict {
  evaluation: string;
  outcome: "pass" | "fail";
  at: string;
  value: string;
  /** The findings it was reached against, deduplicated by handle. */
  basis: { evidence: EvidenceRef; states: string }[];
  /** Findings cited, and how many still stand. */
  cited: number;
  standing: number;
  /** The finding it judged, as it now stands: the successor when the finding was superseded. */
  about?: ClaimRef;
  /** The finding it judged has since been superseded; `about` names the successor. */
  superseded: boolean;
  /**
   * Reached for a gate other than the one this criterion was read through. False when the act
   * named no gate, and false for every reader not asking about a gate.
   */
  elsewhere: boolean;
}

/** One criterion as read: its text, its verdicts, and the first row's other columns. */
export interface CriterionChecks<Extra = Record<string, never>> {
  criterion: string;
  proposition: string;
  verdicts: Verdict[];
  extra: Extra;
}

/**
 * Every evaluation of `crit`, with what decides whether it still speaks. `crit` must be bound
 * by the anchor. With `gate` bound too, each verdict says whether it was reached for another
 * gate.
 */
const VERDICT_CLAUSES = `OPTIONAL MATCH (crit)-[:EVALUATED_AS]->(ev:CriterionEvaluation)
       OPTIONAL MATCH (ev)-[:TRIGGERS]->(trig:Gate)
       OPTIONAL MATCH (ev)-[:ABOUT]->(judged:Claim)
       OPTIONAL MATCH (judged)<-[:SUPERSEDES]-(:Decision)-[:MOTIVATES]->(instead:Claim)
       OPTIONAL MATCH (ev)-[:BASED_ON]->(basis:Evidence)
       OPTIONAL MATCH (basis)-[:SUPPORTS]->(supported:Claim)<-[:SUPERSEDES]-(:Decision)
       OPTIONAL MATCH (basis)-[:CHALLENGES]->(challenged:Claim)<-[:SUPERSEDES]-(:Decision)`;

const VERDICT_COLUMNS = {
  crit: vertexProps<{ natural_id: string; proposition: string }>(),
  ev: optional(vertexProps<EvaluationNode>()),
  trig: optional(vertexProps<Node>()),
  judged: optional(vertexProps<Node>()),
  instead: optional(vertexProps<Node>()),
  basis: optional(vertexProps<BasisNode>()),
  supported: optional(vertexProps<Node>()),
  challenged: optional(vertexProps<Node>()),
};

/**
 * Reads the criteria an anchor binds as `crit`, each with every evaluation of it. One row per
 * (criterion, evaluation, basis finding); folded here into one Verdict per evaluation.
 *
 * `extra` names further columns the anchor binds, decoded per row; the first row's values are
 * kept on the criterion. `key` chooses what one entry is: by default the criterion, so a
 * criterion governing two gates is one entry; a gate list keys on both.
 */
export async function criteriaChecks<Extra extends Record<string, unknown>>(
  graph: TenantGraph,
  anchor: string,
  params: Record<string, unknown>,
  options: {
    extra?: { [K in keyof Extra]: ColumnDecoder<Extra[K]> };
    key?: (row: { crit: Node } & Extra) => string;
    /** The column the anchor binds the gate to, when verdicts are scoped to a gate. */
    gate?: keyof Extra & string;
  } = {},
): Promise<Map<string, CriterionChecks<Extra>>> {
  const extra = options.extra ?? ({} as { [K in keyof Extra]: ColumnDecoder<Extra[K]> });
  const decoders = { ...VERDICT_COLUMNS, ...extra };
  const cypher = `${anchor}\n${VERDICT_CLAUSES}\nRETURN ${Object.keys(decoders).join(", ")}`;
  const rows = (await graph.query(cypher, decoders, params)) as unknown as Array<
    {
      crit: { natural_id: string; proposition: string };
      ev: EvaluationNode | null;
      trig: Node | null;
      judged: Node | null;
      instead: Node | null;
      basis: BasisNode | null;
      supported: Node | null;
      challenged: Node | null;
    } & Extra
  >;

  const out = new Map<string, CriterionChecks<Extra>>();
  const byEvaluation = new Map<string, Verdict>();
  for (const row of rows) {
    const key = options.key ? options.key(row) : row.crit.natural_id;
    let entry = out.get(key);
    if (!entry) {
      const rest = {} as Extra;
      for (const k of Object.keys(extra) as (keyof Extra)[]) rest[k] = row[k];
      entry = {
        criterion: row.crit.natural_id,
        proposition: row.crit.proposition,
        verdicts: [],
        extra: rest,
      };
      out.set(key, entry);
    }
    if (!row.ev) continue;

    const verdictKey = `${key}|${row.ev.natural_id}`;
    let verdict = byEvaluation.get(verdictKey);
    if (!verdict) {
      const readThrough = options.gate ? (row[options.gate] as Node | null) : null;
      const judged = row.instead ?? row.judged;
      // Static guarantees stop at the store: an evaluation carries one of two outcomes, and one
      // that does not is refused rather than read as either.
      if (row.ev.outcome !== "pass" && row.ev.outcome !== "fail")
        throw new Error(`evaluation ${row.ev.natural_id} has no stored outcome`);
      verdict = {
        evaluation: row.ev.natural_id,
        outcome: row.ev.outcome,
        at: row.ev.evaluated_at,
        value: row.ev.value,
        basis: [],
        cited: 0,
        standing: 0,
        ...(judged ? { about: ref("claim", judged.natural_id) } : {}),
        superseded: row.instead !== null,
        elsewhere:
          row.trig !== null &&
          readThrough !== null &&
          row.trig.natural_id !== readThrough.natural_id,
      };
      byEvaluation.set(verdictKey, verdict);
      entry.verdicts.push(verdict);
    }
    // One row per basis finding. By handle: two findings can state the same sentence.
    if (row.basis && !verdict.basis.some((b) => b.evidence === row.basis!.natural_id)) {
      verdict.basis.push({
        evidence: ref("evidence", row.basis.natural_id),
        states: row.basis.statement,
      });
      verdict.cited += 1;
      // Either bearing: a finding superseded on the challenging side counts as one superseded
      // on the supporting side.
      if (!row.supported && !row.challenged) verdict.standing += 1;
    }
  }
  return out;
}

/** Retracted: it cited findings, and every one has since been superseded. */
const retracted = (v: Verdict): boolean => v.cited > 0 && v.standing === 0;

/** A verdict that still speaks for its subject. */
const speaks = (v: Verdict): boolean => !retracted(v) && !v.superseded;

/**
 * Whether a verdict bears on the gate the criterion was read through. A fail bears on every
 * gate the criterion governs; a pass only on the gate it was reached for, so evidence gathered
 * elsewhere never clears a gate nobody checked.
 */
const bearsHere = (v: Verdict): boolean => !v.elsewhere || v.outcome === "fail";

/** Oldest first, ties broken by identity. */
const byTime = (a: Verdict, b: Verdict): number =>
  a.at.localeCompare(b.at) || a.evaluation.localeCompare(b.evaluation);

/**
 * One subject's state over the verdicts about it. Any fail holds, so re-running a check until
 * it passes does not clear it. A subject whose only verdicts were about a finding since
 * superseded has not been checked; one whose verdicts were all retracted has been, and nothing
 * stands.
 */
function stateOf(group: Verdict[]): CheckState {
  const own = group.filter((v) => !v.superseded);
  const standing = own.filter(speaks);
  if (standing.length === 0) return own.some(retracted) ? "no-standing-verdict" : "never-run";
  return standing.some((v) => v.outcome === "fail") ? "failed" : "passed";
}

/** A criterion's verdicts grouped by the finding each judged, oldest first within a group. */
function bySubject(verdicts: readonly Verdict[]): Map<string, Verdict[]> {
  const groups = new Map<string, Verdict[]>();
  for (const v of [...verdicts].filter(bearsHere).sort(byTime)) {
    const key = v.about ?? "";
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  if (groups.size === 0) groups.set("", []);
  return groups;
}

/** A criterion's state across every subject it was judged for: the worst of them. */
export function checkStateOf(checks: CriterionChecks<Record<string, unknown>>): CheckState {
  const states = [...bySubject(checks.verdicts).values()].map(stateOf);
  if (states.includes("failed")) return "failed";
  if (states.includes("no-standing-verdict")) return "no-standing-verdict";
  if (states.includes("never-run")) return "never-run";
  return "passed";
}

function recordOf(v: Verdict, criterion: string): EvaluationRecord {
  return {
    evaluation: ref("evaluation", v.evaluation),
    criterion: ref("criterion", criterion),
    value: v.value,
    outcome: v.outcome,
    at: v.at,
    basis: v.basis,
    ...(v.about ? { about: v.about } : {}),
    ...(retracted(v) ? { withdrawn: true as const } : {}),
  };
}

/** Every evaluation of a criterion as a record, oldest first, whatever gate it was run for. */
export function evaluationsOf(
  checks: CriterionChecks<Record<string, unknown>>,
): EvaluationRecord[] {
  return [...checks.verdicts].sort(byTime).map((v) => recordOf(v, checks.criterion));
}

/**
 * A criterion itemised: one check per finding it was judged against. A rule judged against
 * four controls is four conditions, three passing and one never re-checked is incomplete.
 */
export function checkStatusOf(checks: CriterionChecks<Record<string, unknown>>): CheckStatus[] {
  return [...bySubject(checks.verdicts)].map(([subject, group]) => {
    const standing = group.filter(speaks);
    const decisive = standing.find((v) => v.outcome === "fail") ?? standing[0];
    return {
      criterion: ref("criterion", checks.criterion),
      proposition: checks.proposition,
      state: stateOf(group),
      ...(subject ? { about: ref("claim", subject) } : {}),
      // The verdict's sentence is not carried: a gate governing many criteria is asked what
      // state everything is in, and the sentences are the whole of its size.
      ...(decisive
        ? {
            decidedBy: {
              evaluation: ref("evaluation", decisive.evaluation),
              outcome: decisive.outcome,
              at: decisive.at,
              ...(decisive.about ? { about: decisive.about } : {}),
            },
          }
        : {}),
    } as CheckStatus;
  });
}

/** The conditions governing a gate, each bound with the amendment that retired it, if any. */
export function gateConditionsAnchor(scope: "one" | "every"): string {
  const gate = scope === "one" ? "(g:Gate {natural_id: $id})" : "(g:Gate)";
  return `MATCH (crit:Criterion)-[:GOVERNS]->${gate}
       OPTIONAL MATCH (amended:Decision)-[:SUPERSEDES]->(crit)`;
}

export const gateConditionColumns = {
  g: vertexProps<{ natural_id: string; consequence: string }>(),
  amended: optional(vertexProps<{ natural_id: string }>()),
};

/** The checks this claim answers to, for one bearing. */
export function checksAnchor(bearing: "SUPPORTS" | "CHALLENGES"): string {
  return `MATCH (cl:Claim {natural_id: $claim})<-[:${bearing}]-(e:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       MATCH (e)-[:RECORDED_IN]->(out:Artefact)
       MATCH (crit:Criterion)-[:QUALIFIES]->(u)`;
}
