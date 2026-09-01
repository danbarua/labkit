/**
 * Zod mirrors of the report types the seven read tools return.
 *
 * **Why a mirror is allowed here, given that a mirror is a copy.** Every schema
 * below is held to its interface by `Exact<>` at the bottom of this file, so
 * drift is a `tsc --noEmit` failure rather than a wrong answer a caller
 * discovers. A copy a gate holds to its original is a different thing from a
 * copy nobody checks.
 *
 * **What the check does not cover, measured rather than reasoned about.**
 * Two-way assignability catches a field added, removed or retyped — all three
 * demonstrated by making the edit and watching `tsc` fail. It does **not**
 * catch a mirror that drops an *optional* field, because an object without one
 * is still assignable both ways.
 *
 * The schemas are `strictObject`, so `tests/mcp.test.ts` parsing a real output
 * catches a dropped optional field as an unknown key — **but only for a field
 * the seeded session actually populates.** Both halves were demonstrated:
 * deleting `restsOn` (populated) fails two tests; deleting `replacedBy` (not
 * populated by that session) passes everything, `tsc` included.
 *
 * So the residual gap is exact: an optional field that no test data produces
 * can be dropped from a schema and nothing here notices. Widening the seed is
 * what narrows it; nothing else does.
 *
 * **The failure mode this introduces.** The SDK validates `structuredContent`
 * against `outputSchema` and throws `McpError` when it does not match
 * (`validateToolOutput`, verified in the installed `dist/esm/server/mcp.js`).
 * So a schema that drifts turns a *working* read into an error for the caller,
 * where before it turned into stale documentation. That is the trade: a louder
 * failure, caught by a gate, instead of a quiet one that is not.
 */

import { z } from "zod";
import type {
  ListedGate,
  ListedWork,
  RecordedAnalysis,
  RecordedObservations,
  OpenedEnquiry,
  SharpenedQuestion,
  Posed,
  Pursued,
  RecordedReview,
  ClosedEnquiry,
  PlannedWork,
  StatedCriterion,
  DeclaredGate,
  EvaluatedCriterion,
  AcceptedAsUnresolved,
  Promoted,
  QuestionClosure,
  ConflictSide,
  ConflictVerdict,
  GateStatus,
  QuestionOrigin,
  ReproducibilityReport,
  TaskContract,
  AmendmentReport,
  ChangedConclusion,
  CriterionRef,
  GateRef,
  ReinterpretationReport,
  ReplacementReport,
  ReviewRef,
  UnaffectedRecord,
  VerificationReport,
  WorkRef,
  AnalysisRef,
  EnquiryRef,
  ObservationsRef,
  QuestionRef,
  AmendmentRecord,
  CheckStatus,
  DependencyReport,
  DesignHistory,
  EnquiryStatus,
  EnquiryInContext,
  EvaluationRecord,
  HistoricalSurvey,
  IdentifiedArtefact,
  InterpretationHistory,
  KnowledgeSurvey,
  AcceptedQuestion,
  AnsweredQuestion,
  Standing,
  QuestionStanding,
  ReproductionReport,
  Revision,
  SupportExplanation,
  Kind,
  Cause,
  Explanation,
} from "../domain/report";
import type { Ref } from "../domain/report";
import type { DomainEvent, MintedEdge } from "../domain/events";
import type { EdgeLabel } from "../db/domain";

/**
 * `Ref<K>` — the natural-id handle the domain passes around, which over the
 * wire is just its id: `"GATE_1"`, not `{"kind":"gate","id":"GATE_1"}`.
 *
 * **These are output schemas, so there is nothing here to validate.** They
 * describe what LabKit returns, and LabKit returns handles it minted itself.
 * The `kind` argument is kept for readability at the ~46 call sites — it says
 * which handle a field carries — and is deliberately unused.
 *
 * **The check is `ref()`, not a `z.literal(kind)` here.** A literal would
 * verify only that a caller *said* "gate", never that the id was one, and the
 * two can disagree. Input handles reach the domain through `ref()`
 * (`src/domain/report.ts`), which refuses an id whose prefix names another
 * label, and `server.ts` turns that throw into an `isError` result carrying the
 * message.
 */
const ref = <K extends string>(_kind: K) => z.string() as unknown as z.ZodType<Ref<K>>;

/** `{claim, asserts}` — the report convention's pair for a claim, in one place. */
const concludedClaim = z.strictObject({
  claim: ref("claim"),
  asserts: z.string(),
  // Populated by `recordAnalysis`/`reverify`/`replaceAnalysis`, absent for a
  // claim reached by wording (`claimsAsserting`) or one narrowing several
  // prior findings (`reinterpret`'s `nowClaims`) — see `ConcludedClaim.finding`.
  finding: ref("evidence").optional(),
});

