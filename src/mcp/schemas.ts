/**
 * Zod mirrors of the report types the seven read tools return.
 *
 * **Why these exist, given that a mirror is a copy.** `server.ts` used to say
 * no `outputSchema` was declared, because declaring one meant "hand-writing a
 * Zod mirror of seven report interfaces whose only job is to go stale against
 * them". That objection was to an *unchecked* mirror. Every schema below is
 * held to its interface by `Exact<>` at the bottom of this file, so drift is a
 * `tsc --noEmit` failure rather than a wrong answer discovered by a caller.
 * A copy a gate holds to its original is a different thing from a copy nobody
 * checks — that distinction is the whole of CLAUDE.md's document rule applied
 * to types instead of prose.
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
  EvaluationRecord,
  HistoricalSurvey,
  IdentifiedArtefact,
  InterpretationHistory,
  KnowledgeSurvey,
  QuestionStanding,
  ReproductionReport,
  Revision,
  SupportExplanation,
} from "../domain/report";
import type { Ref } from "../domain/report";

/**
 * `Ref<K>` — the natural-id handle the domain passes around, which over the
 * wire is just its id: `"GATE_1"`, not `{"kind":"gate","id":"GATE_1"}`.
 *
 * **These are output schemas, so there is nothing here to validate.** They
 * describe what LabKit returns, and LabKit returns handles it minted itself.
 * The `kind` argument is kept for readability at the ~46 call sites — it says
 * which handle a field carries — and is deliberately unused.
 *
 * The check that used to live here as `kind: z.literal(kind)` has not been
 * dropped; it moved and got stronger. It only ever verified that a caller had
 * *said* "gate", never that the id was one, and the two could disagree. Input
 * handles now reach the domain through `ref()` (`src/domain/report.ts`), which
 * refuses an id whose prefix names another label — so `"CLM_3"` where a gate
 * belongs is a refusal, and `server.ts` turns that throw into an `isError`
 * result carrying the message.
 */
const ref = <K extends string>(_kind: K) => z.string() as unknown as z.ZodType<Ref<K>>;

/** `{claim, asserts}` — the report convention's pair for a claim, in one place. */
const concludedClaim = z.strictObject({
  claim: ref("claim"),
  asserts: z.string(),
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

const questionStanding = z.strictObject({
  question: ref("question"),
  asks: z.string(),
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
  established: z.array(questionStanding),
  unresolved: z.array(questionStanding),
  untested: z.array(questionStanding),
  provisional: z.array(questionStanding),
  accepted: z.array(questionStanding),
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

export const taskContractSchema = z.strictObject({
  work: ref("work"),
  objective: z.string(),
  acceptance: z.string(),
  mayRead: z.array(z.string()),
  // Literal `false`. The contract records what work may read; nothing stops a
  // computation reading elsewhere, and a caller must not be able to read
  // `enforced: true` from this.
  enforced: z.literal(false),
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
 * It used to cross by accident: a handle was `{"kind":"question","id":"Q_1"}`,
 * which is an object already. It is `"Q_1"` now, so the field has to be named —
 * and naming it says more than the tag did. `{"question":"Q_1"}` says what the
 * id is *for* in this reply, where `kind` only ever repeated what the prefix
 * already carried, and could contradict it.
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
});
export const reviewRefSchema = minted("review");
export const workRefSchema = minted("work");
export const criterionRefSchema = minted("criterion");
export const gateRefSchema = minted("gate");

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
});

export const amendmentReportSchema = z.strictObject({
  at: z.string(),
  amendment: ref("decision"),
  replaced: condition,
  nowRequires: condition,
  rerun: z.array(gatedWork),
  confirmatoryAffected: z.array(concludedClaim),
  nature: z.enum(["mechanical", "scientific"]),
});

export const replacementReportSchema = z.strictObject({
  at: z.string(),
  replacement: ref("analysis"),
  claims: z.array(concludedClaim),
  affected: z.array(concludedClaim),
  unaffected: z.array(unaffectedRecord),
  changed: z.array(changedConclusion),
  unchanged: z.array(concludedClaim),
});

export const reinterpretationReportSchema = z.strictObject({
  at: z.string(),
  previously: z.array(concludedClaim),
  nowClaims: concludedClaim,
  evidenceStanding: z.array(citedFinding),
  restingOnTheOldReading: z.array(z.strictObject({ question: ref("question"), asks: z.string() })),
  requiresRecomputation: z.boolean(),
});

/** `pursuits_of` — `ReadSurface.pursuitsOf` returns an array, which is not an object. */
export const pursuitsSchema = z.strictObject({
  // The bare handle, not `minted("enquiry")` — the wrapper exists only so a
  // tool whose *whole* answer is one handle has an object to return.
  enquiries: z.array(ref("enquiry")),
});

/**
 * What a verb returning `void` says over the wire.
 *
 * `closeEnquiry` returns nothing, and `JSON.stringify(undefined)` is the string
 * `"undefined"` — the content block breaks and `structuredContent` is not an
 * object, so an outputSchema cannot be declared either. An explicit
 * acknowledgement is the smallest honest thing: it names what was acted on, so
 * a caller can tell an accepted call from a dropped one.
 */
export const acknowledgementSchema = z.strictObject({
  ok: z.literal(true),
  acted: z.string(),
});
export type Acknowledgement = z.infer<typeof acknowledgementSchema>;

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
});

/** `work_list` — the same wrapping, for the same reason. */
export const workListSchema = z.strictObject({
  work: z.array(listedWork),
});

export type _ListedGate = Assert<Exact<z.infer<typeof listedGate>, ListedGate>>;
export type _ListedWork = Assert<Exact<z.infer<typeof listedWork>, ListedWork>>;
