import { labelForNaturalId, type NodeLabel } from "../db/domain";
import type { DomainEvent } from "./events";

/**
 * What the domain layer hands back — research answers, not graph rows.
 */

declare const KIND: unique symbol;

/**
 * A handle a caller passes back in — LabKit's short natural id, and nothing else. Never AGE's
 * internal graphid.
 */
export type Ref<K extends string> = string & { readonly [KIND]: K };

/**
 * Which node label each handle kind names.
 */
export const LABEL_BY_KIND = {
  question: "Question",
  enquiry: "LineOfEnquiry",
  unit: "EvidenceUnit",
  evidence: "Evidence",
  claim: "Claim",
  decision: "Decision",
  criterion: "Criterion",
  evaluation: "CriterionEvaluation",
  gate: "Gate",
  review: "Review",
  observations: "Artefact",
  analysis: "Computation",
  work: "Task",
  note: "Note",
} satisfies Record<string, NodeLabel>;

/**
 * Every kind a handle can name — the closed union `why` dispatches on.
 */
export type Kind = keyof typeof LABEL_BY_KIND;

/**
 * A handle of any kind — every {@link Ref} this record can mint, in one type.
 */
export type AnyRef = Ref<Kind>;

/**
 * Builds a handle, and **refuses one whose id does not match its kind**.
 */
export function isRefOfKind(kind: string, id: string): boolean {
  // Widened, not narrowed: `LABEL_BY_KIND`'s literal keys (needed so `Kind` is
  // closed, see above) would otherwise refuse to be indexed by the caller's
  // plain `string`. This assignment is sound in a way a cast to `Kind` would
  // not be -- it is not claiming `kind` IS one of the closed keys, only asking
  // an object typed for arbitrary string keys, same runtime lookup either way.
  const table: Record<string, NodeLabel> = LABEL_BY_KIND;
  const expected = table[kind];
  if (!expected) return true;
  try {
    return labelForNaturalId(id) === expected;
  } catch {
    // An unrecognised prefix is not this kind either, and at the MCP boundary
    // that has to be a `false` rather than a throw -- zod turns a `false` into
    // a message naming the field, and a throw into a crash.
    return false;
  }
}

export const ref = <K extends string>(kind: K, id: string): Ref<K> => {
  if (!isRefOfKind(kind, id)) {
    const table: Record<string, NodeLabel> = LABEL_BY_KIND;
    throw new Error(
      `${kind} handle expected a ${table[kind]} id, got "${id}" — pass the handle the act that minted it returned`,
    );
  }
  return id as Ref<K>;
};

export type ObservationsRef = Ref<"observations">;
export type QuestionRef = Ref<"question">;
export type CriterionRef = Ref<"criterion">;
export type NoteRef = Ref<"note">;

/**
 * One specific conclusion of an analysis.
 */
export interface ConclusionRef {
  analysis: AnalysisRef;
  proposition: string;
}
/**
 * What a computation read: recorded observations, or **another analysis's output**.
 */
export type InputRef = ObservationsRef | AnalysisRef;

export type GateRef = Ref<"gate">;
export type WorkRef = Ref<"work">;
export type AnalysisRef = Ref<"analysis">;
export type ReviewRef = Ref<"review">;
export type EnquiryRef = Ref<"enquiry">;

/**
 * A claim, by identity — never by its wording.
 */
export type ClaimRef = Ref<"claim">;

/** A finding, by identity. */
export type EvidenceRef = Ref<"evidence">;

/**
 * The inferential activity an analysis carried out — an `EvidenceUnit`.
 */
export type UnitRef = Ref<"unit">;

/** An evaluation of a criterion, by identity. */
export type EvaluationRef = Ref<"evaluation">;

/** A decision, by identity. */
export type DecisionRef = Ref<"decision">;

/**
 * What `recordObservations` produced.
 */
export interface RecordedObservations {
  observations: ObservationsRef;
  events: DomainEvent[];
}

/**
 * What `openEnquiry` produced. The `Question` is the half a caller needs to
 * `sharpen` or `accept` later.
 */
export interface OpenedEnquiry {
  enquiry: EnquiryRef;
  question: QuestionRef;
  events: DomainEvent[];
}

/**
 * What `sharpen` produced. The `Decision` holds the frozen what-was-known
 * snapshot, as it does for `closeEnquiry`, `promote`, `amendDesign` and
 * `reinterpret`.
 */
export interface SharpenedQuestion {
  question: QuestionRef;
  decision: DecisionRef;
  events: DomainEvent[];
}

/**
 * What `recordAnalysis` produced — the analysis, and **the claims it minted**.
 */
export interface RecordedAnalysis {
  analysis: AnalysisRef;
  claims: ConcludedClaim[];
  events: DomainEvent[];
}

/**
 * One claim an analysis minted: its handle, and the proposition it asserts.
 */
