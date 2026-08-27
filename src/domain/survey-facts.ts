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
import type { Derived, Leaf, Row, SomeFact } from "./facts";

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
 * How much of an evaluation's basis still stands.
 *
 * A verdict is **retracted** when everything it cited has been invalidated —
 * which is not the same as failing, and the difference is `no-standing-verdict`
 * (S-3c). A verdict citing nothing cannot be retracted at all, which is what
 * stops S-8's asserted-versus-measured distinction becoming a loophole.
 */
export const basisStanding: Leaf<{ cited: number; standing: number }> = {
  name: "basisStanding",
  grain: byEvaluation,
  clause: `OPTIONAL MATCH (crit)-[:EVALUATED_AS]->(ev:CriterionEvaluation)
           OPTIONAL MATCH (ev)-[:BASED_ON]->(basis:Evidence)
           OPTIONAL MATCH (basis)-[:RECORDED_IN]->(basisout:Artefact)`,
  yields: {
    ev: optional(vertexProps<EvaluationNode>()),
    basis: optional(vertexProps<Node>()),
    basisout: optional(vertexProps<ArtefactNode>()),
  },
  empty: () => ({ cited: 0, standing: 0 }),
  fold: (counts, row) =>
    row.basis === null
      ? counts
      : {
          cited: counts.cited + 1,
          standing: counts.standing + ((row.basisout as ArtefactNode | null)?.invalidated ? 0 : 1),
        },
};

/**
 * A criterion's state, and the precedence three scenarios earned.
 *
 * A failure **sticks** among verdicts that still stand, so re-running until
 * green is not evidence (S-3). A wholly-withdrawn verdict is a retraction
 * rather than a failure (S-3c). And `never-run` is a first-class value, not the
 * absence of one, because a check nobody performed must be distinguishable from
 * one that failed (S-17).
 */
export const checkState: Derived<"passed" | "failed" | "never-run" | "no-standing-verdict"> = {
  name: "checkState",
  grain: byCriterion,
  needs: [basisStanding],
  from: (needs) => {
    const perEvaluation = needs.basisStanding as Map<string, { cited: number; standing: number }>;
    const standing = [...perEvaluation].filter(([, b]) => !(b.cited > 0 && b.standing === 0));
    if (standing.length === 0) return perEvaluation.size > 0 ? "no-standing-verdict" : "never-run";
    return standing.some(([evaluation]) => outcomes.get(evaluation) === "fail")
      ? "failed"
      : "passed";
  },
};

/**
 * Outcomes, by evaluation handle.
 *
 * A concession, and a small one: `checkState` needs each verdict's `outcome`,
 * which lives on the evaluation node rather than on anything its own grain
 * folds. Filled by {@link readOutcomes} before evaluation. A fuller machinery
 * would let a fact carry a scalar off its own grain's node; this does not, and
 * naming the gap is better than hiding it in a wider fold.
 */
const outcomes = new Map<string, "pass" | "fail">();

/** Records each evaluation's verdict so {@link checkState} can read it. */
export function readOutcomes(rows: readonly Row[]): void {
  outcomes.clear();
  for (const row of rows) {
    const evaluation = row.ev as EvaluationNode | null;
    if (evaluation) outcomes.set(evaluation.natural_id, evaluation.outcome);
  }
}

/** Every prespecified check on the answering claim passed. Vacuously true when there are none. */
export const checksMet: Derived<boolean> = {
  name: "checksMet",
  grain: byClaim,
  needs: [checksOf, checkState],
  from: (needs) => {
    const required = needs.checksOf as Set<string>;
    const states = needs.checkState as Map<string, string>;
    return [...required].every((criterion) => states.get(criterion) === "passed");
  },
};

export const facts: Record<string, SomeFact> = {
  answeringClaim,
  checksOf,
  basisStanding,
  checkState,
  checksMet,
};