/** `claims_asserting` — an array, wrapped because structuredContent must be an object. */
export const claimsAssertingSchema = z.strictObject({
  claims: z.array(concludedClaim),
});

/**
 * `{handle, wording}` — plain `z.string()` for `handle`, not `ref()`, because
 * one result set spans as many kinds as the string taxonomy has `Prose`
 * labels. `label` on the enclosing group is how a caller tells them apart.
 */
const searchMatch = z.strictObject({
  handle: z.string(),
  wording: z.string(),
});

/** `search` — every match, grouped by label. */
export const searchSchema = z.strictObject({
  groups: z.array(
    z.strictObject({
      label: z.string(),
      matches: z.array(searchMatch),
    }),
  ),
});

/**
 * `what_happened` — the acts themselves, which is the one thing the graph does
 * not hold.
 *
 * `attribution` is flattened rather than nested, because a caller reading this
 * is asking *who* and would otherwise have to reach through a wrapper to find
 * out. `seq` is the order and the cursor: pass the last one back as
 * `since_seq`.
 *
 * **Not `domainEventSchema` below**, on purpose: a row read back from the sink
 * always has a `seq` and a grade, so this shape says so with `.nullable()`
 * rather than `.optional()` — the one thing `Exact<>` cannot catch is an
 * optional field a schema silently drops, and a row genuinely read back always
 * carries these keys. `domainEventSchema` describes the event as `emit` hands
 * it to a caller in the same call that created it, where the type allows all
 * four for a hand-built fixture predating the collector; here they never are.
 */