export interface ConcludedClaim {
  claim: ClaimRef;
  asserts: string;
  finding?: EvidenceRef;
}

/**
 * What each single-mint write verb produced — a name for the one thing the act minted, plus the
 * event that recorded it.
 */
export interface Posed {
  question: QuestionRef;
  events: DomainEvent[];
}
export interface Noted {
  note: NoteRef;
  events: DomainEvent[];
}
export interface Pursued {
  enquiry: EnquiryRef;
  events: DomainEvent[];
}
export interface RecordedReview {
  review: ReviewRef;
  events: DomainEvent[];
}
export interface ClosedEnquiry {
  decision: DecisionRef;
  events: DomainEvent[];
}
export interface StoppedWork {
  decision: DecisionRef;
  events: DomainEvent[];
}
export interface PlannedWork {
  work: WorkRef;
  events: DomainEvent[];
}
export interface StatedCriterion {
  criterion: CriterionRef;
  events: DomainEvent[];
}
export interface DeclaredGate {
  gate: GateRef;
  events: DomainEvent[];
}
export interface EvaluatedCriterion {
  evaluation: EvaluationRef;
  events: DomainEvent[];
}
export interface AcceptedAsUnresolved {
  decision: DecisionRef;
  events: DomainEvent[];
}
/** What `synthesise` produced: the claim drawn across the findings it rests on. */
export interface Synthesised {
  claim: ClaimRef;
  events: DomainEvent[];
}

export interface Restated {
  decision: DecisionRef;
  events: DomainEvent[];
}

/** What `undo` retracted — every handle the undone act created, now hidden from the ordinary read surface. */
export interface Undone {
  event: number;
  retracted: Ref<Kind>[];
  events: DomainEvent[];
}

/**
 * The inverse of {@link LABEL_BY_KIND} — a label's research-concept kind, where one exists. Not
 * every label has one (`EvidenceUnit` and `Computation` do not name a kind a caller would type
 * a verb argument as), so this is partial, not total.
 */
export const KIND_BY_LABEL: { readonly [L in NodeLabel]?: Kind } = Object.fromEntries(
  Object.entries(LABEL_BY_KIND).map(([kind, label]) => [label, kind]),
);

/**
 * The kind a handle's own prefix names, or `null` for text that is not shaped like one of this
 * record's ~97 mintable ids at all.
 */
export function kindOf(id: string): Kind | null {
  try {
    return KIND_BY_LABEL[labelForNaturalId(id)] ?? null;
  } catch {
    return null;
  }
}

/**
 * One record `search()` found containing the wording, and the text it matched on — not
 * necessarily the record's only `Prose` property, so a caller who wants to know *why* it
 * matched needs this, not just the handle.
 */
export interface SearchMatch {
  handle:
    | QuestionRef
    | EnquiryRef
    | EvidenceRef
    | DecisionRef
    | CriterionRef
    | EvaluationRef
    | GateRef
    | ReviewRef
    | WorkRef
    | NoteRef;
  wording: string;
}

/** Every match for one label, grouped — `search()` never flattens labels into one list. */
export interface SearchGroup {
  label: NodeLabel;
  matches: SearchMatch[];
}

/** One proposition an analysis concluded, and the finding that bears on it. */
export interface Conclusion {
  proposition: string;
  finding: string;
  /**
   * Which way the finding cuts. Defaults to `supports`.
   */
  bearing?: "supports" | "challenges";
  /**
   * Whether this proposition is being asserted as a confirmatory result.
   */
  standing?: "exploratory" | "confirmatory";
}

/**
 * The state of a **question** — resolved or not, and on what.
 */
export interface QuestionClosure {
  /** The question's identity, matching `QuestionStanding.question`. */
  question: QuestionRef;
  /** What it asks, in its own words. */
  asks: string;
  open: boolean;
  /**
   * `accepted-as-unresolved` means one thing: left open on purpose, with the
   * condition that would reopen it named. "Parked pending work" is a different
   * state and no verb writes it; it gets built when something needs it.
   */
  closure: "answered" | "abandoned" | "accepted-as-unresolved" | null;
  answer: "yes" | "no" | null;
  /**
   * The condition that would reopen an accepted question — "a genuinely new design, or a data
   * source other than the spent confirmatory set".
   */
  reopensIf?: string;
  /** Why it was accepted rather than pursued. Present with `reopensIf`. */
  acceptedBecause?: string;
  /**
   * The standing of the evidence a closure rests on. Present when the question is `answered`.
   */
  restsOn?: "exploratory" | "confirmatory";
  /** The findings the closing decision rests on. Empty means nothing was cited. */
  evidence: CitedFinding[];
}

/**
 * Where one line of enquiry stands.
 */
