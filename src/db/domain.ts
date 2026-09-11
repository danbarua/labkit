/**
 * The LabKit domain model as data and types.
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
  "Note",
] as const;
export type NodeLabel = (typeof NODE_LABELS)[number];

/**
 * Which node properties get a Postgres index, per label.
 */
export const INDEXED_PROPS: { readonly [L in NodeLabel]?: readonly string[] } = {
  Question: ["posed_at"],
  LineOfEnquiry: ["started_at"],
  Claim: ["name"],
  Decision: ["decided_at"],
  CriterionEvaluation: ["evaluated_at"],
  Artefact: ["logical_name"],
  // Written by nothing today, and indexed anyway — `check:prop-classes` found
  // them missing on its first run, which is the rule working. An index over a
  // property that is always absent costs almost nothing in Postgres, and it is
  // already there for the integration that fills them. Exceptions to
  // "every Timestamp is indexed" would need a reason; these have none.
  Computation: ["started_at", "finished_at"],
};

/**
 * Which scalar node properties `search()` scans, per label.
 */
export const SEARCHABLE_TEXT: { readonly [L in NodeLabel]?: readonly string[] } = {
  Question: ["name"],
  LineOfEnquiry: ["name"],
  Claim: ["name"],
  Artefact: ["logical_name"],
  Computation: ["method"],
  Evidence: ["statement"],
  Decision: ["reason", "invalidation_check"],
  Criterion: ["proposition"],
  CriterionEvaluation: ["value"],
  Gate: ["consequence"],
  Review: ["verdict"],
  Task: ["objective", "acceptance"],
  Note: ["text"],
};

/**
 * Which `Prose[]` (array) node properties `search()` scans, per label.
 */
export const SEARCHABLE_TEXT_ARRAYS: { readonly [L in NodeLabel]?: readonly string[] } = {
  Task: ["mayRead"],
};

export const EDGE_LABELS = [
  "MOTIVATES", // Question -> LineOfEnquiry
  "REQUIRES", // LineOfEnquiry -> Evidence
  "ADDRESSES", // EvidenceUnit -> LineOfEnquiry
  "SUPPORTS", // Evidence -> Claim
  "CHALLENGES", // Evidence -> Claim
  "REVERIFIES", // Evidence -> Evidence
  "PROMOTES", // Decision -> Claim
  "GRADES", // Decision -> Claim
  "ABOUT", // CriterionEvaluation -> Claim (which finding this verdict judged)
  "KEEPS", // Decision -> Claim (a conclusion a revision carried forward)
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
  "IN_LIGHT_OF", // Decision -> Claim it was accepted in light of
  "RESOLVES", // Decision -> Question | LineOfEnquiry | Task | Gate
  "ANSWERS", // Decision -> Claim named as an enquiry's answer
  "NARROWS", // Decision -> Question
  "DEFERS", // Decision -> Question
  "SUPERSEDES", // Decision -> Decision (an amendment is a decision with this edge)
  "EVALUATES", // Review -> Claim | Decision | Evidence | EvidenceUnit
  "INVALIDATED_BY", // Artefact -> Review (which review the retraction rested on)
  "IMPLEMENTS", // Task -> EvidenceUnit
  "RESTS_ON", // Claim -> Claim (a synthesis over findings it does not re-run)
  "CONCERNS", // Note -> anything (--on: the one attachment point with no fixed target)
] as const;
export type EdgeLabel = (typeof EDGE_LABELS)[number];

/**
 * One change an act made to the graph.
 */
export type GraphChange = NodeCreated | EdgeCreated | PropsChanged;

/**
 * Distributed over the labels, so `label` picks the property shape exactly as
 * `createNode` does. A `Claim` staged with an `Artefact`'s properties is a
 * compile error rather than a row.
 */
export type NodeCreated = {
  [L in NodeLabel]: {
    change: "NodeCreated";
    id: string;
    label: L;
    props: NodePropsByLabel[L];
  };
}[NodeLabel];