export const whatHappenedSchema = z.strictObject({
  events: z.array(
    z.strictObject({
      seq: z.number(),
      at: z.string(),
      operation: z.string(),
      subject: z.string(),
      created: z.array(z.string()),
      attribution_label: z.string(),
      attribution_id: z.string(),
      // **`.nullable()`, never `.optional()`.** The `Exact<>` gate at the
      // bottom of this file has one measured hole -- a schema that DROPS an
      // optional field is still assignable both ways -- so an optional grade
      // would sail past both the compile check and the strictObject parse test,
      // which is the exact shape this field exists to stop.
      attribution_how: z.enum(["observed", "claimed", "unattributed"]).nullable(),
      git_hash: z.string(),
      detail: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
});

/**
 * A `DomainEvent` as a write verb hands it back. Every write tool's output
 * includes `events`, and this is the one mirror they share.
 *
 * `edges[].label` is `z.string()` cast to the domain's union, the same trick
 * `ref()` above uses: this is an output schema with nothing to validate, since
 * LabKit only ever emits values it minted itself. `operation` needs no cast —
 * a stored event's verb is a string.
 */
const operation = z.string();
const edgeLabel = z.string() as unknown as z.ZodType<EdgeLabel>;

const mintedEdge = z.strictObject({
  from: z.string(),
  label: edgeLabel,
  to: z.string(),
});

// `readonly` casts: `DomainEvent.created`/`.edges` are `readonly`, and
// `z.array()` infers a mutable array -- `Exact<>` treats the two as different
// types (a mutable array is assignable to its readonly counterpart but not
// back), so an uncast `z.array()` here would fail every schema that embeds
// `events`, including this one.
const createdList = z.array(z.string()) as unknown as z.ZodType<readonly string[]>;
const mintedEdgeList = z.array(mintedEdge) as unknown as z.ZodType<readonly MintedEdge[]>;

const recordedAttribution = z.strictObject({
  attribution_label: z.string(),
  attribution_id: z.string(),
  attribution_how: z.enum(["observed", "claimed", "unattributed"]).nullable(),
  git_hash: z.string(),
});

export const domainEventSchema = z.strictObject({
  seq: z.number().optional(),
  at: z.string(),
  attribution: recordedAttribution,
  operation,
  subject: z.string(),
  created: createdList,
  edges: mintedEdgeList,
  detail: z.record(z.string(), z.unknown()).optional(),
});

const questionStanding = z.strictObject({
  question: ref("question"),
  asks: z.string(),
});

/** `KnowledgeSurvey.accepted` — `questionStanding` plus what would reopen it. */
const acceptedQuestion = questionStanding.extend({
  reopensIf: z.string(),
  acceptedBecause: z.string(),
});

/** `KnowledgeSurvey.established`/`.provisional` — the claim that answers it, and which way. */
const answeredQuestion = questionStanding.extend({
  claim: ref("claim"),
  answer: z.enum(["yes", "no"]),
});

const identifiedArtefact = z.strictObject({
  part: ref("observations"),
  name: z.string(),
  invalidated: z.literal(true).optional(),
});

const citedFinding = z.strictObject({
  evidence: ref("evidence"),
  states: z.string(),
});

const evaluationRecord = z.strictObject({
  evaluation: ref("evaluation"),
  criterion: ref("criterion"),
  value: z.string(),
  outcome: z.enum(["pass", "fail"]),
  at: z.string(),
  withdrawn: z.literal(true).optional(),
  basis: z.array(citedFinding),
});

const bearingFinding = z.strictObject({
  finding: z.string(),
  evidence: ref("evidence"),
  method: z.string(),
  analysis: ref("analysis"),
});

const gatedWork = z.strictObject({ work: ref("work"), objective: z.string() });
const blockedWork = z.strictObject({
  gate: ref("gate"),
  consequence: z.string(),
  gating: z.array(gatedWork),
});

const unmetCheck = z.strictObject({
  criterion: ref("criterion"),
  requires: z.string(),
  blocks: z.array(blockedWork),
});

/**
 * `Condition` and `UnmetCheck` are **separate interfaces that shared a shape**,
 * and this was `const condition = unmetCheck` until `UnmetCheck` gained
 * `blocks`. The alias was never a claim that they are the same thing — a
 * condition is what an amendment replaced, and carries no consequences —
 * so they diverge here rather than one being widened to fit the other.
 *
 * The `Exact<>` assertions below are what caught it; nothing else would have.
 */
const condition = z.strictObject({
  criterion: ref("criterion"),
  requires: z.string(),
});

const checkStatus = z.strictObject({
  criterion: ref("criterion"),
  proposition: z.string(),
  state: z.enum(["passed", "failed", "never-run", "no-standing-verdict"]),
  evaluations: z.array(evaluationRecord),
  decidedBy: evaluationRecord.optional(),
});

const amendmentRecord = z.strictObject({
  amendment: ref("decision"),
  replaced: condition,
  nowRequires: condition,
  reason: z.string(),
  citing: z.array(citedFinding),
  rerun: z.array(gatedWork),
  nature: z.enum(["mechanical", "scientific"]),
});

const revision = z.strictObject({
  revision: ref("decision"),
  previously: z.array(concludedClaim),
  nowClaims: concludedClaim,
  reason: z.string(),
  restingOnTheOldReading: z.array(z.strictObject({ question: ref("question"), asks: z.string() })),
});

/* -- the seven tools' return shapes -------------------------------------- */

export const knowledgeSurveySchema = z.strictObject({
  established: z.array(answeredQuestion),
  unresolved: z.array(questionStanding),
  untested: z.array(questionStanding),
  provisional: z.array(answeredQuestion),
  accepted: z.array(acceptedQuestion),
});

export const historicalSurveySchema = z.strictObject({
  at: z.string(),
  established: z.array(questionStanding),
  provisional: z.array(questionStanding),
  accepted: z.array(questionStanding),
  open: z.array(questionStanding),
});

export const supportExplanationSchema = z.strictObject({
  claim: ref("claim"),
  proposition: z.string(),
  supported: z.boolean(),
  standing: z.enum(["exploratory", "confirmatory"]),
  promotedBecause: z.string().optional(),
  support: z.array(bearingFinding),
  reverifiedBy: z.array(z.strictObject({ analysis: ref("analysis"), method: z.string() })),
  standard: z.array(checkStatus),
  unmet: z.array(unmetCheck),
  restingOn: z.array(identifiedArtefact),
  superseded: z.array(
    bearingFinding.extend({
      reason: z.string(),
      bearing: z.enum(["supports", "challenges"]),
    }),
  ),
  challenged: z.boolean(),
  against: z.array(bearingFinding),
  withdrawn: z.boolean(),
  replacedBy: z.strictObject({ claim: ref("claim"), asserts: z.string() }).optional(),
});

export const dependencyReportSchema = z.strictObject({
  subject: ref("observations"),
  claims: z.array(concludedClaim),
  enquiries: z.array(z.strictObject({ enquiry: ref("enquiry"), pursuing: z.string() })),
  routesWalked: z.array(z.string()),
  // Literal `false`, not `boolean`. The report is a lower bound and says so in
  // its type; a caller must not be able to read `complete: true` from it.
  complete: z.literal(false),
});

export const questionClosureSchema = z.strictObject({
  question: ref("question"),
  asks: z.string(),
  open: z.boolean(),
  closure: z.enum(["answered", "abandoned", "accepted-as-unresolved"]).nullable(),
  answer: z.enum(["yes", "no"]).nullable(),
  reopensIf: z.string().optional(),
  acceptedBecause: z.string().optional(),
  restsOn: z.enum(["exploratory", "confirmatory"]).optional(),
  evidence: z.array(citedFinding),
});

export const enquiryStatusSchema = z.strictObject({
  enquiry: ref("enquiry"),
  pursuing: z.string(),
  contributed: z.array(citedFinding),
  question: questionClosureSchema.nullable(),
});

/**
 * `enquiry_in_context` — `enquiryStatusSchema` alongside where this enquiry's
 * own question sits in the overall survey: one bucket, not the whole survey.
 * See `EnquiryInContext`'s own doc comment.
 */
export const enquiryInContextSchema = z.strictObject({
  enquiry: enquiryStatusSchema,
  standing: questionStanding
    .extend({
      bucket: z.enum(["established", "unresolved", "untested", "provisional", "accepted"]),
    })
    .nullable(),
});

export const designHistorySchema = z.strictObject({
  gate: ref("gate"),
  originally: condition,
  nowRequires: condition,
  criterion: ref("criterion"),
  amendments: z.array(amendmentRecord),
});

export const interpretationHistorySchema = z.strictObject({
  originally: z.array(concludedClaim),
  nowClaims: concludedClaim,
  revisions: z.array(revision),
});

export const reproductionReportSchema = z.strictObject({
  verification: ref("analysis"),
  verificationMethod: z.string(),
  of: ref("analysis"),
  ofMethod: z.string(),
  conclusion: z.enum(["agrees", "disagrees"]),
  verificationRead: z.array(identifiedArtefact),
  ofRead: z.array(identifiedArtefact),
  differs: z.array(
    z.strictObject({
      what: identifiedArtefact,
      standing: z.enum(["unrecorded-in-the-original", "changed", "not-used-by-the-re-run"]),
    }),
  ),
  bearing: z.enum(["raises", "lowers"]),
});

/* -- the six reads exposed later than the rest ---------------------------- */

/**
 * `origin_of` — `null` for a question somebody simply asked, which is most of
 * them. Wrapped, because `structuredContent` must be an object and a bare
 * `null` is not one; `origin: null` says "asked outright" rather than "no
 * answer available".
 */
export const questionOriginSchema = z.strictObject({
  from: ref("question"),
  fromAsks: z.string(),
  reason: z.string(),
  knownAtTheTime: z.array(citedFinding),
});
export const originOfSchema = z.strictObject({
  origin: questionOriginSchema.nullable(),
});

/**
 * The line of enquiry (and question) a task exists to advance -- see
 * `Addressing` in `src/domain/report.ts`. Shared rather than inlined per
 * schema, since `taskContractSchema` and `workListWithWhySchema` both carry it.
 */
const addressingSchema = z.strictObject({
  enquiry: ref("enquiry"),
  pursuing: z.string(),
  question: ref("question"),
  asks: z.string(),
});

export const taskContractSchema = z.strictObject({
  work: ref("work"),
  objective: z.string(),
  acceptance: z.string(),
  mayRead: z.array(z.string()),
  // Literal `false`. The contract records what work may read; nothing stops a
  // computation reading elsewhere, and a caller must not be able to read
  // `enforced: true` from this.
  enforced: z.literal(false),
  // Absent, not null, for ungated work (#91) -- see PlanWorkCommand.addressing.
  addressing: addressingSchema.optional(),
});

/** `criteria_governing` — an array, so it is wrapped like `pursuits_of`. */
export const criteriaGoverningSchema = z.strictObject({
  criteria: z.array(ref("criterion")),
});

export const gateStatusSchema = z.strictObject({
  gate: ref("gate"),
  consequence: z.string(),
  state: z.enum(["never-evaluated", "incomplete", "blocked", "satisfied"]),
  checks: z.array(checkStatus),
  unmet: z.array(unmetCheck),
  evaluations: z.array(evaluationRecord),
  gating: z.array(gatedWork),
  everFailed: z.boolean(),
});

/**
 * `why` — one record's `{handle, wording}` citation, the shape `because`
 * arrays are built from. `handle` spans every {@link Kind}, exactly like
 * `SearchMatch.handle` above -- the same `ref()` cast, since it is an output
 * schema and there is nothing here to validate.
 */
const explanationCause: z.ZodType<Cause> = z.strictObject({
  handle: z.string() as unknown as z.ZodType<Ref<Kind>>,
  wording: z.string(),
  when: z.string().optional(),
});

/** One superseded finding and the one standing in its place. */
const revisedFinding = z.strictObject({
  proposition: z.string(),
  was: ref("claim"),
  before: z.string(),
  claim: ref("claim"),
  after: z.string(),
});

/** What an analysis revised — `supersedes` absent when it revises nothing. */
const analysisRevisionSchema = z.strictObject({
  analysis: ref("analysis"),
  supersedes: ref("analysis").optional(),
  because: z.strictObject({ review: ref("review"), verdict: z.string() }).optional(),
  changed: z.array(revisedFinding),
  restated: z.array(concludedClaim),
  kept: z.array(concludedClaim),
  unpaired: z.array(concludedClaim),
});

/**
 * `why` — a discriminated union on `kind`, not one shape with optional
 * fields: `report` differs by kind (`SupportExplanation` for a claim,
 * `TaskContract` for work, `EnquiryInContext` for a line of enquiry,
 * `GateStatus` for a gate), and a caller narrowing on `kind` gets the right
 * one without a cast. Only the kinds `src/domain/read.ts`'s `EXPLAINED` table
 * has a case for are members here -- see `Explanation`'s own doc comment in
 * `src/domain/report.ts` for why a kind `why` does not yet explain has no
 * member and no schema: it never reaches `structuredContent` at all, because
 * the domain throws before returning one.
 */
export const explanationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("claim"),
    subject: ref("claim"),
    is: z.string(),
    because: z.array(explanationCause),
    report: supportExplanationSchema,
  }),
  z.strictObject({
    kind: z.literal("work"),
    subject: ref("work"),
    is: z.string(),
    because: z.array(explanationCause),
    report: taskContractSchema,
  }),
  z.strictObject({
    kind: z.literal("enquiry"),
    subject: ref("enquiry"),
    is: z.string(),
    because: z.array(explanationCause),
    report: enquiryInContextSchema,
  }),
  z.strictObject({
    kind: z.literal("gate"),
    subject: ref("gate"),
    is: z.string(),
    because: z.array(explanationCause),
    report: gateStatusSchema,
  }),
  z.strictObject({
    kind: z.literal("analysis"),
    subject: ref("analysis"),
    is: z.string(),
    because: z.array(explanationCause),
    report: analysisRevisionSchema,
  }),
]);