export interface EnquiryStatus {
  /** This line of enquiry. */
  enquiry: EnquiryRef;
  /** Its approach, in the researcher's words — what distinguishes it from a sibling pursuit. */
  pursuing: string;
  /**
   * What **this** pursuit has produced, whether or not it closed anything.
   */
  contributed: CitedFinding[];
  /**
   * The question this pursues, and where that question stands. `null` where no
   * question stands behind the enquiry.
   */
  question: QuestionClosure | null;
}

/** Which of `KnowledgeSurvey`'s five buckets a question currently sits in. */
export type QuestionBucket = "established" | "unresolved" | "untested" | "provisional" | "accepted";

/**
 * `EnquiryStatus`, alongside where this enquiry's own question currently sits in the overall
 * survey.
 */
export interface EnquiryInContext {
  enquiry: EnquiryStatus;
  standing: { question: QuestionRef; asks: string; bucket: QuestionBucket } | null;
}

/**
 * A proposition whose support changed when an analysis was replaced.
 */
export interface ChangedConclusion {
  proposition: string;
  /**
   * The claim that asserted this before, now withdrawn — the same record
   * `affected` names. Its wording is `proposition`; two records assert that
   * sentence after a replacement and only the handles tell them apart.
   */
  was: ClaimRef;
  before: string;
  /** The claim the replacement asserts in its place. */
  claim: ClaimRef;
  after: string;
}

/**
 * The answer to "replace this analysis and propagate whatever claims change."
 */
export interface ReplacementReport {
  at: string;
  /** The analysis this act brought into existence — what `conclude` is called on next. */
  replacement: AnalysisRef;
  /** The lineage decision recording that `replacement` revises `supersedes`. */
  decision: Ref<"decision">;
  /** The analysis being revised, echoed so a caller holds both ends of the lineage. */
  supersedes: AnalysisRef;
  /** The conclusions carried forward, exactly as the caller named them. */
  kept: ClaimRef[];
  /**
   * The conclusions this act superseded — everything the revised analysis concluded that was
   * not kept.
   */
  superseded: ConcludedClaim[];
  /**
   * The event this act recorded.
   */
  events: DomainEvent[];
}

export interface UnaffectedRecord {
  /** The record's handle, as the caller named it — observations, or an earlier analysis. */
  what: InputRef;
  /**
   * Present, and `true`, when this input was retracted by the very act being reported — the
   * replacement named the analysis it supersedes as its own input.
   */
  invalidated?: true;
  /** What it is, in the researcher's words. */
  named: string;
  why: string;
}

/**
 * Whether a gate may be relied on.
 */
export interface GateStatus {
  gate: GateRef;
  consequence: string;
  /**
   * Four states, because a gate can be governed by several conditions and "some checked, none
   * failing" is a real situation distinct from all three others. `blocked` takes precedence
   * over `incomplete`: a failure is decisive regardless of what else remains unrun.
   */
  state: "never-evaluated" | "incomplete" | "blocked" | "satisfied";
  /**
   * Every governing condition, itemised. `never-run` is a first-class value
   * rather than the absence of an entry: a failing check and one nobody
   * performed must be distinguishable.
   */
  checks: CheckStatus[];
  /**
   * How many checks are in each state — every state present, zero included.
   */
  counts: Record<CheckStatus["state"], number>;
  /** Conditions not currently passing — what would have to change. Named before anyone spends the compute. */
  unmet: UnmetCheck[];
  /** What is currently relying on this gate — the blast radius of a fake guard. */
  gating: GatedWork[];
  /**
   * Whether any evaluation of this criterion has ever come back `fail`.
   */
  everFailed: boolean;
}

export interface CheckStatus {
  /** Stable identity. Two criteria worded identically are two criteria. */
  criterion: CriterionRef;
  /**
   * The finding this check judges, when one criterion is applied to several.
   */
  about?: ClaimRef;
  /** Display text. Not an identity — see `criterion`. */
  proposition: string;
  /**
   * `no-standing-verdict` is the state between a check being found defective and its correction
   * being run: evaluations exist, and none of them still stands. It is emphatically not `never-
   * run` — the check ran, and `decidedBy` being absent is not evidence that it did not.
   */
  state: "passed" | "failed" | "never-run" | "no-standing-verdict";
  /**
   * The evaluation that decided `state` — the failing one where a check
   * failed, since failure is decisive. Absent for a check never run.
   */
  decidedBy?: DecidingEvaluation;
}

/**
 * Which evaluation decided a check, and when — **without its `value`**.
 */
export interface DecidingEvaluation {
  evaluation: EvaluationRef;
  outcome: "pass" | "fail";
  at: string;
  /**
   * The finding this verdict judged, when one criterion is applied to several.
   */
  about?: ClaimRef;
}