export interface EdgeCreated {
  change: "EdgeCreated";
  from: string;
  label: EdgeLabel;
  to: string;
  props?: EdgeProps;
}

/**
 * Properties set in place on something that already exists.
 */
export interface PropsChanged {
  change: "PropsChanged";
  id: string;
  props: Record<string, unknown>;
}

export type EdgeProps = Record<string, string | number | boolean | number[]>;

/**
 * Single authoritative source of truth for legal edge shapes. `createEdge` validates the
 * resolved `(fromLabel, toLabel)` pair against this table and throws before issuing any Cypher
 * if the pair is not listed.
 */
export const EDGE_SCHEMA: Record<EdgeLabel, ReadonlyArray<readonly [NodeLabel, NodeLabel]>> = {
  /**
   * "Gave rise to." A question gives rise to a line of enquiry; a decision gives rise to a
   * question; a note gives rise to the question somebody eventually sharpened out of it.
   */
  MOTIVATES: [
    ["Question", "LineOfEnquiry"],
    ["Decision", "Question"],
    ["Note", "Question"],
    ["Decision", "Claim"],
    ["Decision", "Criterion"],
    // The revision an act produced, at analysis grain — the half that pairs
    // with `SUPERSEDES -> Computation`. `MOTIVATES` names what an act put in
    // place; `SUPERSEDES` names what it stands instead of.
    ["Decision", "Computation"],
  ],
  REQUIRES: [["LineOfEnquiry", "Evidence"]],
  // The `Task` pair says why a piece of planned work exists. It reuses ADDRESSES rather than
  // minting a label because it is the *same* reading one step earlier in time: an EvidenceUnit
  // ADDRESSES the enquiry it was recorded towards, and a Task addresses the same enquiry before
  // any evidence exists.
  ADDRESSES: [
    ["EvidenceUnit", "LineOfEnquiry"],
    ["Task", "LineOfEnquiry"],
  ],
  SUPPORTS: [["Evidence", "Claim"]],
  CHALLENGES: [["Evidence", "Claim"]],
  USES: [["EvidenceUnit", "Computation"]],
  /**
   * Execution lineage: what a computation read.
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
   * Which condition a gate enforces, independent of whether it has ever been evaluated.
   */
  GOVERNS: [["Criterion", "Gate"]],
  /**
   * The standard a finding is held to, as distinct from the work a condition gates.
   */
  QUALIFIES: [["Criterion", "EvidenceUnit"]],
  EVALUATED_AS: [["Criterion", "CriterionEvaluation"]],
  TRIGGERS: [["CriterionEvaluation", "Gate"]],
  GATES: [
    ["Gate", "Task"],
    ["Gate", "Computation"],
  ],
  /**
   * "Re-checked that finding, without reproducing the run behind it."
   */
  REVERIFIES: [["Evidence", "Evidence"]],
  /**
   * The act that confers confirmatory standing on a finding.
   */
  PROMOTES: [["Decision", "Claim"]],
  /**
   * **A decision put a claim into a state its evidence does not carry.**
   */
  GRADES: [["Decision", "Claim"]],
  /**
   * Which finding a verdict judged, when one criterion is applied to several.
   */
  ABOUT: [["CriterionEvaluation", "Claim"]],
  /**
   * A conclusion a revision carried forward unchanged.
   */
  KEEPS: [["Decision", "Claim"]],
  /**
   * What a decision withdrew or replaced: a design condition, an interpretation.
   */
  CHANGES: [
    ["Decision", "Criterion"],
    ["Decision", "Claim"],
  ],
  BASED_ON: [
    ["Decision", "Evidence"],
    ["CriterionEvaluation", "Evidence"],
  ],
  IN_LIGHT_OF: [["Decision", "Claim"]],
  /**
   * The item a decision closes. Question remains legal for replaying historical events; current
   * question standing is computed from the closures of its lines of enquiry.
   */
  RESOLVES: [
    ["Decision", "Question"],
    ["Decision", "LineOfEnquiry"],
    ["Decision", "Task"],
    ["Decision", "Gate"],
  ],
  ANSWERS: [["Decision", "Claim"]],
  NARROWS: [["Decision", "Question"]],
  DEFERS: [["Decision", "Question"]],
  /**
   * **A later record stands instead of an earlier one.**
   */
  SUPERSEDES: [
    ["Decision", "Decision"],
    ["Decision", "Claim"],
    ["Decision", "Computation"],
  ],
  /**
   * `Review -> EvidenceUnit` is how a review of an *analysis* has somewhere to point; without
   * it the subject survives only in the event stream and "why was this replaced?" is
   * unanswerable from the graph.
   */
  EVALUATES: [
    ["Review", "Claim"],
    ["Review", "Decision"],
    ["Review", "Evidence"],
    ["Review", "EvidenceUnit"],
  ],
  /**
   * Which review a retraction actually rested on.
   */
  INVALIDATED_BY: [
    ["Artefact", "Review"],
    ["Decision", "Review"],
  ],
  IMPLEMENTS: [["Task", "EvidenceUnit"]],
  /**
   * A claim that synthesises others and computes nothing new.
   */
  RESTS_ON: [["Claim", "Claim"]],
  /**
   * Every other pair in this table names two specific labels because the relationship means
   * something specific about both.
   */
  CONCERNS: NODE_LABELS.map((label) => ["Note", label] as const),
};

