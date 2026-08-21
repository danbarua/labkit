/**
 * The LabKit domain model as data and types (docs/project-journal/001_git_init.md,
 * revised per docs/project-journal/003_review_domain_tenancy.md and
 * docs/project-journal/004_tenancy_implementation_plan.md).
 *
 * Deliberately free of any database import: this is what LabKit's entities
 * *are*, not how they're stored. `src/db/graph.ts` reads it to type and
 * validate writes; `src/db/provisioning.ts` reads it to decide what to
 * create in each tenant's graph. Neither owns it.
 */

export const NODE_LABELS = [
  "Question",
  "LineOfEnquiry",
  "EvidenceUnit",
  "Evidence",
  "Claim",
  "Decision",
  "Criterion",
  "CriterionEvaluation",
  "Gate",
  "Review",
  "Artefact",
  "Computation",
  "Task",
] as const;
export type NodeLabel = (typeof NODE_LABELS)[number];

export const EDGE_LABELS = [
  "MOTIVATES", // Question -> LineOfEnquiry
  "REQUIRES", // LineOfEnquiry -> Evidence
  "ADDRESSES", // EvidenceUnit -> LineOfEnquiry
  "SUPPORTS", // Evidence -> Claim
  "CHALLENGES", // Evidence -> Claim
  "REVERIFIES", // Evidence -> Evidence
  "PROMOTES", // Decision -> Claim
  "USES", // EvidenceUnit -> Computation
  "CONSUMES", // Computation -> Artefact (execution lineage; the inverse of PRODUCES)
  "PRODUCES", // EvidenceUnit/Computation/Task -> Evidence/Artefact/Computation
  "RECORDED_IN", // Evidence -> Artefact
  "GOVERNS", // Criterion -> Gate (which condition a gate enforces)
  "QUALIFIES", // Criterion -> EvidenceUnit (which standard a finding is held to)
  "EVALUATED_AS", // Criterion -> CriterionEvaluation
  "TRIGGERS", // CriterionEvaluation -> Gate
  "GATES", // Gate -> Task/Computation
  "CHANGES", // Decision -> Criterion
  "BASED_ON", // Decision -> Evidence | CriterionEvaluation -> Evidence
  "RESOLVES", // Decision -> Question
  "NARROWS", // Decision -> Question
  "DEFERS", // Decision -> Question
  "SUPERSEDES", // Decision -> Decision (an amendment is a decision with this edge)
  "EVALUATES", // Review -> Claim | Decision | Evidence | EvidenceUnit
  "IMPLEMENTS", // Task -> EvidenceUnit
] as const;
export type EdgeLabel = (typeof EDGE_LABELS)[number];

/**
 * Single authoritative source of truth for legal edge shapes (PJ-003 §8).
 * `createEdge` validates the resolved `(fromLabel, toLabel)` pair against
 * this table and throws before issuing any Cypher if the pair isn't listed.
 *
 * `GATES`'s source is `Gate`, not `Criterion` (PJ-004 decision #9): the
 * shipped shape had `CriterionEvaluation -[:TRIGGERS]-> Gate` and
 * *separately* `Criterion -[:GATES]-> Task/Computation`, meaning nothing
 * ever flowed out of `Gate` — `Criterion` did the gating, contradicting
 * PJ-001's own definition of `Gate` as "the policy consequence attached to
 * an evaluation." The chain now actually chains:
 * `Criterion -[:EVALUATED_AS]-> CriterionEvaluation -[:TRIGGERS]-> Gate -[:GATES]-> Task/Computation`.
 */