export interface EvaluationRecord {
  /**
   * This evaluation's handle.
   */
  evaluation: EvaluationRef;
  /** The criterion this evaluated — the flattened list loses it otherwise. */
  criterion: CriterionRef;
  value: string;
  outcome: "pass" | "fail";
  at: string;
  /**
   * Present, and `true`, when everything this verdict was reached against has since been
   * withdrawn — the check was found to be faulty and replaced, not merely re-run.
   */
  withdrawn?: true;
  /**
   * The finding this verdict judged, when one criterion is applied to several.
   */
  about?: ClaimRef;
  /**
   * The findings this evaluation was carried out against.
   */
  basis: CitedFinding[];
}

/**
 * What a re-run did and did not establish about a historical result.
 */
export interface ReproductionReport {
  /** The verifying analysis's handle. */
  verification: AnalysisRef;
  /** What it did. */
  verificationMethod: string;
  /** The analysis it re-checked, by handle. */
  of: AnalysisRef;
  /** What that one did. */
  ofMethod: string;
  /** Whether the re-run reached the same conclusion. Says nothing about how. */
  conclusion: "agrees" | "disagrees";
  /**
   * What each run read, **in the order it was given**.
   */
  verificationRead: IdentifiedArtefact[];
  /** The same, for the analysis being re-checked. Empty when it recorded nothing. */
  ofRead: IdentifiedArtefact[];
  /**
   * What the two runs did not share. `unrecorded-in-the-original` is **not**
   * the same as `changed`: nobody wrote the original's conditions down, so the
   * two are not known to differ and not known to agree.
   */
  differs: Array<{
    /**
     * The input, identified — not a bare name.
     */
    what: IdentifiedArtefact;
    standing: "unrecorded-in-the-original" | "changed" | "not-used-by-the-re-run";
  }>;
  /** Which way the re-run cuts for the historical claim. */
  bearing: "raises" | "lowers";
}

/**
 * An artefact in a report: what it is, and what it is called.
 */
export interface IdentifiedArtefact {
  /** The observations handle — identity, and the only thing that is. */
  part: ObservationsRef;
  /** Its `logical_name`. Two parts may legitimately share one. */
  name: string;
  /**
   * Present, and `true`, when the record itself marks this artefact retracted.
   */
  invalidated?: true;
}

/**
 * How much of a past construction can be rebuilt.
 */
export interface ReproducibilityReport {
  /** The construction this answer is about. */
  analysis: AnalysisRef;
  /** Parts whose recorded hash matches the one offered. */
  exact: IdentifiedArtefact[];
  /** Parts whose recorded hash disagrees with the one offered. */
  differing: IdentifiedArtefact[];
  /** Parts with no recorded hash — unanswerable, not unequal. */
  unverifiable: IdentifiedArtefact[];
  /**
   * Parts this attempt did not rebuild.
   */
  notRebuilt: IdentifiedArtefact[];
  /**
   * Whether the whole construction reproduces. False unless every part was rebuilt and matched:
   * anything differing, unverifiable or not attempted leaves the construction unshown, and this
   * is the field that must not quietly say otherwise.
   */
  reproducible: boolean;
}

/** What `reverify()` recorded. */
export interface VerificationReport {
  at: string;
  /** The analysis this act created — row AB, asked of a return type. */
  verification: AnalysisRef;
  /** The historical analysis it re-checked. */
  of: AnalysisRef;
  /**
   * The claim the re-verification minted.
   */
  claims: ConcludedClaim[];
  /** The event this act recorded — `events[0].created` names the output artefact. */
  events: DomainEvent[];
}

/**
 * A claim reached by `whatDependsOn`, identified as well as quoted.
 */
export interface AffectedClaim {
  claim: ClaimRef;
  asserts: string;
}

/**
 * A finding, identified as well as quoted.
 */
export interface CitedFinding {
  evidence: EvidenceRef;
  states: string;
}

/**
 * A finding bearing on a claim, with the analysis that produced it.
 */
export interface BearingFinding {
  finding: string;
  evidence: EvidenceRef;
  method: string;
  analysis: AnalysisRef;
}

/** A confirmatory result behind a gate: the claim's handle, and what it asserts. */
export interface ConfirmatoryResult {
  claim: ClaimRef;
  asserts: string;
}

/** A question closed on the strength of a reading: its handle, and what it asks. */
export interface DecidedQuestion {
  question: QuestionRef;
  asks: string;
}

/** Work a gate protects: the task's handle, and its objective. */
export interface GatedWork {
  work: WorkRef;
  objective: string;
}

/** The claim that replaced a withdrawn one: its handle, and what it now asserts. */
export interface ReplacementClaim {
  claim: ClaimRef;
  asserts: string;
}

/**
 * Whether one claim still stands, and what the record puts in its place.
 */
export interface ClaimStanding {
  withdrawn: boolean;
  by: DecisionRef[];
  insteadOf: ConcludedClaim[];
}

/** An unmet check: the criterion's handle, and what it requires. */
export interface UnmetCheck {
  criterion: CriterionRef;
  requires: string;
  /**
   * What this unmet check is holding up, if anything.
   */
  blocks: BlockedWork[];
}