const conflictSide = z.strictObject({
  claim: ref("claim"),
  question: ref("question"),
  proposition: z.string(),
  asks: z.string(),
  supportedBy: z.array(citedFinding),
  challengedBy: z.array(citedFinding),
});

export const conflictVerdictSchema = z.strictObject({
  conflict: z.boolean(),
  relation: z.enum(["contradiction", "dissociation", "corroboration"]),
  differsBy: z.literal("scope").nullable(),
  sides: z.array(conflictSide),
});

export const reproducibilityReportSchema = z.strictObject({
  analysis: ref("analysis"),
  exact: z.array(identifiedArtefact),
  differing: z.array(identifiedArtefact),
  unverifiable: z.array(identifiedArtefact),
  notRebuilt: z.array(identifiedArtefact),
  reproducible: z.boolean(),
});

/* -- the write tools' return shapes --------------------------------------- */

/**
 * A verb that mints something returns its reference, and over the wire that
 * reference is the only handle the caller gets. `structuredContent` must be an
 * object, so a handle cannot cross on its own — hence this wrapper.
 *
 * Naming the field says more than a `kind` tag would: `{"question":"Q_1"}` says
 * what the id is *for* in this reply, where a tag repeats what the prefix
 * already carries and can contradict it.
 */
const minted = <K extends string>(kind: K) =>
  z.strictObject({ [kind]: ref(kind) } as { [P in K]: z.ZodType<Ref<K>> });