export const EDGE_SCHEMA: Record<EdgeLabel, ReadonlyArray<readonly [NodeLabel, NodeLabel]>> = {
  /**
   * "Gave rise to." A question gives rise to a line of enquiry; a decision
   * gives rise to a question.
   *
   * The second pair is earned by S-1. Sharpening a vague hunch into a testable
   * question records a `Decision` that `NARROWS` the original — but nothing
   * attached the *product* of that act to the act, so a question created by
   * sharpening had no path back to it. Demonstrated rather than argued: with
   * one hunch sharpened twice and a result landing in between,
   * `originOf(secondQuestion)` reported the knowledge that existed before the
   * *first* sharpening, back-dating an act onto evidence that had not yet
   * arrived. That is a confidently wrong answer, not an empty one — the reply
   * was populated and plausible, and belonged to a different event.
   *
   * The `Decision -> Claim` pair is S-12, and it is the third instance of the
   * same shape (PJ-008 row AB): `CHANGES` records which interpretation was
   * withdrawn, and nothing recorded which one replaced it. S-7 got away
   * without such an edge because a gate contains its design conditions and the
   * current one is derivable as the unchanged member. An interpretation has no
   * container, so from a narrowed claim there was no route back to the act
   * that narrowed it — the prediction that S-7's remedy would transfer was
   * wrong. Note what this makes redundant: with `CHANGES` and `MOTIVATES` both
   * present the revision chain walks claim-to-claim through its decisions, so
   * no `SUPERSEDES` edge is written between them. An edge needs a reader.
   *
   * A direct `Question -> Question` lineage edge was the other candidate and
   * was not chosen: it answers "where did this come from" but not "what did we
   * know when we asked it", because the reason and the frozen evidence set
   * live on the decision. The two models are not equally capable here, so
   * PJ-011's record-both-pick-neither rule does not apply — see PJ-008 row D.
   */
  MOTIVATES: [["Question", "LineOfEnquiry"], ["Decision", "Question"], ["Decision", "Claim"]],
  REQUIRES: [["LineOfEnquiry", "Evidence"]],
  ADDRESSES: [["EvidenceUnit", "LineOfEnquiry"]],
  SUPPORTS: [["Evidence", "Claim"]],
  CHALLENGES: [["Evidence", "Claim"]],
  USES: [["EvidenceUnit", "Computation"]],
  /**
   * Execution lineage: what a computation read. Earned by S-11
   * (docs/project-journal/008_user_story_mining.md), which asks what an
   * analysis rests on and could previously only answer it by going out to the
   * enquiry and back — `ADDRESSES` to a LineOfEnquiry, then `REQUIRES` to
   * whatever observations that enquiry needs. That answers "what observations
   * is this enquiry associated with", not "what did this computation
   * consume", and the two stop being the same answer the moment one enquiry
   * carries two analyses over different inputs. It produced a real false
   * inference in the service layer's `whySupported()`, not a hypothetical one.
   *
   * Paired with `PRODUCES: Computation -> Artefact`, execution lineage reads
   * directly in both directions, and it is the seam an external run tracker
   * (W&B/MLflow knowing that run R42 read artefact D3) would eventually
   * attach to, while LabKit keeps the scientific identity and the reason.
   */
  CONSUMES: [["Computation", "Artefact"]],
  PRODUCES: [
    ["EvidenceUnit", "Evidence"],
    ["EvidenceUnit", "Artefact"],
    ["Computation", "Artefact"],
    ["Task", "Computation"],
    ["Task", "Artefact"],
  ],
  RECORDED_IN: [["Evidence", "Artefact"]],
  /**
   * Which condition a gate enforces, independent of whether it has ever been
   * evaluated. Earned by S-17.
   *
   * PJ-004 #9 made the control chain flow
   * `Criterion -EVALUATED_AS-> CriterionEvaluation -TRIGGERS-> Gate -GATES-> work`,
   * which correctly means nothing flows out of a gate that no evaluation
   * triggered. But it also made the criterion reachable from the gate ONLY
   * through an evaluation — so for a gate nobody has evaluated, which is
   * precisely S-17's subject, the governing criterion is unreachable and the
   * gate is an orphan that gates work while recording no condition at all.
   *
   * Demonstrated rather than argued: `criterionGoverning()` returned null for
   * a declared-but-unevaluated gate, so the reviewer's actual question —
   * "show me evidence this fails when the artefact is wrong" — could not even
   * be aimed at a criterion. Direction matches the rest of the chain so the
   * whole control path reads left to right.
   */
  GOVERNS: [["Criterion", "Gate"]],
  /**
   * The standard a finding is held to, as distinct from the work a condition
   * gates. Earned by S-3b (PJ-016), which is S-3's conversation with the
   * downstream work removed.
   *
   * Demonstrated rather than argued: with prespecified robustness checks
   * failing against the very analysis they were agreed about, `whySupported()`
   * reported `supported: true` — "some evidence exists" rather than "the
   * evidence holds up by the standard set for it". Criteria reached only
   * `Gate`, so there was no path from a claim to the conditions it was
   * supposed to satisfy, and the answer was confidently wrong rather than
   * empty. Ledger row V.
   *
   * The endpoint is the `EvidenceUnit` rather than the `Claim` because a
   * prespecified check is agreed about a *run* — "the checks we agreed before
   * running it" — and applies to what that run concluded. One analysis whose
   * conclusions are held to different standards would discriminate the two and
   * is the scenario that would move this; nothing in the corpus does yet.
   *
   * Written when the analysis is recorded, not when a check is evaluated: a
   * check that was never run must still count against the finding, and an edge
   * minted by evaluation could not express one.
   */
  QUALIFIES: [["Criterion", "EvidenceUnit"]],
  EVALUATED_AS: [["Criterion", "CriterionEvaluation"]],
  TRIGGERS: [["CriterionEvaluation", "Gate"]],
  GATES: [["Gate", "Task"], ["Gate", "Computation"]],
  /**
   * "Re-checked that finding, without reproducing the run behind it." Earned
   * by S-10.
   *
   * Demonstrated rather than argued: the only way to record a re-run was as
   * another analysis concluding the same proposition, which S-5's scope rules
   * then resolve to the same claim — so `whySupported()` reported the
   * proposition resting on *two independent findings*. It rests on one, checked
   * twice, and the second check specified initial conditions the first never
   * recorded. A historical claim reporting itself independently corroborated by
   * an execution nobody reproduced is confidently wrong, not merely thin.
   *
   * What a shared claim cannot carry is **direction** and **caveat**: which run
   * re-checked which, and that their executions are not the same. Two genuinely
   * independent analyses in one enquiry are indistinguishable from a
   * re-verification without it, and those are different scientific situations.
   *
   * `Evidence -> Evidence` rather than `EvidenceUnit -> EvidenceUnit` because a
   * re-run checks a *finding*: one analysis may re-verify one of several
   * conclusions and say nothing about the others. The unit-level relationship
   * is the one to reach for if a scenario ever re-runs a whole analysis as an
   * indivisible thing; nothing has.
   */
  REVERIFIES: [["Evidence", "Evidence"]],
  /**
   * The act that confers confirmatory standing on a finding. Earned by S-18.
   *
   * The prediction for that build was that `CHANGES` would carry it — a
   * decision acting on a claim, which is what `CHANGES` already means. It was
   * refuted by demonstration: `withdrawalOf()` reads *any* `Decision -CHANGES->
   * Claim` as a retraction (S-12, where that is exactly right), so promoting a
   * finding made `whySupported()` report it as withdrawn and no longer
   * supported. Promotion would have retracted the thing it promoted.
   *
   * That is the same lesson `GATES` taught in row V, from the other side: one
   * edge with two readings is the failure shape behind every expensive mistake
   * in this project. Two acts that both "change a claim" are not the same
   * relationship when one means *stop asserting this* and the other means
   * *assert it more strongly*.
   *
   * Direction and endpoint match `CHANGES`: the decision is the act, the claim
   * is what it acts on. Why it was promoted lives on the decision's `reason`,
   * so a reader can ask what justified the promotion and not merely that one
   * happened.
   */
  PROMOTES: [["Decision", "Claim"]],
  /**
   * What a decision withdrew or replaced. A design condition (S-7), an
   * interpretation (S-12).
   *
   * The `Claim` pair is earned by S-12. With only a `Review` recording that an
   * interpretation had been criticised, `whySupported()` went on reporting the
   * retracted sentence as supported — the record confidently asserting
   * something the reviewer had just withdrawn, which is the worst thing a
   * provenance system can do. A review is not a retraction: reviews also
   * confirm, and telling the two apart from a free-text verdict would be
   * text-matching.
   */
  CHANGES: [["Decision", "Criterion"], ["Decision", "Claim"]],
  BASED_ON: [["Decision", "Evidence"], ["CriterionEvaluation", "Evidence"]],
  RESOLVES: [["Decision", "Question"]],
  NARROWS: [["Decision", "Question"]],
  DEFERS: [["Decision", "Question"]],
  SUPERSEDES: [["Decision", "Decision"]],
  /**
   * `Review -> EvidenceUnit` is the second relationship S-11 earned: a review
   * of an *analysis* previously had nowhere to point, so its subject survived
   * only in the ephemeral event stream and "why was this replaced?" was
   * unanswerable from the graph.
   *
   * The endpoint is the EvidenceUnit rather than the Computation
   * deliberately. What the S-11 reviewer criticized — "your bootstrap is
   * centred on the observed effect; it isn't a null test" — is the
   * inferential procedure, not the execution: nothing ran incorrectly. The
   * EvidenceUnit is the bounded inferential activity; the Computation is how
   * it was executed. `Review -> Computation` may well be earned later by a
   * scenario reviewing an execution, but S-11 did not earn it.
   */
  EVALUATES: [["Review", "Claim"], ["Review", "Decision"], ["Review", "Evidence"], ["Review", "EvidenceUnit"]],
  IMPLEMENTS: [["Task", "EvidenceUnit"]],
};

