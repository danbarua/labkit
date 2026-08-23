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

/** `Ref<K>` — the natural-id handle the domain passes around. */
const ref = <K extends string>(kind: K) => z.strictObject({ kind: z.literal(kind), id: z.string() });

const questionStanding = z.strictObject({
  question: z.string(),
  asks: z.string(),
});

const identifiedArtefact = z.strictObject({
  part: z.string(),
  name: z.string(),
});

const citedFinding = z.strictObject({ evidence: z.string(), states: z.string() });

const evaluationRecord = z.strictObject({
  evaluation: z.string(),
  criterion: z.string(),
  value: z.string(),
  outcome: z.enum(["pass", "fail"]),
  at: z.string(),
  withdrawn: z.literal(true).optional(),
  basis: z.array(citedFinding),
});

const bearingFinding = z.strictObject({
  finding: z.string(),
  evidence: z.string(),
  method: z.string(),
  analysis: z.string(),
});

const unmetCheck = z.strictObject({ criterion: z.string(), requires: z.string() });
const gatedWork = z.strictObject({ work: z.string(), objective: z.string() });

const checkStatus = z.strictObject({
  criterion: z.string(),
  proposition: z.string(),
  state: z.enum(["passed", "failed", "never-run", "no-standing-verdict"]),
  evaluations: z.array(evaluationRecord),
  decidedBy: evaluationRecord.optional(),
});

const amendmentRecord = z.strictObject({
  amendment: z.string(),
  replaced: z.string(),
  nowRequires: z.string(),
  reason: z.string(),
  citing: z.array(citedFinding),
  rerun: z.array(gatedWork),
  nature: z.enum(["mechanical", "scientific"]),
});

const revision = z.strictObject({
  revision: z.string(),
  previously: z.string(),
  nowClaims: z.string(),
  reason: z.string(),
  restingOnTheOldReading: z.array(z.strictObject({ question: z.string(), asks: z.string() })),
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
  proposition: z.string(),
  supported: z.boolean(),
  standing: z.enum(["exploratory", "confirmatory"]),
  promotedBecause: z.string().optional(),
  support: z.array(bearingFinding),
  reverifiedBy: z.array(z.strictObject({ analysis: z.string(), method: z.string() })),
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
  replacedBy: z.strictObject({ claim: z.string(), asserts: z.string() }).optional(),
});

export const dependencyReportSchema = z.strictObject({
  claims: z.array(z.strictObject({ claim: z.string(), asserts: z.string() })),
  enquiries: z.array(z.strictObject({ enquiry: z.string(), pursuing: z.string() })),
  routesWalked: z.array(z.string()),
  // Literal `false`, not `boolean`. The report is a lower bound and says so in
  // its type; a caller must not be able to read `complete: true` from it.
  complete: z.literal(false),
});

export const questionClosureSchema = z.strictObject({
  question: z.string(),
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
  enquiry: z.string(),
  pursuing: z.string(),
  contributed: z.array(citedFinding),
  question: questionClosureSchema.nullable(),
});

export const designHistorySchema = z.strictObject({
  gate: z.string(),
  originally: z.string(),
  nowRequires: z.string(),
  criterion: ref("criterion"),
  amendments: z.array(amendmentRecord),
});

export const interpretationHistorySchema = z.strictObject({
  originally: z.string(),
  nowClaims: z.string(),
  revisions: z.array(revision),
});

export const reproductionReportSchema = z.strictObject({
  verification: z.string(),
  verificationMethod: z.string(),
  of: z.string(),
  ofMethod: z.string(),
  conclusion: z.enum(["agrees", "disagrees"]),
  execution: z.enum(["reproduced", "not-reproduced"]),
  differs: z.array(
    z.strictObject({
      what: identifiedArtefact,
      standing: z.enum(["unrecorded-in-the-original", "changed", "not-used-by-the-re-run"]),
    }),
  ),
  bearing: z.enum(["raises", "lowers"]),
  comparable: z.boolean(),
  incomparableBecause: z.string().optional(),
});