export const questionRefSchema = minted("question");
export const enquiryRefSchema = minted("enquiry");
export const observationsRefSchema = minted("observations");
export const analysisRefSchema = ref("analysis");

/**
 * What `record_analysis` returns: the analysis, and **the claims it minted**.
 *
 * A caller holds a handle to every claim the moment it exists, so nothing
 * downstream has to name one by wording.
 */
export const recordedAnalysisSchema = z.strictObject({
  analysis: analysisRefSchema,
  claims: z.array(concludedClaim),
  events: z.array(domainEventSchema),
});
export const reviewRefSchema = minted("review");
export const workRefSchema = minted("work");
export const criterionRefSchema = minted("criterion");
export const gateRefSchema = minted("gate");

/** What `pose` returns. */
export const posedSchema = z.strictObject({
  question: ref("question"),
  events: z.array(domainEventSchema),
});
/** What `pursue` returns. */
export const pursuedSchema = z.strictObject({
  enquiry: ref("enquiry"),
  events: z.array(domainEventSchema),
});
/** What `open_enquiry` returns — #161's audit: the `Question` was withheld. */
export const openedEnquirySchema = z.strictObject({
  enquiry: ref("enquiry"),
  question: ref("question"),
  events: z.array(domainEventSchema),
});
/** What `record_observations` returns — #161's audit: withheld entirely. */
export const recordedObservationsSchema = z.strictObject({
  observations: ref("observations"),
  events: z.array(domainEventSchema),
});
/** What `sharpen` returns — #161's audit: the frozen `Decision` was withheld. */
export const sharpenedQuestionSchema = z.strictObject({
  question: ref("question"),
  decision: ref("decision"),
  events: z.array(domainEventSchema),
});
/** What `record_review` returns. */
export const recordedReviewSchema = z.strictObject({
  review: ref("review"),
  events: z.array(domainEventSchema),
});
/** What `close_enquiry` returns — #161's audit: this verb returned nothing. */
export const closedEnquirySchema = z.strictObject({
  decision: ref("decision"),
  events: z.array(domainEventSchema),
});
/** What `plan_work` returns. */
export const plannedWorkSchema = z.strictObject({
  work: ref("work"),
  events: z.array(domainEventSchema),
});
/** What `state_criterion` returns. */
export const statedCriterionSchema = z.strictObject({
  criterion: ref("criterion"),
  events: z.array(domainEventSchema),
});
/** What `declare_gate` returns. */
export const declaredGateSchema = z.strictObject({
  gate: ref("gate"),
  events: z.array(domainEventSchema),
});
/** What `evaluate_criterion` returns — #161's audit: this verb returned nothing. */
export const evaluatedCriterionSchema = z.strictObject({
  evaluation: ref("evaluation"),
  events: z.array(domainEventSchema),
});
/** What `accept_as_unresolved` returns — #161's audit: this verb returned nothing. */
export const acceptedAsUnresolvedSchema = z.strictObject({
  decision: ref("decision"),
  events: z.array(domainEventSchema),
});
/** What `promote` returns — #161's audit: this verb returned nothing. */
export const promotedSchema = z.strictObject({
  decision: ref("decision"),
  events: z.array(domainEventSchema),
});