export type EvidenceUnitRole =
  | "experiment"
  | "feasibility"
  | "verification"
  | "robustness"
  | "ablation"
  | "mechanistic"
  | "analysis"
  | "infrastructure"
  | "confirmatory";

// `project_id` removed from every *Props interface below (PJ-003 §4): the
// graph itself is the tenant partition now, not a repeated node property.

export interface QuestionProps {
  name: string;
}

export interface LineOfEnquiryProps {
  name: string;
}

export interface EvidenceUnitProps {
  role: EvidenceUnitRole;
}

export interface EvidenceProps {
  statement: string;
}

export interface ClaimProps {
  name: string;
  kind?: "exploratory" | "confirmatory";
}

/**
 * `is_open`/`closed_at` are kept as explicit operational state (PJ-004
 * decision #2) — narrowly scoped to "is this decision record still active
 * in the control process?", never "is the proposition scientifically
 * valid?" (that flows from evidence/supersession/review, never from these
 * fields). `evidence` (a string shadow of `Decision -[:BASED_ON]-> Evidence`)
 * is removed (PJ-003 §10).
 */
export interface DecisionProps {
  reason: string;
  invalidation_check: string;
  /**
   * When the act was recorded, from the injected clock. Earned by row Z.
   *
   * **Record time, not belief time**, and the distinction is load-bearing rather
   * than pedantic. This says when the decision entered the record; it does not
   * say when the researcher came to hold it, and nothing here can. A designer in
   * the consumer exercise required both readings separately — *"recorded by 3
   * March"* against *"asserted as held on 3 March but written down later"* — and
   * `023` demoted that to a candidate extension because no source obligation
   * requires it. Naming the reading here is what stops the next reader assuming
   * the other one: a single timestamp otherwise looks like a fix while silently
   * choosing a side.
   *
   * Required, not optional. A decision whose instant is unknown cannot be
   * ordered, and an ordering with holes is the thing row Z already had —
   * `CriterionEvaluation.evaluated_at` bounded some closures and left the rest
   * unplaceable, which is why deriving the order from evidence failed.
   */
  decided_at: string;
  is_open?: boolean;
  closed_at?: string;
}