/** A gate an unmet check is holding, and the work that gate protects. */
export interface BlockedWork {
  gate: GateRef;
  /** What not passing means, in the words of whoever declared the gate. */
  consequence: string;
  /** The work this gate protects. Empty where it guards nothing yet. */
  gating: GatedWork[];
}

/**
 * A prespecified condition, by handle and by wording.
 */
export interface Condition {
  criterion: CriterionRef;
  requires: string;
}

/** An analysis that re-verified a finding. */
export interface Reverification {
  analysis: AnalysisRef;
  method: string;
}

/** A line of enquiry reached by `whatDependsOn`. `enquiry` is the handle, `pursuing` its approach. */
export interface AffectedEnquiry {
  enquiry: EnquiryRef;
  pursuing: string;
}

/**
 * What is affected if this record turns out to be wrong — and, deliberately, a statement that
 * the answer is a **lower bound**.
 */
export interface DependencyReport {
  /**
   * The artefact this answer is about.
   */
  subject: ObservationsRef;
  /** Claims found to rest on the subject, supporting or challenging. */
  claims: AffectedClaim[];
  /** Lines of enquiry found to reach it. */
  enquiries: AffectedEnquiry[];
  /**
   * The routes actually walked, named so a reader knows what was considered.
   */
  routesWalked: string[];
  /**
   * Always `false`, and it is a type-level statement rather than a flag.
   */
  complete: false;
}

/**
 * Where a proposition stands on the evidence, as one word.
 */
export type Verdict =
  | "supported"
  | "undecided"
  | "withdrawn"
  | "challenged"
  | "drawn-across"
  | "standard-unmet"
  | "unexamined";

/**
 * The one derivation of {@link Verdict}, from the fields that carry it.
 */
export function verdictOf(of: {
  support: readonly unknown[];
  withdrawn: boolean;
  unmet: readonly unknown[];
  undecided: boolean;
  challenged: boolean;
  drawnAcross: readonly unknown[];
}): Verdict {
  if (of.support.length > 0 && !of.withdrawn && of.unmet.length === 0 && !of.undecided)
    return "supported";
  if (of.undecided) return "undecided";
  if (of.withdrawn) return "withdrawn";
  if (of.challenged) return "challenged";
  // A synthesis measured nothing, so it reaches here with no support of its
  // own; a claim an analysis concluded has an empty `drawnAcross` and cannot.
  if (of.drawnAcross.length > 0 && of.support.length === 0) return "drawn-across";
  // The two the bit could not tell apart, and the CLI could not either: it
  // printed a bare "NOT supported" for both. Evidence held to a standard it
  // fails is not evidence nobody has looked for.
  return of.unmet.length > 0 ? "standard-unmet" : "unexamined";
}

/** The answer to "why does this conclusion count as supported?" */
export interface SupportExplanation {
  /**
   * The claim this answer is about.
   */
  claim: ClaimRef;
  proposition: string;
  /**
   * Where the proposition stands on the evidence, in one word.
   */
  verdict: Verdict;
  /**
   * The claim's own standing: `confirmatory` if it was recorded as prespecified **or** promoted
   * afterwards, `exploratory` until one of those happens, `undecided` if a finding settles it
   * neither way.
   */
  standing: "exploratory" | "confirmatory" | "undecided";
  /** Why it was promoted. Present only when `standing` is `confirmatory`. */
  promotedBecause?: string;
  /** Findings currently supporting the proposition, each with the analysis that produced it. */
  support: BearingFinding[];
  /**
   * The findings this claim was drawn across, when it is a synthesis (`synthesise`) — each by
   * handle and wording.
   */
  drawnAcross: ConfirmatoryResult[];
  /**
   * Analyses that re-checked a supporting finding without reproducing its execution, by method.
   */
  reverifiedBy: Reverification[];
  /**
   * The prespecified conditions the supporting analyses were held to, itemised the same way a
   * gate's are — `recordAnalysis({ heldTo })`.
   */
  standard: CheckStatus[];
  /**
   * The conditions in `standard` not currently passing — what would have to
   * change for the finding to stand. A check nobody ran counts, exactly as it
   * does for a gate.
   */
  unmet: UnmetCheck[];
  /**
   * Observations the supporting findings ultimately rest on — **identified**, not named.
   */
  restingOn: IdentifiedArtefact[];
  /** Findings withdrawn because their analysis was revised. Either bearing. */
  superseded: Array<BearingFinding & { reason: string; bearing: "supports" | "challenges" }>;
  /**
   * Whether any finding bears *against* this proposition.
   */
  challenged: boolean;
  against: BearingFinding[];
  /**
   * Whether the record has stopped claiming this at all.
   */
  withdrawn: boolean;
  /** The interpretation that replaced it, if one did. */
  replacedBy?: ReplacementClaim;
}