// **What LabKit does with a stored string — five names instead of one.**  Every property below
// is a `string` at runtime; these say nothing about the value's shape and everything about the
// *code's relationship to it*.

/**
 * LabKit matches on this **in Cypher**, so it is worth an index and gets one.
 */
export type IndexedString = string;

/**
 * A unique handle from **outside** LabKit — a digest, a URI, another system's run id. Compared
 * for equality in TypeScript, never matched in a query.
 */
export type IdentityString = string;

/**
 * An ISO-8601 instant, from the injected `Clock`.
 */
export type Timestamp = string;

/**
 * Stored, handed back to callers, never decided on.
 */
export type ReadOnlyString<T extends string = string> = T;

/**
 * {@link ReadOnlyString}, and potentially large — free text a human or an agent wrote.
 */
export type Prose = string;

export type EvidenceUnitRole =
  | "observation"
  | "experiment"
  | "feasibility"
  | "verification"
  | "robustness"
  | "ablation"
  | "mechanistic"
  | "analysis"
  | "infrastructure"
  | "confirmatory";

// No `project_id` on any *Props interface below: the graph itself is the tenant
// partition, not a repeated node property.

export interface QuestionProps {
  name: Prose;
  /**
   * When the question entered the record, from the injected clock.
   */
  posed_at: Timestamp;
}

export interface LineOfEnquiryProps {
  name: Prose;
  /** When this pursuit entered the record. Historical events may predate this property. */
  started_at?: Timestamp;
}

export interface EvidenceUnitProps {
  /**
   * What kind of work produced the evidence. Written by two verbs, read by none.
   */
  role: ReadOnlyString<EvidenceUnitRole>;
}

export interface EvidenceProps {
  statement: Prose;
}

export interface ClaimProps {
  /**
   * The proposition, and the most-matched string in the codebase — twelve Cypher sites address
   * a claim by it.
   */
  name: IndexedString;
  /**
   * Whether the finding was prespecified, and whether anyone has promoted it — **two facts
   * under one value**, which is issue #63.
   */
  kind?: "exploratory" | "confirmatory" | "undecided";
}

export type ResolutionKind = "answered" | "abandoned" | "stopped" | "sidestepped" | "retired";

/** No evidence string shadow, and no mutable open or closed property. */
export interface DecisionProps {
  reason: Prose;
  /** Present exactly when this decision closes one item through RESOLVES. */
  resolution_kind?: ReadOnlyString<ResolutionKind>;
  /** What would reopen this decision. */
  invalidation_check: Prose;
  /** When the act was recorded, from the injected clock. Earned by row Z. */
  decided_at: Timestamp;
}