export interface CriterionProps {
  proposition: string;
}

// `evidence_ref` removed (PJ-004 decision #5) — represented in-graph now as
// `CriterionEvaluation -[:BASED_ON]-> Evidence` instead of a string shadow.
export interface CriterionEvaluationProps {
  value: string;
  outcome: "pass" | "fail";
  evaluated_at: string;
}

export interface GateProps {
  consequence: string;
}

export interface ReviewProps {
  verdict: string;
}

// verbatim property list from the journal's Artefact section
export interface ArtefactProps {
  kind: string;
  logical_name: string;
  content_hash?: string;
  uri?: string;
  external_ref?: string;
  invalidated?: boolean;
}

// verbatim property list from the journal's Computation section
export interface ComputationProps {
  kind: string;
  status: string;
  backend?: string;
  external_run_id?: string;
  started_at?: string;
  finished_at?: string;
  code_revision?: string;
  environment_ref?: string;
}

export interface TaskProps {
  objective: string;
  inputs: string;
  outputs: string;
  acceptance: string;
  is_open?: boolean;
}

/**
 * Binds each node label to the property shape it accepts. This is what makes
 * `createNode("Question", …)` reject `Computation` props at compile time —
 * before this map existed, `createNode` took `T extends Record<string, unknown>`
 * and the *Props interfaces above were documentation only.
 */