/**
 * What the record held at a stated moment — the as-of view (row Z).
 */
export interface HistoricalSurvey {
  /** The instant asked about, echoed back so an answer cannot be mistaken for the present. */
  at: string;
  /** Resolved by then, on a finding promoted by then. */
  established: QuestionStanding[];
  /** Resolved by then, on a finding nothing had promoted yet. */
  provisional: QuestionStanding[];
  /** Accepted as unresolved by then (S-14). */
  accepted: QuestionStanding[];
  /**
   * Neither resolved nor accepted by then.
   */
  open: QuestionStanding[];
}

/**
 * A question on the record. `question` is its identity; `asks` is what it says. The two are
 * kept apart deliberately: one question may be pursued two ways, and two questions may be
 * worded identically.
 */
export interface QuestionStanding {
  question: QuestionRef;
  asks: string;
}

/**
 * `QuestionStanding`, plus what would reopen it — carried on `KnowledgeSurvey.accepted`: a
 * deliberately-open list without the condition that would reopen each item is a list nobody can
 * act on.
 */
export interface AcceptedQuestion extends QuestionStanding {
  reopensIf: string;
  acceptedBecause: string;
}

/**
 * `QuestionStanding`, plus the claim that answers it and which way it cuts — carried on
 * `KnowledgeSurvey.established`/`.provisional`: both buckets are "answered", differing only in
 * whether the answer met the standard it was held to and was promoted, and both the claim and
 * the polarity are what `whatIsKnown` already resolved to decide which bucket to place the
 * question in and which bearing (`SUPPORTS`/`CHALLENGES`) answered it.
 */
export interface AnsweredQuestion extends QuestionStanding {
  claim: ClaimRef;
  answer: "yes" | "no";
  /**
   * Present when this question had been left open on purpose before it was answered — the same
   * pair `AcceptedQuestion` carries, from the same `DEFERS` decision.
   */
  acceptedBecause?: string;
  reopensIf?: string;
}

/**
 * What the programme knows, in more states than settled-or-not. The buckets are the fields
 * below, and their count is deliberately not written here.
 */
export interface KnowledgeSurvey {
  /**
   * Settled on cited evidence. Polarity is not here — an answered "no" is
   * still settled; see `EnquiryStatus.answer`. `AnsweredQuestion`, not
   * `QuestionStanding` — see its own doc comment.
   */
  established: AnsweredQuestion[];
  /** Something has been run against it, and nothing settles it. */
  unresolved: QuestionStanding[];
  /**
   * Nothing has ever been run against it — pursued or not. Not a failure and
   * not an inconclusive result. Opening a line of enquiry does not move a
   * question out of here; recording observations or an analysis under one does.
   */
  untested: QuestionStanding[];
  /**
   * Answered, but not on something to build on — **for either of two reasons**, and the bucket
   * deliberately holds both.
   */
  provisional: AnsweredQuestion[];
  /**
   * Open on purpose. Worked on, not settled, and deliberately left — with the condition that
   * would reopen it recorded on the deciding act.
   */
  accepted: AcceptedQuestion[];
}

/**
 * Where a question came from, when it came from sharpening an earlier one.
 */
export interface QuestionOrigin {
  /**
   * Which kind of origin this is: a question narrowed from an earlier one, or a question posed
   * out of a note somebody wrote before there was anything to ask.
   */
  kind: "sharpened" | "noted";
  /** Identity of the record it came out of. */
  from: QuestionRef | NoteRef;
  /** What that record said, in its own words. */
  said: string;
  /** Why it was sharpened. `null` for a note: posing from a hunch records no reason. */
  reason: string | null;
  /** What was known when it was sharpened. Empty for a note, which cites nothing. */
  knownAtTheTime: CitedFinding[];
}

/**
 * What an amendment to a locked design did.
 */
export interface AmendmentReport {
  at: string;
  amendment: DecisionRef;
  /** The setting as it stood, in its own words. Still readable afterwards — amending is not editing. */
  replaced: Condition;
  nowRequires: Condition;
  /** Work the amended condition protected, and which therefore has to be run again. Enumerated, not "everything downstream". */
  rerun: GatedWork[];
  /** Confirmatory results in the blast radius. Empty is the claim "none", and it is computed rather than assumed. */
  confirmatoryAffected: ConfirmatoryResult[];
  nature: "mechanical" | "scientific";
  events: DomainEvent[];
}

/** One amendment in a design's history, as read back long afterwards. */
export interface AmendmentRecord {
  amendment: DecisionRef;
  replaced: Condition;
  nowRequires: Condition;
  reason: string;
  /** The findings the amendment was actually taken on — cited specifically, not a snapshot of everything known. */
  citing: CitedFinding[];
  rerun: GatedWork[];
  nature: "mechanical" | "scientific";
}