const changedConclusion = z.strictObject({
  proposition: z.string(),
  was: ref("claim"),
  before: z.string(),
  claim: ref("claim"),
  after: z.string(),
});

/**
 * A handle to what a run read — observations, or an earlier analysis.
 *
 * A union in an OUTPUT schema, which is the only one on this surface. It
 * survives `normalizeObjectSchema` because the union is nested inside an
 * object rather than being the tool's whole return shape; a top-level union
 * normalises to `undefined` and would silently drop validation.
 */
const inputRefSchema = z.union([ref("observations"), ref("analysis")]);

const unaffectedRecord = z.strictObject({
  what: inputRefSchema,
  invalidated: z.literal(true).optional(),
  named: z.string(),
  why: z.string(),
});

export const verificationReportSchema = z.strictObject({
  at: z.string(),
  verification: analysisRefSchema,
  of: analysisRefSchema,
  claims: z.array(concludedClaim),
  events: z.array(domainEventSchema),
});

export const amendmentReportSchema = z.strictObject({
  at: z.string(),
  amendment: ref("decision"),
  replaced: condition,
  nowRequires: condition,
  rerun: z.array(gatedWork),
  confirmatoryAffected: z.array(concludedClaim),
  nature: z.enum(["mechanical", "scientific"]),
  events: z.array(domainEventSchema),
});

export const replacementReportSchema = z.strictObject({
  at: z.string(),
  replacement: ref("analysis"),
  decision: ref("decision"),
  supersedes: ref("analysis"),
  kept: z.array(ref("claim")),
  superseded: z.array(concludedClaim),
  events: z.array(domainEventSchema),
});

export const reinterpretationReportSchema = z.strictObject({
  at: z.string(),
  previously: z.array(concludedClaim),
  nowClaims: concludedClaim,
  evidenceStanding: z.array(citedFinding),
  restingOnTheOldReading: z.array(z.strictObject({ question: ref("question"), asks: z.string() })),
  requiresRecomputation: z.boolean(),
  events: z.array(domainEventSchema),
});

/** `pursuits_of` — `ReadSurface.pursuitsOf` returns an array, which is not an object. */
export const pursuitsSchema = z.strictObject({
  // The bare handle, not `minted("enquiry")` — the wrapper exists only so a
  // tool whose *whole* answer is one handle has an object to return.
  enquiries: z.array(ref("enquiry")),
});

/* -- the gate ------------------------------------------------------------- */