export interface CriterionProps {
  proposition: Prose;
}

// No `evidence_ref`: what a verdict was reached against is
// `CriterionEvaluation -[:BASED_ON]-> Evidence`, not a string shadow of it.
export interface CriterionEvaluationProps {
  value: Prose;
  outcome: ReadOnlyString<"pass" | "fail">;
  evaluated_at: Timestamp;
}

export interface GateProps {
  consequence: Prose;
}

export interface ReviewProps {
  /**
   * `Prose`, and `EDGE_SCHEMA.CHANGES` says why that is a decision rather than a shrug: telling
   * a confirming review from a retracting one by reading this text *"would be text-matching"*,
   * so the model expresses it structurally instead.
   */
  verdict: Prose;
}

// Property list for an Artefact.
export interface ArtefactProps {
  /**
   * `"observations"` or `"analysis-output"` — a real kind, which is what {@link
   * ComputationProps.method} was renamed for not being.
   */
  kind: ReadOnlyString;
  logical_name: IndexedString;
  content_hash?: IdentityString;
  uri?: IdentityString;
  external_ref?: IdentityString;
}

// Property list for a Computation.
export interface ComputationProps {
  /**
   * How the analysis was carried out, in the researcher's own words.
   */
  method: Prose;
  /** Hardcoded `"completed"` by the only writer. A running or failed computation has nowhere to say so yet. */
  status: ReadOnlyString;
  backend?: IdentityString;
  external_run_id?: IdentityString;
  started_at?: Timestamp;
  finished_at?: Timestamp;
  code_revision?: IdentityString;
  environment_ref?: IdentityString;
}

/**
 * **No `is_open`**, for the reason {@link DecisionProps} gives: a flag every writer sets and no
 * reader consults.
 */
export interface TaskProps {
  objective: Prose;
  /**
   * What the task is permitted to read — a **native agtype array**, not a JSON string.
   */
  mayRead: Prose[];
  /** Hardcoded `""` by the only writer. What a task produced has nowhere to be said yet. */
  outputs: ReadOnlyString;
  acceptance: Prose;
}

/**
 * `note`'s whole node: one property, and it stops there.
 */
export interface NoteProps {
  text: Prose;
}

/**
 * Binds each node label to the property shape it accepts.
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
  Note: NoteProps;
}

/** Everything the persistence layer needs to know about one node label, in one place. */
interface NodeType<L extends NodeLabel> {
  /**
   * Short display prefix for natural IDs — `Computation` -> `"COMP_123"`. Scoped globally per
   * entity-type, not per-tenant.
   */
  readonly prefix: string;

  /**
   * Creation-time enforcement of per-label property invariants. Returns the props to actually
   * write, so a validator can normalise as well as reject.
   */
  readonly validate?: (props: NodePropsByLabel[L]) => NodePropsByLabel[L];
}

/**
 * One entry per node label — everything the persistence layer knows about a
 * label in one record, rather than parallel tables indexed by the same key and
 * kept aligned by hand.
 */
export const NODE_TYPES: { readonly [L in NodeLabel]: NodeType<L> } = {
  Question: { prefix: "Q" },
  LineOfEnquiry: { prefix: "LOE" },
  EvidenceUnit: { prefix: "EU" },
  Evidence: { prefix: "EV" },
  Claim: { prefix: "CLM" },
  Decision: { prefix: "DEC" },
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
  Note: { prefix: "NOTE" },
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
 * A node as returned to callers outside the persistence layer: AGE's internal graphid
 * (`AgtypeVertex.id`, a large opaque number/bigint — see src/db/agtype.ts) is stripped and replaced
 * with the short, incrementing `natural_id` that's safe to show a user or an AI-agent caller.
 */
export interface PublicNode<L extends NodeLabel> {
  natural_id: string;
  label: L;
  properties: NodePropsByLabel[L];
}