/**
 * One locked condition and everything that has happened to it.
 */
export interface ConditionHistory {
  /** What this condition said before anyone amended it. */
  originally: Condition;
  nowRequires: Condition;
  /** The condition currently in force, for amending again. */
  criterion: CriterionRef;
  amendments: AmendmentRecord[];
}

/** A gate's locked design: one entry per condition it is governed by. */
export interface DesignHistory {
  gate: GateRef;
  conditions: ConditionHistory[];
}

/**
 * What a reinterpretation did.
 */
export interface ReinterpretationReport {
  at: string;
  /**
   * The claims that stopped standing — **plural**, and that is the point.
   */
  previously: ConcludedClaim[];
  /** The narrower claim this act minted. */
  nowClaims: ConcludedClaim;
  /** Findings that carried the old reading and carry the new one. Unchanged, and demonstrably so. */
  evidenceStanding: CitedFinding[];
  /** Things decided on the strength of the old sentence — not things computed from the numbers. */
  restingOnTheOldReading: DecidedQuestion[];
  requiresRecomputation: boolean;
  /**
   * The event this act recorded. `events[0].created` names the `Review` and the
   * `Decision` it minted, so neither needs a dedicated field here.
   */
  events: DomainEvent[];
}

/** One revision of an interpretation, read back long afterwards. */
export interface Revision {
  revision: DecisionRef;
  /** Every claim this decision withdrew — plural for the reason {@link ReinterpretationReport.previously} is. */
  previously: ConcludedClaim[];
  /** What the decision put in their place. */
  nowClaims: ConcludedClaim;
  reason: string;
  restingOnTheOldReading: DecidedQuestion[];
}

/**
 * An interpretation and everything it has been through, oldest first.
 */
export interface InterpretationHistory {
  /** Every reading this history started from: the claims the walk reached that no revision produced. */
  originally: ConcludedClaim[];
  /** The claim asked about. */
  nowClaims: ConcludedClaim;
  revisions: Revision[];
}

/** One side of a comparison between two findings. */
export interface ConflictSide {
  /** The claim's handle. Two sides can assert the same sentence about different endpoints. */
  claim: ClaimRef;
  /** The question this side's line of enquiry pursues. */
  question: QuestionRef;
  proposition: string;
  /** The question this claim answers. Where its scope lives — derived, not stored on the claim. */
  asks: string;
  supportedBy: CitedFinding[];
  challengedBy: CitedFinding[];
}

/**
 * Whether two findings actually conflict.
 */
export interface ConflictVerdict {
  conflict: boolean;
  relation: "contradiction" | "dissociation" | "corroboration";
  /**
   * Why this is not a contradiction, when it is not. `"scope"` means the two
   * answer different questions — which is also the answer to "what would make
   * this a genuine contradiction": the same scope.
   */
  differsBy: "scope" | null;
  sides: ConflictSide[];
}

/**
 * The line of enquiry, and the question behind it, that a task exists to advance.
 */
export interface Addressing {
  enquiry: EnquiryRef;
  pursuing: string;
  question: QuestionRef;
  asks: string;
}

/**
 * What a planned task is permitted to touch.
 */
export interface TaskContract {
  /** The work's handle. `GateStatus.gating` names the same entity as `{work, objective}`. */
  work: WorkRef;
  objective: string;
  acceptance: string;
  mayRead: string[];
  enforced: false;
  /** Absent, not `null`, when `planWork` was not told one. Ungated work is a genuine case. */
  addressing?: Addressing;
}

/**
 * One gate in a list of them, with the state a reader is filtering on.
 */
export interface ListedGate {
  gate: GateRef;
  consequence: string;
  state: GateStatus["state"];
}

/** Why a piece of work is not being done, and the act that said so. */
export interface StoppedReason {
  decision: DecisionRef;
  because: string;
  at: string;
}

/**
 * What a task's state can be, computed from the graph and never stored.
 */
export type WorkState = "planned" | "waiting" | "blocked" | "carried-out" | "abandoned";

/**
 * One task in a list of them.
 */
export interface ListedWork {
  work: WorkRef;
  objective: string;
  state: WorkState;
  gates: GateRef[];
}

/**
 * One record a `why` explanation cites, and what it says — the shape `because` is built from.
 */
export interface Cause {
  handle: Ref<Kind>;
  wording: string;
  when?: string;
}

/**
 * `why <handle>` — a mini-app dispatching on the handle's own kind, over reports that already
 * exist. Not new queries: a report is the plan, `why` renders it as causes (Postgres `EXPLAIN`,
 * for *why*).
 */