/**
 * Two-way assignability. `Exact<A, B>` is `true` only when each side accepts
 * the other, so a field added to the interface, removed from it, or retyped on
 * either side stops this file compiling.
 *
 * The `[A] extends [B]` brackets are not decoration: a bare conditional
 * distributes over a union, and `known`'s two survey shapes are one.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type _QuestionStanding = Assert<Exact<z.infer<typeof questionStanding>, QuestionStanding>>;
export type _AcceptedQuestion = Assert<Exact<z.infer<typeof acceptedQuestion>, AcceptedQuestion>>;
export type _AnsweredQuestion = Assert<Exact<z.infer<typeof answeredQuestion>, AnsweredQuestion>>;
export type _IdentifiedArtefact = Assert<
  Exact<z.infer<typeof identifiedArtefact>, IdentifiedArtefact>
>;
export type _EvaluationRecord = Assert<Exact<z.infer<typeof evaluationRecord>, EvaluationRecord>>;
export type _CheckStatus = Assert<Exact<z.infer<typeof checkStatus>, CheckStatus>>;
export type _AmendmentRecord = Assert<Exact<z.infer<typeof amendmentRecord>, AmendmentRecord>>;
export type _Revision = Assert<Exact<z.infer<typeof revision>, Revision>>;
export type _KnowledgeSurvey = Assert<
  Exact<z.infer<typeof knowledgeSurveySchema>, KnowledgeSurvey>
>;
export type _HistoricalSurvey = Assert<
  Exact<z.infer<typeof historicalSurveySchema>, HistoricalSurvey>
>;
export type _SupportExplanation = Assert<
  Exact<z.infer<typeof supportExplanationSchema>, SupportExplanation>
>;
export type _DependencyReport = Assert<
  Exact<z.infer<typeof dependencyReportSchema>, DependencyReport>
>;
export type _QuestionClosure = Assert<
  Exact<z.infer<typeof questionClosureSchema>, QuestionClosure>
>;
export type _EnquiryStatus = Assert<Exact<z.infer<typeof enquiryStatusSchema>, EnquiryStatus>>;
export type _EnquiryInContext = Assert<
  Exact<z.infer<typeof enquiryInContextSchema>, EnquiryInContext>
>;
export type _DesignHistory = Assert<Exact<z.infer<typeof designHistorySchema>, DesignHistory>>;
export type _InterpretationHistory = Assert<
  Exact<z.infer<typeof interpretationHistorySchema>, InterpretationHistory>
>;
export type _ReproductionReport = Assert<
  Exact<z.infer<typeof reproductionReportSchema>, ReproductionReport>
>;
export type _QuestionRef = Assert<
  Exact<z.infer<typeof questionRefSchema>["question"], QuestionRef>
>;
export type _EnquiryRef = Assert<Exact<z.infer<typeof enquiryRefSchema>["enquiry"], EnquiryRef>>;
export type _ObservationsRef = Assert<
  Exact<z.infer<typeof observationsRefSchema>["observations"], ObservationsRef>
>;
export type _RecordedAnalysis = Assert<
  Exact<z.infer<typeof recordedAnalysisSchema>, RecordedAnalysis>
>;
export type _AnalysisRef = Assert<Exact<z.infer<typeof analysisRefSchema>, AnalysisRef>>;
export type _Pursuits = Assert<Exact<z.infer<typeof pursuitsSchema>["enquiries"], EnquiryRef[]>>;
export type _QuestionOrigin = Assert<Exact<z.infer<typeof questionOriginSchema>, QuestionOrigin>>;
export type _TaskContract = Assert<Exact<z.infer<typeof taskContractSchema>, TaskContract>>;
export type _Explanation = Assert<Exact<z.infer<typeof explanationSchema>, Explanation>>;
export type _CriteriaGoverning = Assert<
  Exact<z.infer<typeof criteriaGoverningSchema>["criteria"], CriterionRef[]>
>;
export type _GateStatus = Assert<Exact<z.infer<typeof gateStatusSchema>, GateStatus>>;
export type _ConflictSide = Assert<Exact<z.infer<typeof conflictSide>, ConflictSide>>;
export type _ConflictVerdict = Assert<
  Exact<z.infer<typeof conflictVerdictSchema>, ConflictVerdict>
>;
export type _ReproducibilityReport = Assert<
  Exact<z.infer<typeof reproducibilityReportSchema>, ReproducibilityReport>
>;
export type _ReviewRef = Assert<Exact<z.infer<typeof reviewRefSchema>["review"], ReviewRef>>;
export type _WorkRef = Assert<Exact<z.infer<typeof workRefSchema>["work"], WorkRef>>;
export type _CriterionRef2 = Assert<
  Exact<z.infer<typeof criterionRefSchema>["criterion"], CriterionRef>
>;
export type _GateRef = Assert<Exact<z.infer<typeof gateRefSchema>["gate"], GateRef>>;
export type _ChangedConclusion = Assert<
  Exact<z.infer<typeof changedConclusion>, ChangedConclusion>
>;
export type _UnaffectedRecord = Assert<Exact<z.infer<typeof unaffectedRecord>, UnaffectedRecord>>;
export type _VerificationReport = Assert<
  Exact<z.infer<typeof verificationReportSchema>, VerificationReport>
>;
export type _AmendmentReport = Assert<
  Exact<z.infer<typeof amendmentReportSchema>, AmendmentReport>
>;
export type _ReplacementReport = Assert<
  Exact<z.infer<typeof replacementReportSchema>, ReplacementReport>
>;
export type _ReinterpretationReport = Assert<
  Exact<z.infer<typeof reinterpretationReportSchema>, ReinterpretationReport>
>;
export type _DomainEvent = Assert<Exact<z.infer<typeof domainEventSchema>, DomainEvent>>;
export type _Posed = Assert<Exact<z.infer<typeof posedSchema>, Posed>>;
export type _Pursued = Assert<Exact<z.infer<typeof pursuedSchema>, Pursued>>;
export type _OpenedEnquiry = Assert<Exact<z.infer<typeof openedEnquirySchema>, OpenedEnquiry>>;
export type _RecordedObservations = Assert<
  Exact<z.infer<typeof recordedObservationsSchema>, RecordedObservations>
>;
export type _SharpenedQuestion = Assert<
  Exact<z.infer<typeof sharpenedQuestionSchema>, SharpenedQuestion>
>;
export type _RecordedReview = Assert<Exact<z.infer<typeof recordedReviewSchema>, RecordedReview>>;
export type _ClosedEnquiry = Assert<Exact<z.infer<typeof closedEnquirySchema>, ClosedEnquiry>>;
export type _PlannedWork = Assert<Exact<z.infer<typeof plannedWorkSchema>, PlannedWork>>;
export type _StatedCriterion = Assert<
  Exact<z.infer<typeof statedCriterionSchema>, StatedCriterion>
>;
export type _DeclaredGate = Assert<Exact<z.infer<typeof declaredGateSchema>, DeclaredGate>>;
export type _EvaluatedCriterion = Assert<
  Exact<z.infer<typeof evaluatedCriterionSchema>, EvaluatedCriterion>
>;
export type _AcceptedAsUnresolved = Assert<
  Exact<z.infer<typeof acceptedAsUnresolvedSchema>, AcceptedAsUnresolved>
>;
export type _Promoted = Assert<Exact<z.infer<typeof promotedSchema>, Promoted>>;

/**
 * What `register_session` recorded.
 *
 * **Not held to a report interface by `Exact<>`, and that is not an exemption
 * being claimed quietly.** Every other schema here mirrors a type in
 * `src/domain/report.ts`, and the gate exists because a hand-written mirror of
 * something goes stale against it. This one mirrors nothing: a registration is
 * not a report, it never reaches the graph, and `src/domain/` does not know the
 * concept — the seam it belongs to is `src/attribution.ts`, which is
 * deliberately outside all three layers. There is no original for a check to
 * hold it to.
 *
 * `replaced` is optional and present only when a second registration displaced
 * a first, so registering twice is visible in the answer rather than silent.
 */