/* -- the six reads exposed later than the rest ---------------------------- */

/**
 * `origin_of` — `null` for a question somebody simply asked, which is most of
 * them. Wrapped, because `structuredContent` must be an object and a bare
 * `null` is not one; `origin: null` says "asked outright" rather than "no
 * answer available".
 */
export const questionOriginSchema = z.strictObject({
  from: z.string(),
  fromAsks: z.string(),
  reason: z.string(),
  knownAtTheTime: z.array(citedFinding),
});
export const originOfSchema = z.strictObject({ origin: questionOriginSchema.nullable() });

export const taskContractSchema = z.strictObject({
  work: z.string(),
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

const evaluationSummary = z.strictObject({
  value: z.string(),
  outcome: z.enum(["pass", "fail"]),
  at: z.string(),
});

export const gateStatusSchema = z.strictObject({
  gate: z.string(),
  consequence: z.string(),
  state: z.enum(["never-evaluated", "incomplete", "blocked", "satisfied"]),
  checks: z.array(checkStatus),
  unmet: z.array(unmetCheck),
  evaluations: z.array(evaluationSummary),
  gating: z.array(gatedWork),
  everFailed: z.boolean(),
});

const conflictSide = z.strictObject({
  claim: z.string(),
  question: z.string(),
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
 * object, so a bare `EnquiryRef[]` cannot cross — hence the wrapper below.
 */
export const questionRefSchema = ref("question");
export const enquiryRefSchema = ref("enquiry");
export const observationsRefSchema = ref("observations");
export const analysisRefSchema = ref("analysis");
export const reviewRefSchema = ref("review");
export const workRefSchema = ref("work");
export const criterionRefSchema = ref("criterion");
export const gateRefSchema = ref("gate");

const changedConclusion = z.strictObject({
  proposition: z.string(),
  before: z.string(),
  after: z.string(),
});

const unaffectedRecord = z.strictObject({
  what: z.string(),
  named: z.string(),
  why: z.string(),
});

export const verificationReportSchema = z.strictObject({
  at: z.string(),
  verification: analysisRefSchema,
  of: analysisRefSchema,
});

export const amendmentReportSchema = z.strictObject({
  at: z.string(),
  amendment: z.string(),
  replaced: z.string(),
  nowRequires: z.string(),
  rerun: z.array(gatedWork),
  confirmatoryAffected: z.array(z.strictObject({ claim: z.string(), asserts: z.string() })),
  nature: z.enum(["mechanical", "scientific"]),
});

export const replacementReportSchema = z.strictObject({
  at: z.string(),
  replacement: analysisRefSchema,
  affected: z.array(z.string()),
  unaffected: z.array(unaffectedRecord),
  changed: z.array(changedConclusion),
  unchanged: z.array(z.string()),
});

export const reinterpretationReportSchema = z.strictObject({
  at: z.string(),
  previously: z.string(),
  nowClaims: z.string(),
  evidenceStanding: z.array(citedFinding),
  restingOnTheOldReading: z.array(z.strictObject({ question: z.string(), asks: z.string() })),
  requiresRecomputation: z.boolean(),
});

/** `pursuits_of` — `ReadSurface.pursuitsOf` returns an array, which is not an object. */
export const pursuitsSchema = z.strictObject({
  enquiries: z.array(enquiryRefSchema),
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
export type _IdentifiedArtefact = Assert<Exact<z.infer<typeof identifiedArtefact>, IdentifiedArtefact>>;
export type _EvaluationRecord = Assert<Exact<z.infer<typeof evaluationRecord>, EvaluationRecord>>;
export type _CheckStatus = Assert<Exact<z.infer<typeof checkStatus>, CheckStatus>>;
export type _AmendmentRecord = Assert<Exact<z.infer<typeof amendmentRecord>, AmendmentRecord>>;
export type _Revision = Assert<Exact<z.infer<typeof revision>, Revision>>;
export type _KnowledgeSurvey = Assert<Exact<z.infer<typeof knowledgeSurveySchema>, KnowledgeSurvey>>;
export type _HistoricalSurvey = Assert<Exact<z.infer<typeof historicalSurveySchema>, HistoricalSurvey>>;
export type _SupportExplanation = Assert<Exact<z.infer<typeof supportExplanationSchema>, SupportExplanation>>;
export type _DependencyReport = Assert<Exact<z.infer<typeof dependencyReportSchema>, DependencyReport>>;
export type _QuestionClosure = Assert<Exact<z.infer<typeof questionClosureSchema>, QuestionClosure>>;
export type _EnquiryStatus = Assert<Exact<z.infer<typeof enquiryStatusSchema>, EnquiryStatus>>;
export type _DesignHistory = Assert<Exact<z.infer<typeof designHistorySchema>, DesignHistory>>;
export type _InterpretationHistory = Assert<
  Exact<z.infer<typeof interpretationHistorySchema>, InterpretationHistory>
>;
export type _ReproductionReport = Assert<Exact<z.infer<typeof reproductionReportSchema>, ReproductionReport>>;
export type _QuestionRef = Assert<Exact<z.infer<typeof questionRefSchema>, QuestionRef>>;
export type _EnquiryRef = Assert<Exact<z.infer<typeof enquiryRefSchema>, EnquiryRef>>;
export type _ObservationsRef = Assert<Exact<z.infer<typeof observationsRefSchema>, ObservationsRef>>;
export type _AnalysisRef = Assert<Exact<z.infer<typeof analysisRefSchema>, AnalysisRef>>;
export type _Pursuits = Assert<Exact<z.infer<typeof pursuitsSchema>["enquiries"], EnquiryRef[]>>;
export type _QuestionOrigin = Assert<Exact<z.infer<typeof questionOriginSchema>, QuestionOrigin>>;
export type _TaskContract = Assert<Exact<z.infer<typeof taskContractSchema>, TaskContract>>;
export type _CriteriaGoverning = Assert<Exact<z.infer<typeof criteriaGoverningSchema>["criteria"], CriterionRef[]>>;
export type _GateStatus = Assert<Exact<z.infer<typeof gateStatusSchema>, GateStatus>>;
export type _ConflictSide = Assert<Exact<z.infer<typeof conflictSide>, ConflictSide>>;
export type _ConflictVerdict = Assert<Exact<z.infer<typeof conflictVerdictSchema>, ConflictVerdict>>;
export type _ReproducibilityReport = Assert<Exact<z.infer<typeof reproducibilityReportSchema>, ReproducibilityReport>>;
export type _ReviewRef = Assert<Exact<z.infer<typeof reviewRefSchema>, ReviewRef>>;
export type _WorkRef = Assert<Exact<z.infer<typeof workRefSchema>, WorkRef>>;
export type _CriterionRef2 = Assert<Exact<z.infer<typeof criterionRefSchema>, CriterionRef>>;
export type _GateRef = Assert<Exact<z.infer<typeof gateRefSchema>, GateRef>>;
export type _ChangedConclusion = Assert<Exact<z.infer<typeof changedConclusion>, ChangedConclusion>>;
export type _UnaffectedRecord = Assert<Exact<z.infer<typeof unaffectedRecord>, UnaffectedRecord>>;
export type _VerificationReport = Assert<Exact<z.infer<typeof verificationReportSchema>, VerificationReport>>;
export type _AmendmentReport = Assert<Exact<z.infer<typeof amendmentReportSchema>, AmendmentReport>>;
export type _ReplacementReport = Assert<Exact<z.infer<typeof replacementReportSchema>, ReplacementReport>>;
export type _ReinterpretationReport = Assert<Exact<z.infer<typeof reinterpretationReportSchema>, ReinterpretationReport>>;