export interface NodePropsByLabel {
  Question: QuestionProps;
  LineOfEnquiry: LineOfEnquiryProps;
  EvidenceUnit: EvidenceUnitProps;
  Evidence: EvidenceProps;
  Claim: ClaimProps;
  Decision: DecisionProps;
  Criterion: CriterionProps;
  CriterionEvaluation: CriterionEvaluationProps;
  Gate: GateProps;
  Review: ReviewProps;
  Artefact: ArtefactProps;
  Computation: ComputationProps;
  Task: TaskProps;
}

/** Everything the persistence layer needs to know about one node label, in one place. */
interface NodeType<L extends NodeLabel> {
  /**
   * Short display prefix for natural IDs (e.g. `Computation` -> `"COMP_123"`,
   * underscore per PJ-004 decision #4). Scoped globally per entity-type, not
   * per-tenant. Must stay in sync with the per-label `CREATE SEQUENCE`
   * statements in drizzle/0002_natural_ids.sql — nothing here enforces that,
   * it's a cross-file obligation to a migration.
   */
  readonly prefix: string;

  /**
   * Creation-time enforcement of per-label property invariants (PJ-004
   * decision #8) — `TenantGraph.closeDecision()` alone can't be the whole
   * story, since a generic create would otherwise happily accept a
   * pre-contradicted Decision. Returns the props to actually write, so a
   * validator can normalize (default `is_open`) as well as reject.
   */
  readonly validate?: (props: NodePropsByLabel[L]) => NodePropsByLabel[L];
}

/**
 * One entry per node label, replacing what used to be four parallel records
 * (`NODE_LABELS` / `NATURAL_ID_PREFIX` / `NODE_VIEW_COLUMNS` /
 * `NODE_VALIDATORS`) indexed by the same key and kept aligned by comment.
 */
export const NODE_TYPES: { readonly [L in NodeLabel]: NodeType<L> } = {
  Question: { prefix: "Q" },
  LineOfEnquiry: { prefix: "LOE" },
  EvidenceUnit: { prefix: "EU" },
  Evidence: { prefix: "EV" },
  Claim: { prefix: "CLM" },
  Decision: {
    prefix: "DEC",
    // Strict biconditional, tightened from PJ-004 decision #2's original
    // "may have closed_at" now that there's no legacy data to accommodate.
    validate: (props) => {
      const is_open = props.is_open ?? true;
      const closed_at = props.closed_at;
      if (is_open && closed_at) throw new Error("Decision.is_open=true cannot have closed_at set");
      if (!is_open && !closed_at) throw new Error("Decision.is_open=false requires closed_at");
      return { ...props, is_open };
    },
  },
  Criterion: { prefix: "CRIT" },
  CriterionEvaluation: { prefix: "CEVAL" },
  Gate: { prefix: "GATE" },
  Review: { prefix: "REV" },
  Artefact: {
    prefix: "ART",
  },
  Computation: {
    prefix: "COMP",
  },
  Task: { prefix: "TASK" },
};

/** Reverse of `NODE_TYPES[label].prefix` — resolves a node's label from its natural id's prefix, e.g. "EU_17" -> "EvidenceUnit". */
const LABEL_BY_PREFIX: Record<string, NodeLabel> = Object.fromEntries(
  NODE_LABELS.map((label) => [NODE_TYPES[label].prefix, label]),
) as Record<string, NodeLabel>;

export function labelForNaturalId(naturalId: string): NodeLabel {
  const sep = naturalId.indexOf("_");
  const prefix = sep === -1 ? naturalId : naturalId.slice(0, sep);
  const label = LABEL_BY_PREFIX[prefix];
  if (!label) throw new Error(`unrecognized natural id prefix in "${naturalId}"`);
  return label;
}

/**
 * A node as returned to callers outside the persistence layer: AGE's
 * internal graphid (`AgtypeVertex.id`, a large opaque number/bigint — see
 * src/db/agtype.ts) is stripped and replaced with the short, incrementing
 * `natural_id` that's safe to show a user or an AI-agent caller.
 */
export interface PublicNode<L extends NodeLabel> {
  natural_id: string;
  label: L;
  properties: NodePropsByLabel[L];
}