export const registeredSessionSchema = z.strictObject({
  registered: z.strictObject({
    id: z.string(),
    label: z.string(),
  }),
  replaced: z
    .strictObject({
      id: z.string(),
      label: z.string(),
    })
    .optional(),
});

/** One gate in a list of them. */
const listedGate = z.strictObject({
  gate: ref("gate"),
  consequence: z.string(),
  state: z.enum(["never-evaluated", "incomplete", "blocked", "satisfied"]),
});

/** `gate_list` — an array, wrapped because `structuredContent` must be an object. */
export const gateListSchema = z.strictObject({
  gates: z.array(listedGate),
});

/** One task in a list of them. */
const listedWork = z.strictObject({
  work: ref("work"),
  objective: z.string(),
  state: z.enum(["planned", "blocked", "carried-out"]),
  gates: z.array(ref("gate")),
});

/** `work_list` — the same wrapping, for the same reason. */
export const workListSchema = z.strictObject({
  work: z.array(listedWork),
});

export type _ListedGate = Assert<Exact<z.infer<typeof listedGate>, ListedGate>>;
export type _ListedWork = Assert<Exact<z.infer<typeof listedWork>, ListedWork>>;

/**
 * `now` — "what am I blocked on right now, what are my priorities?"
 * `blocked`/`unevaluated`/`untouched` reuse `listedGate`/`listedWork`;
 * `known` reuses `knowledgeSurveySchema` whole, all five buckets. `since` is
 * absent for the full-standing form and present once a cursor narrowed
 * every section -- see `Standing`'s own doc comment in
 * `src/domain/report.ts`.
 */
export const standingSchema = z.strictObject({
  blocked: z.strictObject({ gates: z.array(listedGate), work: z.array(listedWork) }),
  unevaluated: z.array(listedGate),
  untouched: z.array(listedWork),
  known: knowledgeSurveySchema,
  seq: z.number(),
  since: z.number().optional(),
});
export type _Standing = Assert<Exact<z.infer<typeof standingSchema>, Standing>>;