export interface ClaimExplanation {
  kind: "claim";
  subject: ClaimRef;
  is: string;
  because: Cause[];
  report: SupportExplanation;
}
export interface WorkExplanation {
  kind: "work";
  subject: WorkRef;
  is: string;
  because: Cause[];
  report: TaskContract;
}
export interface EnquiryExplanation {
  kind: "enquiry";
  subject: EnquiryRef;
  is: string;
  because: Cause[];
  report: EnquiryInContext;
}
export interface GateExplanation {
  kind: "gate";
  subject: GateRef;
  is: string;
  because: Cause[];
  report: GateStatus;
}
export interface AnalysisExplanation {
  kind: "analysis";
  subject: AnalysisRef;
  is: string;
  because: Cause[];
  report: AnalysisRevision;
}
/**
 * What one condition requires, what it has been evaluated to, and what it governs.
 */
export interface CriterionStanding {
  criterion: CriterionRef;
  /** The condition's own wording. */
  requires: string;
  /** Its state across every gate, not scoped to one — see `evaluations`. */
  state: CheckStatus["state"];
  /**
   * Every evaluation of this criterion, oldest first, whatever gate it was
   * run for. A criterion can govern several and be evaluated separately
   * against each, so this is deliberately wider than any one gate's view.
   */
  evaluations: EvaluationRecord[];
  /** The gates this condition governs, and what each protects. */
  governs: GateGoverned[];
}

/** One gate a criterion governs, and the work that gate protects. */
export interface GateGoverned {
  gate: GateRef;
  consequence: string;
  protecting: GatedWork[];
}

export interface CriterionExplanation {
  kind: "criterion";
  subject: CriterionRef;
  is: string;
  because: Cause[];
  report: CriterionStanding;
}

/**
 * The kinds `why` answers from the graph itself rather than from a report.
 */
export type WalkedKind =
  | "question"
  | "unit"
  | "evidence"
  | "decision"
  | "evaluation"
  | "review"
  | "observations"
  | "note";

/**
 * `why` over a kind the record answers structurally.
 */
export interface WalkExplanation {
  kind: WalkedKind;
  subject: AnyRef;
  is: string;
  because: Cause[];
}

export type Explanation =
  | WalkExplanation
  | ClaimExplanation
  | CriterionExplanation
  | WorkExplanation
  | EnquiryExplanation
  | GateExplanation
  | AnalysisExplanation;

/**
 * What an analysis revised, and which of the earlier findings actually moved.
 */
export interface AnalysisRevision {
  analysis: AnalysisRef;
  supersedes?: AnalysisRef;
  because?: { review: ReviewRef; verdict: string };
  /**
   * Superseded findings whose wording actually moved — the re-analysis reached
   * a different answer.
   */
  changed: RevisedFinding[];
  /**
   * Superseded findings the re-analysis reached again unchanged.
   */
  restated: ConcludedClaim[];
  /**
   * Conclusions the revision carried forward, and which still stand.
   */
  kept: ConcludedClaim[];
  /**
   * Superseded findings with no successor this read could identify.
   */
  unpaired: ConcludedClaim[];
}

/** One superseded finding and the one standing in its place. */
export interface RevisedFinding {
  proposition: string;
  was: ClaimRef;
  before: string;
  claim: ClaimRef;
  after: string;
}

/**
 * "What am I blocked on right now, what are my priorities?" Literally the composition of reads
 * that already exist — `gateList`, `workList`, `whatIsKnown` — never a private helper, so a
 * section that needs a query nothing else has yet shows up as a signature change the coverage
 * tests already police.
 */
export interface Standing {
  /** Gates currently blocking work, and the work each protects — two reads, not a join. */
  blocked: { gates: ListedGate[]; work: ListedWork[] };
  /**
   * Gates nobody has finished checking — `never-evaluated` or `incomplete` — and the work
   * waiting behind them. Same shape as `blocked`: the work is not ready and is not blocked, and
   * a list that dropped it under either would be wrong about it.
   */
  unevaluated: { gates: ListedGate[]; work: ListedWork[] };
  /** Work with nothing recorded against it and nothing in its way — what is ready to start. */
  untouched: ListedWork[];
  /** Where every question currently stands. */
  known: KnowledgeSurvey;
  /**
   * How much of the record was read off something. **The whole record, in both readings**: the
   * sections above narrow to what moved since a cursor, and a count that narrowed with them
   * would be a different number under the same name.
   */
  transcribed: Transcription;
  /** This read's position in the event stream — what `now({since})` takes next. */
  seq: number;
  /**
   * The cursor this answer was asked from. Absent means this is the full standing; present
   * means every section above has already been narrowed to what a touched handle appears in
   * since that cursor — presence *is* the "moved" marker, not a per-item flag repeating it.
   */
  since?: number;
}

/**
 * How much of a record was read off something rather than performed. `acts` is every act on the
 * record; the difference is acts nobody sourced, which is **not** the same as acts somebody
 * watched — no process can observe that, and naming the remainder would claim it.
 */
export interface Transcription {
  transcribed: number;
  acts: number;
}
