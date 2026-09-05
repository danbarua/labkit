import { labelForNaturalId, type NodeLabel } from "../db/domain";
import type { DomainEvent } from "./events";

/**
 * What the domain layer hands back — research answers, not graph rows.
 *
 * Every type here answers a question a researcher asked. That direction
 * matters: a question with no natural home in these types means the API is
 * wrong, not the question. Nothing here mentions a node or edge label.
 */

declare const KIND: unique symbol;

/**
 * A handle a caller passes back in — LabKit's short natural id, and nothing
 * else. Never AGE's internal graphid.
 *
 * **It *is* the id.** The brand exists only at compile time; at runtime a
 * `GateRef` is the string `"GATE_1"`. Two things follow, and both are the
 * reason it is a string rather than a `{ kind, id }` object:
 *
 * - **`===` is value equality.** Comparing two handles of the same kind
 *   compares the ids; comparing two *different* kinds is a compile error
 *   rather than a silent `false`.
 * - **A handle binds directly as a Cypher parameter.** Params are
 *   `Record<string, unknown>`, so an object would type-check and match no rows.
 *
 * The brand is **non-optional**, which is what makes this nominal: a plain
 * `string` is not assignable to a `Ref`, and a `GateRef` is not assignable to a
 * `ClaimRef`. {@link ref} is the only way to mint one.
 *
 * What it costs: `kind` is no longer a field to read at runtime. Nothing is
 * lost, because it never was the source of truth — `createEdge` has always
 * resolved an endpoint's label from the id's prefix, and
 * `ref("claim", "GATE_1")` was constructible under the old shape.
 * Here that state cannot be written down.
 */
export type Ref<K extends string> = string & { readonly [KIND]: K };

/**
 * Which node label each handle kind names.
 *
 * Needed because the kinds are **research concepts, not labels** — a caller
 * says *analysis* and means a `Computation`, *observations* and means an
 * `Artefact`, *work* and means a `Task`. Five of the fourteen differ, so the
 * mapping has to be written down rather than derived from the name.
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
 *
 * **`satisfies`, not a `: Record<string, NodeLabel>` annotation**, and that is
 * what keeps it closed: the annotation erases the literal keys, leaving
 * `keyof typeof LABEL_BY_KIND` as `string` with nowhere for a total
 * `Record<Kind, …>` table to be checked against.
 */
export type Kind = keyof typeof LABEL_BY_KIND;

/**
 * A handle of any kind — every {@link Ref} this record can mint, in one type.
 *
 * For a parameter whose kind is not known until it is inspected, such as
 * `why`'s subject. `check:no-stringly-typed` reads the written type node
 * rather than resolving it, so this passes where a bare `string` would be
 * flagged — without an allowlist entry for a parameter that does name a record.
 */
export type AnyRef = Ref<Kind>;

/**
 * Builds a handle, and **refuses one whose id does not match its kind**.
 *
 * That refusal is the point of keeping `kind` as an argument at all: the two
 * halves cannot disagree in the type, and this stops them disagreeing at the
 * moment of minting. It costs one prefix lookup at each of
 * the ~97 sites that mint a handle.
 *
 * It throws rather than returning a result type: every caller is inside the
 * domain layer, mints from a `natural_id` it just read out of the graph, and
 * has no sensible recovery. A throw here means the graph returned something the
 * label it was matched on says it cannot be.
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
 * One specific conclusion of an analysis. Closing a question cites *this*,
 * not the whole analysis: an analysis can support the proposition answering
 * one question while challenging a secondary one, and "any cited finding
 * challenges anything" is too coarse to derive polarity from.
 */
export interface ConclusionRef {
  analysis: AnalysisRef;
  proposition: string;
}
/**
 * What a computation read: recorded observations, or **another analysis's
 * output**.
 *
 * One type for all three verbs that record a run. They disagreed: only
 * `recordAnalysis` took the union, while `replaceAnalysis` and `reverify` took
 * observations alone — and all three write the same `Computation -CONSUMES->
 * Artefact` edge, so the narrower two were refusing something the model
 * represents. An agent that recorded stage two holds its `COMP_` id and never
 * the `ART_` id underneath it, so replacing that stage over MCP failed with
 * `CONSUMES does not allow Computation -> Computation`; the workaround was to
 * ask why a claim was supported in order to learn what a computation had read.
 *
 * No new edge, for the reason `recordAnalysis` did not need one either: an
 * analysis output is an `Artefact` like any other, and the dereference from
 * computation to its output is one hop the write side already makes.
 */
export type InputRef = ObservationsRef | AnalysisRef;

export type GateRef = Ref<"gate">;
export type WorkRef = Ref<"work">;
export type AnalysisRef = Ref<"analysis">;
export type ReviewRef = Ref<"review">;
export type EnquiryRef = Ref<"enquiry">;

/**
 * A claim, by identity — never by its wording.
 *
 * Two claims can assert the same sentence about different endpoints, so the
 * handle is the only thing that names one. {@link ConclusionRef} is an *input*
 * convenience for a caller who has just run an analysis and does not hold the
 * claim id yet; every report hands back one of these.
 */
export type ClaimRef = Ref<"claim">;

/** A finding, by identity. */
export type EvidenceRef = Ref<"evidence">;

/**
 * The inferential activity an analysis carried out — an `EvidenceUnit`.
 *
 * Nothing outside the write surface names one: a caller says *analysis* and
 * means the `Computation`, while the unit is what `EVALUATES` and `IMPLEMENTS`
 * point at.
 *
 * Kind `"unit"`, not `"evidenceUnit"` — the kinds name research concepts rather
 * than labels throughout (`observations` for `Artefact`, `analysis` for
 * `Computation`, `work` for `Task`).
 */
export type UnitRef = Ref<"unit">;

/** An evaluation of a criterion, by identity. */
export type EvaluationRef = Ref<"evaluation">;

/** A decision, by identity. */
export type DecisionRef = Ref<"decision">;

/**
 * What `recordObservations` produced.
 *
 * `evidence` is not named here — it is what `events[0].created` carries, and a
 * second copy is a second thing to keep in step. `observations` stays because
 * it is what the caller asked to create, and the one thing every reader of
 * this return wants without going via the event.
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
 *
 * A caller holds a {@link ClaimRef} the moment the claim exists, so it never
 * has to describe one by wording to refer to it again.
 *
 * The output artefact is not named here: it is `events[0].created`'s other
 * member. `outputArtefactOf()` resolves *other* analyses' artefacts, which
 * this act's own event cannot supply.
 */
export interface RecordedAnalysis {
  analysis: AnalysisRef;
  claims: ConcludedClaim[];
  events: DomainEvent[];
}

/**
 * One claim an analysis minted: its handle, and the proposition it asserts.
 *
 * `finding` is optional where `claim`/`asserts` are not. A verb that mints one
 * `Evidence` per conclusion names it directly; a claim reached by wording
 * (`claimsAsserting`) or one narrowing several prior findings into a single
 * reading (`reinterpret`'s `nowClaims`) has no single canonical finding, and
 * `evidenceStanding` lists them instead. Absent rather than guessed at.
 */
export interface ConcludedClaim {
  claim: ClaimRef;
  asserts: string;
  finding?: EvidenceRef;
}

/**
 * What each single-mint write verb produced — a name for the one thing the act
 * minted, plus the event that recorded it.
 *
 * `events` is on every one of them rather than case-by-case: *did my write land
 * as event 103* is the same question whichever verb was called, and a surface
 * where some verbs answer it and others do not is one a caller has to learn
 * verb by verb.
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
export interface Restated {
  decision: DecisionRef;
  events: DomainEvent[];
}

/**
 * The inverse of {@link LABEL_BY_KIND} — a label's research-concept kind,
 * where one exists. Not every label has one (`EvidenceUnit` and `Computation`
 * do not name a kind a caller would type a verb argument as), so this is
 * partial, not total.
 *
 * Built rather than hand-duplicated: `LABEL_BY_KIND` is the one place the
 * thirteen-way mapping is written down, and a second table would be the same
 * fact stated twice, in the direction that fails silently — an entry here
 * with no matching entry there would mint a `Ref` `isRefOfKind` could never
 * agree with.
 */
export const KIND_BY_LABEL: { readonly [L in NodeLabel]?: Kind } = Object.fromEntries(
  Object.entries(LABEL_BY_KIND).map(([kind, label]) => [label, kind]),
);

/**
 * The kind a handle's own prefix names, or `null` for text that is not
 * shaped like one of this record's ~97 mintable ids at all.
 *
 * For dispatching on a handle's kind, which needs to tell "a handle of a kind
 * I don't explain yet" apart from "ordinary prose, look it up by wording".
 * `isRefOfKind` answers only "is this ONE kind", which cannot make that
 * distinction without being called once per kind.
 */
export function kindOf(id: string): Kind | null {
  try {
    return KIND_BY_LABEL[labelForNaturalId(id)] ?? null;
  } catch {
    return null;
  }
}

/**
 * One record `search()` found containing the wording, and the text it
 * matched on — not necessarily the record's only `Prose` property, so a
 * caller who wants to know *why* it matched needs this, not just the
 * handle.
 *
 * `handle` is a proper `Ref` — a union of every kind {@link SEARCHABLE_TEXT}
 * names a label for — rather than a bare string, because every handle in a
 * report is one. {@link SearchGroup} narrows to a single label per group, so
 * the kind is never mixed within one `matches` array, only across groups.
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
   *
   * A null result is not an absence of evidence — "all five constructions
   * within 0.02 of each other" is a finding, and it bears against a
   * specificity claim. That is what `challenges` is for.
   */
  bearing?: "supports" | "challenges";
  /**
   * Whether this proposition is being asserted as a confirmatory result.
   *
   * **Defaults to `exploratory`, and the default is the point.** If everything
   * were confirmatory a solver diagnosis and a prespecified comparison would be
   * indistinguishable, and an amendment touching only feasibility work would
   * report itself as compromising a confirmatory result — a false p-hacking
   * alarm rather than an empty answer. Confirmatory standing is claimed
   * deliberately or not at all.
   *
   * **Declared here, or conferred later, for different work.** Declaring is
   * prespecification: saying before the run that this is the confirmatory
   * comparison, which is what a locked design locks. Work that could not have
   * said it — scratch, captured before anyone knew it mattered — is promoted
   * afterwards by `ResearchSession.promote()` and pays for the lateness with a
   * recorded reason. Declaring *after* the fact is the
   * move neither path allows.
   */
  standing?: "exploratory" | "confirmatory";
}

/**
 * The state of a **question** — resolved or not, and on what.
 *
 * `closure` distinguishes three things that must not collapse into one: a
 * question that was **answered** on evidence, one **abandoned** without any,
 * and one **accepted as unresolved**. `answer` carries polarity — a question
 * can be answered "no" and that is a substantive result, not a failure.
 *
 * Separate from {@link EnquiryStatus} because a question may be pursued more
 * than once and its closure belongs to the question, not to whichever pursuit
 * reached it. **Nested rather than flattened**: flattened, every pursuit of an
 * answered question reports *itself* answered and offers the closing evidence
 * as its own, so a caller summing findings across pursuits counts one twice.
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
   * The condition that would reopen an accepted question — "a genuinely new
   * design, or a data source other than the spent confirmatory set".
   *
   * Carried on the accepting decision's `invalidation_check`, which already
   * meant exactly this: what would make this decision wrong. Present only when
   * `closure` is `accepted-as-unresolved`; a question left open by inaction
   * names no condition, and that is the difference between deciding to stop and
   * not having got there.
   */
  reopensIf?: string;
  /** Why it was accepted rather than pursued. Present with `reopensIf`. */
  acceptedBecause?: string;
  /**
   * The standing of the evidence a closure rests on. Present when the question
   * is `answered`.
   *
   * `exploratory` does not mean the answer is wrong — it means nothing has
   * promoted what it rests on, and a reader deciding whether to build on it
   * should know that without having to go and look.
   */
  restsOn?: "exploratory" | "confirmatory";
  /** The findings the closing decision rests on. Empty means nothing was cited. */
  evidence: CitedFinding[];
}

/**
 * Where one line of enquiry stands.
 *
 * Everything at this level is true **of the enquiry**. The question's state is
 * under `question`, where it cannot be mistaken for this pursuit's own. Without
 * that separation the report asserts of a pursuit four things that belong to
 * the question, including of one that has produced nothing.
 */
export interface EnquiryStatus {
  /** This line of enquiry. */
  enquiry: EnquiryRef;
  /** Its approach, in the researcher's words — what distinguishes it from a sibling pursuit. */
  pursuing: string;
  /**
   * What **this** pursuit has produced, whether or not it closed anything.
   *
   * The answer to *"where is my ablation up to?"*. Empty means nothing has been
   * recorded against it, which is a real answer and distinct from the
   * question's own findings under `question`.
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
 * `EnquiryStatus`, alongside where this enquiry's own question currently sits
 * in the overall survey.
 *
 * **Where this question landed, not the whole survey.** Answering *is this
 * closure warranted?* means finding one question's bucket; appending the entire
 * `KnowledgeSurvey` answers about every question in the record instead of the
 * one this report is about.
 *
 * `standing` is `null` only when no question stands behind the enquiry,
 * matching `EnquiryStatus.question` — every question that exists lands in
 * exactly one bucket of `whatIsKnown()`'s partition, so a non-null question
 * always has one.
 */
export interface EnquiryInContext {
  enquiry: EnquiryStatus;
  standing: { question: QuestionRef; asks: string; bucket: QuestionBucket } | null;
}

/**
 * A proposition whose support changed when an analysis was replaced.
 *
 * `before`/`after` are the supporting findings verbatim. LabKit deliberately
 * does not grade them — "one becomes marginal" is something a reader or agent
 * sees by comparing the two findings, not a strength value LabKit assigns.
 * Whether that holds up is one of this build's open questions.
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
 *
 * What the act minted, and what it superseded. What the revision *changed* is
 * a question about the record rather than a fact this act holds — it is spread
 * across the `conclude` calls that follow, and `why <analysis>` reads it back.
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
   * The conclusions this act superseded — everything the revised analysis
   * concluded that was not kept.
   *
   * Returned because it is what the caller most needs to check and cannot have
   * predicted: it is the complement of what they typed, over a set they may not
   * have had in front of them.
   */
  superseded: ConcludedClaim[];
  /**
   * The event this act recorded.
   *
   * **What it does not carry is the point.** This act mints an analysis and a
   * lineage decision; the successor's own findings arrive afterwards, one
   * `conclude` at a time. What the revision changed is therefore spread across
   * those calls and is read back with `why <analysis>`.
   */
  events: DomainEvent[];
}

export interface UnaffectedRecord {
  /** The record's handle, as the caller named it — observations, or an earlier analysis. */
  what: InputRef;
  /**
   * Present, and `true`, when this input was retracted by the very act being
   * reported — the replacement named the analysis it supersedes as its own
   * input.
   *
   * The entry stays in the list and says what it is, the way a superseded
   * `EvaluationRecord` stays readable and carries `withdrawn`. Dropping it
   * would hide an input the replacement genuinely rests on; a fixed `why`
   * saying it was "not produced by the replaced analysis" would be false.
   */
  invalidated?: true;
  /** What it is, in the researcher's words. */
  named: string;
  why: string;
}

/**
 * Whether a gate may be relied on.
 *
 * `state` deliberately has four values. "Never evaluated" is not a kind of
 * failure and must never read as a pass: a gate nobody has evaluated and a
 * gate that evaluated and failed are different situations, and a missing
 * evaluation must never be confused with one.
 * `incomplete` covers the fourth case a multi-criterion gate creates — some
 * conditions checked, none failing, others never run.
 */
export interface GateStatus {
  gate: GateRef;
  consequence: string;
  /**
   * Four states, because a gate can be governed by several conditions and
   * "some checked, none failing" is a real situation distinct from all three
   * others. `blocked` takes precedence over `incomplete`: a failure is
   * decisive regardless of what else remains unrun.
   *
   * Note that these describe **control state** — whether the protected work
   * may proceed. They deliberately say nothing about the epistemic standing
   * of any finding; see ledger row V.
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
   *
   * The tally rather than the reader's job: a gate may govern a hundred
   * conditions, and a reader that has to count them before it can act was
   * answered a different question than the one it asked. Every key is present
   * at zero, so an absent state cannot read as one nobody asked about.
   */
  counts: Record<CheckStatus["state"], number>;
  /** Conditions not currently passing — what would have to change. Named before anyone spends the compute. */
  unmet: UnmetCheck[];
  /** What is currently relying on this gate — the blast radius of a fake guard. */
  gating: GatedWork[];
  /**
   * Whether any evaluation of this criterion has ever come back `fail`.
   *
   * A guard nobody has seen fail is a guard nobody has shown to work. Note
   * this cannot distinguish "the criterion cannot fail" from "it was never
   * given anything that should fail" — see this build's findings.
   */
  everFailed: boolean;
}

export interface CheckStatus {
  /** Stable identity. Two criteria worded identically are two criteria. */
  criterion: CriterionRef;
  /** Display text. Not an identity — see `criterion`. */
  proposition: string;
  /**
   * `no-standing-verdict` is the state between a check being found defective
   * and its correction being run: evaluations exist, and none of them still
   * stands. It is emphatically not `never-run` — the check ran, and
   * `decidedBy` being absent is not evidence that it did not. It counts as
   * unmet, exactly as `never-run` does.
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
 *
 * The value is the sentence someone typed when they decided the check, and on
 * a gate governing many conditions it is most of the answer's size — an order
 * of magnitude more than the handles and outcomes beside it. A gate is asked
 * *what state is everything in*; the sentences are a different question about
 * one condition.
 *
 * The handle is what makes that a pointer rather than a loss: `why
 * <criterion>` reads it, and `search` reaches one by its text.
 */
export interface DecidingEvaluation {
  evaluation: EvaluationRef;
  outcome: "pass" | "fail";
  at: string;
}

export interface EvaluationRecord {
  /**
   * This evaluation's handle.
   *
   * Without it, two evaluations of different criteria sharing a value, outcome
   * and instant are indistinguishable once `GateStatus.evaluations` flattens
   * them.
   */
  evaluation: EvaluationRef;
  /** The criterion this evaluated — the flattened list loses it otherwise. */
  criterion: CriterionRef;
  value: string;
  outcome: "pass" | "fail";
  at: string;
  /**
   * Present, and `true`, when everything this verdict was reached against has
   * since been withdrawn — the check was found to be faulty and replaced, not
   * merely re-run. Such a verdict stays readable but no longer decides the
   * check's state; see `CheckStatus.decidedBy` and ledger row X.
   *
   * Absent rather than `false` when the verdict stands, so a standing record
   * reads exactly as it did before this distinction existed.
   */
  withdrawn?: true;
  /**
   * The findings this evaluation was carried out against.
   *
   * Empty means the verdict was asserted, not measured — a different thing
   * from one backed by a result, and the two must not read alike.
   */
  basis: CitedFinding[];
}

/**
 * What a re-run did and did not establish about a historical result.
 *
 * Two verdicts, deliberately not one: a conclusion can be re-reached by an
 * execution that was never reproduced, and collapsing those into a single
 * boolean is the mistake the scenario is named after.
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
   *
   * There is deliberately no verdict beside these. LabKit is bookkeeping: it
   * records what each run consumed and hands both lists to whoever can read
   * them. Whether reading the same records in a different order is the same
   * execution depends on what the method does, which the record does not know
   * and should not guess.
   *
   * There is deliberately no `execution: "reproduced" | "not-reproduced"`
   * verdict. Adjudicating would call a reversed rerun of an order-sensitive
   * method a reproduction, and a third value meaning "cannot say" hedges the
   * guess rather than removing it. Two lists and no adjudication is less
   * machinery than either.
   *
   * Order is recorded because the caller supplied it: `recordAnalysis({ from })`
   * takes an ordered array, and discarding it was the actual defect — losing
   * something a caller said, in the record whose job is not to.
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
     * The input, identified — not a bare name. Two artefacts legitimately share
     * a `logical_name`, since a regeneration carries the name of the part it
     * replaces, so a re-run that swapped one for the other would report two
     * entries reading "control series" that contradict each other under one
     * label. Decided by `natural_id`, reporting the name.
     */
    what: IdentifiedArtefact;
    standing: "unrecorded-in-the-original" | "changed" | "not-used-by-the-re-run";
  }>;
  /** Which way the re-run cuts for the historical claim. */
  bearing: "raises" | "lowers";
}

/**
 * An artefact in a report: what it is, and what it is called.
 *
 * `part` is identity; `name` is what a person reads. Both, on the way out as
 * well as in: a name-keyed map merges two artefacts that legitimately share a
 * `logical_name`.
 *
 * A shared shape rather than one report's private type, because more than one
 * read has to identify an artefact. Deduplicating on the name instead collapses
 * two distinct inputs into one entry, which can hide a regeneration with
 * inferred provenance underneath a conclusion.
 *
 * Named for what it is rather than for either caller.
 */
export interface IdentifiedArtefact {
  /** The observations handle — identity, and the only thing that is. */
  part: ObservationsRef;
  /** Its `logical_name`. Two parts may legitimately share one. */
  name: string;
  /**
   * Present, and `true`, when the record itself marks this artefact retracted.
   *
   * `whySupported().restingOn` populates it; the buckets in
   * `ReproducibilityReport` do not, because that report is about hashes and
   * says nothing about standing.
   *
   * Retracting a record deliberately does **not** withdraw what rests on it:
   * the consequence is *enumerable*, through `whatDependsOn`, rather than
   * automatic. That only holds while the reader can see the retraction —
   * without this field a conclusion whose sole input had been retracted reads
   * `supported: true` and names the artefact with no hint of its state.
   */
  invalidated?: true;
}

/**
 * How much of a past construction can be rebuilt.
 *
 * Four outcomes per part, and only two of them are comparisons. `exact` and
 * `differing` are completed comparisons; `unverifiable` and `notRebuilt` are
 * states where no comparison happened at all, for two different reasons. Both
 * were at some point folded into `differing`, which claims knowledge the record
 * does not have — Row I's absence-versus-difference distinction, asked of an
 * artefact, and got wrong twice before it was got right.
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
   *
   * Distinct from `unverifiable`, and external review caught them being
   * conflated with `differing`: a missing candidate compared unequal to a
   * recorded hash, so LabKit claimed evidence of inequality where there was
   * only absence of a comparison — the very conflation this report exists to
   * respect, one branch from the branch that respects it.
   *
   * `unverifiable` is a permanent property of the record; `notRebuilt` is a
   * property of *this attempt* and says nothing about the artefact.
   */
  notRebuilt: IdentifiedArtefact[];
  /**
   * Whether the whole construction reproduces. False unless every part was
   * rebuilt and matched: anything differing, unverifiable or not attempted
   * leaves the construction unshown, and this is the field that must not
   * quietly say otherwise.
   *
   * **And false when there were no parts at all**, since the sentence above is
   * otherwise satisfied vacuously and a construction with nothing in it would
   * report as reproducing. At least one part must be in `exact`. An analysis
   * whose subject does not exist is refused rather than reported on; absent and
   * empty are different states.
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
   *
   * Third instance of the same thing (`recordAnalysis`, `replaceAnalysis`):
   * re-verifying asserts the proposition afresh, so afterwards two claims say
   * it and a caller holding only the refs can name neither.
   */
  claims: ConcludedClaim[];
  /** The event this act recorded — `events[0].created` names the output artefact. */
  events: DomainEvent[];
}

/**
 * A claim reached by `whatDependsOn`, identified as well as quoted.
 *
 * `claim` is the handle; `asserts` is what it says. Both, because a report
 * telling you what would be affected is useless if you cannot then go and look
 * at any of it — every follow-up verb takes a reference — and unreadable if it
 * gives you only an id. The shape `QuestionStanding` and `IdentifiedArtefact`
 * also use.
 */
export interface AffectedClaim {
  claim: ClaimRef;
  asserts: string;
}

/**
 * A finding, identified as well as quoted.
 *
 * `evidence` is the handle, `states` what it says. Used wherever a report names
 * the findings a conclusion or a decision rests on.
 */
export interface CitedFinding {
  evidence: EvidenceRef;
  states: string;
}

/**
 * A finding bearing on a claim, with the analysis that produced it.
 *
 * `finding` is what it says, `evidence` identifies it; `method` is what the
 * analysis did, `analysis` identifies that. Both halves of both, because two
 * runs of one method are two analyses, and a bare method name cannot tell them
 * apart.
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

/** An unmet check: the criterion's handle, and what it requires. */
export interface UnmetCheck {
  criterion: CriterionRef;
  requires: string;
  /**
   * What this unmet check is holding up, if anything.
   *
   * **The report answers "what does this block?" so that nothing has to ask
   * it.** A researcher reaching a criterion does so through here — `claims` to
   * a claim, `why` to an unmet check — and the obvious next question had no
   * verb: `GOVERNS` is written from criterion to gate, walked only from the
   * gate, and the gate's `consequence` exists for no other purpose than to
   * answer this. The record knew and could not say.
   *
   * Embedded rather than given its own verb, which was Dan's question and is
   * the better answer for the drill-down case: a reader looking at a claim
   * wants the consequence *here*, not a handle to go and look up. It does not
   * serve the standup case — "show me everything blocked" still needs an
   * enumeration, because there is no claim to start from.
   *
   * Empty is an answer: a criterion can qualify a finding and gate no work at
   * all, which is why `--gate` is optional on `labkit evaluate`.
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
 *
 * The same shape as {@link UnmetCheck}, used wherever a report names a
 * criterion — amendment history reported these as bare propositions, so two
 * criteria worded alike were one and no caller could reach either.
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
 * What is affected if this record turns out to be wrong — and, deliberately, a
 * statement that the answer is a **lower bound**.
 *
 * **"No dependency found" must never read as "independent."** The remedy is
 * this shape and nothing else: no new durable state, no new edge, just an
 * answer that stops overstating itself.
 */
export interface DependencyReport {
  /**
   * The artefact this answer is about.
   *
   * Echoed because the verb also accepts a logical **name**, and a caller who
   * passed one otherwise cannot tell which record the name resolved to — the
   * report would describe a record it never identified. `kind` is
   * `observations` for the same reason the argument's is: the `ART_` prefix
   * does not distinguish a raw input from an analysis output, and this makes no
   * claim that it does.
   */
  subject: ObservationsRef;
  /** Claims found to rest on the subject, supporting or challenging. */
  claims: AffectedClaim[];
  /** Lines of enquiry found to reach it. */
  enquiries: AffectedEnquiry[];
  /**
   * The routes actually walked, named so a reader knows what was considered.
   *
   * Anything connected by a route not listed here is absent from `claims` and
   * `enquiries` and is **not thereby independent**.
   */
  routesWalked: string[];
  /**
   * Always `false`, and it is a type-level statement rather than a flag.
   *
   * Traversal here is **open-world**: this reports what was found, never that
   * nothing else exists. A caller cannot write `if (report.complete)` and have
   * it mean anything, which is the point: the alternative is a reader
   * inferring completeness from a populated-looking list.
   *
   * **Do not widen this to `boolean`.** Asserting completeness needs to know
   * the relevant dependency set *is* complete, which is durable coverage state
   * this model does not have. Widening the type would ship the assertion
   * without the state behind it.
   */
  complete: false;
}

/** The answer to "why does this conclusion count as supported?" */
export interface SupportExplanation {
  /**
   * The claim this answer is about.
   *
   * Without it the answer stops identifying its own subject the moment it is
   * stored or sent, and over MCP it is exactly a stored blob. Two claims can
   * assert the same sentence, so the wording does not name one.
   */
  claim: ClaimRef;
  proposition: string;
  /**
   * Whether the record currently stands behind this proposition: evidence
   * supports it, nothing has withdrawn it, and it meets whatever standard it
   * was held to. `support`, `withdrawn` and `unmet` say which of the three is
   * missing when it is false; reporting those identically is the confusion this
   * field exists to prevent.
   */
  supported: boolean;
  /**
   * Whether this finding has been promoted to confirmatory standing.
   * `exploratory` until an act says otherwise — scratch is captured before
   * anyone knows it matters, so the standing cannot always be declared at
   * birth.
   */
  standing: "exploratory" | "confirmatory" | "undecided";
  /** Why it was promoted. Present only when `standing` is `confirmatory`. */
  promotedBecause?: string;
  /** Findings currently supporting the proposition, each with the analysis that produced it. */
  support: BearingFinding[];
  /**
   * Analyses that re-checked a supporting finding without reproducing its
   * execution, by method.
   *
   * Kept out of `support` deliberately. A re-verification is not a second
   * independent finding, and listing it as one made a claim established once
   * report itself as corroborated twice — see `EDGE_SCHEMA.REVERIFIES`.
   */
  reverifiedBy: Reverification[];
  /**
   * The prespecified conditions the supporting analyses were held to,
   * itemised the same way a gate's are — `recordAnalysis({ heldTo })`.
   *
   * Empty means the finding was held to no agreed standard, which is a
   * different state from meeting one and from failing one. Without it,
   * `supported` means only "some evidence exists", and a finding whose own
   * robustness checks failed reads as plainly supported.
   */
  standard: CheckStatus[];
  /**
   * The conditions in `standard` not currently passing — what would have to
   * change for the finding to stand. A check nobody ran counts, exactly as it
   * does for a gate.
   */
  unmet: UnmetCheck[];
  /**
   * Observations the supporting findings ultimately rest on — **identified**,
   * not named.
   *
   * `name` is `recordObservations({ name })` and never the `finding` text: two
   * different strings describe an observation set. But the name is not the
   * identity — `part` is, and two parts may legitimately share a name, so
   * keying on it collapses two distinct inputs into one entry.
   */
  restingOn: IdentifiedArtefact[];
  /** Findings withdrawn because their analysis was revised. Either bearing. */
  superseded: Array<BearingFinding & { reason: string; bearing: "supports" | "challenges" }>;
  /**
   * Whether any finding bears *against* this proposition.
   *
   * Distinct from `supported: false`, which is also true of a proposition
   * nobody has ever examined. A claim refuted by a null result and a claim
   * never investigated are different scientific states, and reporting them
   * identically confuses absence of evidence with failure.
   */
  challenged: boolean;
  against: BearingFinding[];
  /**
   * Whether the record has stopped claiming this at all.
   *
   * A third state, and it is not `challenged`. Challenged means evidence bears
   * against the sentence; withdrawn means nobody is asserting the sentence any
   * more, usually because a narrower one replaced it. The findings underneath a
   * withdrawn interpretation are untouched — only the reading moved — so
   * `support` stays populated while `supported` is false.
   */
  withdrawn: boolean;
  /** The interpretation that replaced it, if one did. */
  replacedBy?: ReplacementClaim;
}

/**
 * What the record held at a stated moment — the as-of view (row Z).
 *
 * Deliberately a **narrower shape** than `KnowledgeSurvey`, and the narrowing is
 * the honest part. `Decision` now carries `decided_at`, so resolution,
 * acceptance and promotion can all be placed in time. `EvidenceUnit` carries no
 * instant, so *whether anyone had yet worked on a question* cannot be. The
 * present-tense survey splits that into `unresolved` and `untested`; this one
 * cannot, and collapses them into `open` rather than reporting a split it would
 * have to infer from current state.
 *
 * That collapse is the finding, not a shortcut. Reporting `untested` as-of by
 * reading today's evidence units would answer a question about March with facts
 * from August — the same current-state leak that makes a survey say a question
 * was `established` before the promotion that established it.
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
   *
   * Not split into worked-on and untouched, because nothing durable records when
   * work began. If that split is ever needed as-of, `EvidenceUnit` is where the
   * instant would have to go, and it should be earned the way this one was.
   */
  open: QuestionStanding[];
}

/**
 * A question on the record. `question` is its identity; `asks` is what it
 * says. The two are kept apart deliberately: one question may be pursued two
 * ways, and two questions may be worded identically. Neither is resolvable by
 * comparing text.
 */
export interface QuestionStanding {
  question: QuestionRef;
  asks: string;
}

/**
 * `QuestionStanding`, plus what would reopen it — carried on
 * `KnowledgeSurvey.accepted`: a deliberately-open list without the condition
 * that would reopen each item is a list nobody can act on. Sourced from the
 * same `DEFERS` decision `enquiryStatus` reads `reopensIf`/`acceptedBecause`
 * from, and read the same way here: one more projection on `whatIsKnown`'s
 * already-joined `accepting` node, not a second query per question.
 */
export interface AcceptedQuestion extends QuestionStanding {
  reopensIf: string;
  acceptedBecause: string;
}

/**
 * `QuestionStanding`, plus the claim that answers it and which way it cuts —
 * carried on `KnowledgeSurvey.established`/`.provisional`: both buckets are
 * "answered", differing only in whether the answer met the standard it was
 * held to and was promoted, and both the claim and the polarity are what
 * `whatIsKnown` already resolved to decide which bucket to place the
 * question in and which bearing (`SUPPORTS`/`CHALLENGES`) answered it.
 * Exposing the claim lets a reader go straight to `why <claim>` without a
 * text search, and lets a caller recognise a question as moved when the
 * claim answering it changed even though the question's own id did not.
 *
 * **`answer` is not decoration.** Reading only `asks` for an established
 * question cannot tell a promoted, confirmed "no" apart from a "yes" — the
 * record has always carried this polarity (`QuestionClosure.answer`); this
 * is that same fact, on a report that would otherwise omit it.
 */
export interface AnsweredQuestion extends QuestionStanding {
  claim: ClaimRef;
  answer: "yes" | "no";
  /**
   * Present when this question had been left open on purpose before it was
   * answered — the same pair `AcceptedQuestion` carries, from the same
   * `DEFERS` decision.
   *
   * A reader meeting the answer has to be able to ask whether it is the
   * stated condition being met or something unrelated that arrived first, and
   * the answer alone cannot say. Both facts are about now, so reporting only
   * the newer one is a choice, not a consequence of the model.
   */
  acceptedBecause?: string;
  reopensIf?: string;
}

/**
 * What the programme knows, in more states than settled-or-not. The buckets are
 * the fields below, and their count is deliberately not written here.
 *
 * `untested` is not a weak form of `unresolved`: one is a question nothing has
 * ever been run against, the other a question something has been run against
 * without settling it. Absence of evidence must not read as a negative result,
 * which is why they are separate lists rather than a flag on one.
 *
 * Two boundaries are classified by structure alone: a question closed *without*
 * cited evidence appears under `unresolved` if anything ever addressed it, and
 * a deferred one under `untested` if nothing did.
 */
export interface KnowledgeSurvey {
  /**
   * Settled on cited evidence. Polarity is not here — an answered "no" is
   * still settled; see `EnquiryStatus.answer`. `AnsweredQuestion`, not
   * `QuestionStanding` — see its own doc comment.
   */
  established: AnsweredQuestion[];
  /** Worked on, not settled. */
  unresolved: QuestionStanding[];
  /** On the books, never pursued. Not a failure and not an inconclusive result. */
  untested: QuestionStanding[];
  /**
   * Answered, but not on something to build on — **for either of two
   * reasons**, and the bucket deliberately holds both.
   *
   * The first is the finding nobody promoted: the question is settled *as far
   * as anyone has taken it*, but what settles it is scratch. Kept out of
   * `established` so that reading the survey for "what do we actually know"
   * cannot silently include a lunchtime notebook sweep.
   *
   * The second is the opposite shape: the finding somebody **did** promote,
   * held to a prespecified check that failed or was never run. Promotion says a
   * person vouched for it; the check says nobody confirmed it.
   *
   * **One bucket rather than two.** The reasons differ and the consequence does
   * not — *this is answered, and it is not something to build on* — and a
   * reader acts identically on both. `whySupported` distinguishes them for
   * anyone who needs to know which it is.
   *
   * `AnsweredQuestion`, not `QuestionStanding` — see its own doc comment.
   */
  provisional: AnsweredQuestion[];
  /**
   * Open on purpose. Worked on, not settled, and deliberately left — with the
   * condition that would reopen it recorded on the deciding act.
   *
   * Its own bucket rather than a flag on `unresolved`, because a reader
   * scanning for what still needs doing must not find it there. The
   * alternative is a to-do list that can never be emptied and is therefore
   * never read.
   *
   * `AcceptedQuestion`, not `QuestionStanding` — see its own doc comment.
   */
  accepted: AcceptedQuestion[];
}

/**
 * Where a question came from, when it came from sharpening an earlier one.
 *
 * `knownAtTheTime` is the point of this type. It is the findings the
 * sharpening act was taken in light of, frozen when the act was recorded —
 * not "everything standing now", which would back-date later results onto an
 * earlier decision. The question this answers is asked *after* more evidence
 * has arrived, which is what makes the freezing load-bearing.
 */
export interface QuestionOrigin {
  /** Identity of the question this one was sharpened from. */
  from: QuestionRef;
  /** What that question asked — still in its original words. */
  fromAsks: string;
  /** Why it was sharpened. */
  reason: string;
  knownAtTheTime: CitedFinding[];
}

/**
 * What an amendment to a locked design did.
 *
 * `nature` is the field that matters. Mechanical and scientific amendments are
 * the difference between a legitimate repair and p-hacking, so the record has
 * to carry it. Derived, not declared: an amendment is scientific exactly when
 * something the confirmatory boundary rests on is in its blast radius. Nobody
 * can set it to "mechanical".
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
 * A locked design and everything that has happened to it.
 *
 * `amendments` is ordered oldest-first, reconstructed from the supersession
 * chain alone — no timestamp on any decision, and nothing read from the event
 * log. It orders the amendments relative to each other and says nothing about
 * when any of them happened.
 */
export interface DesignHistory {
  gate: GateRef;
  /** What the design said before anyone amended it. */
  originally: Condition;
  nowRequires: Condition;
  /** The condition currently in force, for amending again. */
  criterion: CriterionRef;
  amendments: AmendmentRecord[];
}

/**
 * What a reinterpretation did.
 *
 * `requiresRecomputation` is the field that keeps this verb honest. A
 * reinterpretation touches no computation, no artefact and no observation —
 * if it ever needs one rerun, it was a replacement wearing the wrong name, and
 * `replaceAnalysis` already exists for that.
 */
export interface ReinterpretationReport {
  at: string;
  /**
   * The claims that stopped standing — **plural**, and that is the point.
   * A reinterpretation narrows a *reading*, and two analyses in one line of
   * enquiry concluding the same sentence share one, so a single handle here
   * would be an arbitrary pick between records this act withdrew together.
   * They all assert the same `asserts`; the handles are what differ.
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
 *
 * Ordered from the supersession chain alone, exactly as `DesignHistory` is —
 * no timestamps, nothing read from the event log.
 */
export interface InterpretationHistory {
  /** The earliest reading, as the records that asserted it — the first revision's `previously`. */
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
 *
 * The verdict comes from scope and bearing, never from comparing the two
 * sentences. Two claims of the same scope with opposing support contradict
 * each other; two of different scope do not, however alike they read.
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
 * The line of enquiry, and the question behind it, that a task exists to
 * advance.
 *
 * Wording alongside each handle, matching `EnquiryStatus.pursuing` and
 * `QuestionClosure.asks`: *why does this task exist* is answerable from a bare
 * handle only by chaining a second read. `question` is never absent when
 * `enquiry` is present — `pursue()` requires a question to open a line of
 * enquiry, so every `LineOfEnquiry` has exactly one `MOTIVATES` edge behind it.
 *
 * Named and shared rather than inlined per report, since more than one reads it.
 */
export interface Addressing {
  enquiry: EnquiryRef;
  pursuing: string;
  question: QuestionRef;
  asks: string;
}

/**
 * What a planned task is permitted to touch.
 *
 * Closed-world: `mayRead` is the whole contract, and anything absent is
 * outside it. A second "may not read" list would be unbounded and impossible
 * to keep complete, and answering "is the held-out set in scope?" from an
 * absence is both simpler and harder to get wrong.
 *
 * `enforced` is `false` and says so out loud. LabKit records the contract; it
 * does not police it. Nothing here prevents a process reading whatever it
 * likes, and a scenario that implied otherwise would be describing a guarantee
 * the system cannot give.
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
 *
 * **Deliberately not a `GateStatus`.** That report answers *"tell me everything
 * about this gate"* and costs several queries per gate to assemble — the
 * itemised checks, the blast radius of each unmet one, whether the criterion
 * ever failed anywhere. A list wants the handle, the sentence and the state,
 * and a caller who wants the rest has the handle to ask with.
 *
 * `state` is the same value `gateStatus` reports, computed by the same function
 * (`gateStateFrom`) over the same fact. They cannot disagree, which is the
 * property that matters: a reader who lists blocked gates and then opens one
 * must not find it satisfied.
 */
export interface ListedGate {
  gate: GateRef;
  consequence: string;
  state: GateStatus["state"];
}

/**
 * What a task's state can be, computed from the graph and never stored.
 *
 * **Derived from the two edge families that reach a Task**, not chosen from a
 * list of plausible words: `Gate -[:GATES]-> Task` and
 * `Task -[:IMPLEMENTS]-> EvidenceUnit` are everything the record holds about
 * one, so they are everything a state can be computed from.
 *
 * Two candidates died on inspection while this was being written, and both are
 * worth naming because they read as obvious:
 *
 * - **`observed`** is not computable. `recordObservations` takes an *enquiry*;
 *   no edge connects observations to a Task at all.
 * - **`closed`** has no verb behind it. Nothing closes work. `Task.is_open`
 *   existed and was deleted the same day — written by `planWork`, read by
 *   nobody, the same flag `DecisionProps` lost on 2026-08-24.
 *
 * **`blocked` takes precedence over `carried-out`**, which is the one real
 * decision here and is the rule `GateStatus.state` already applies to
 * `blocked` over `incomplete`: a reader scanning for what needs attention must
 * see the blockage. The alternative reading — that work already carried out is
 * not *blocked* whatever its gate says — is genuine, and is why the overlap has
 * a test of its own rather than being left to fall out of the branch order.
 */
export type WorkState = "planned" | "blocked" | "carried-out";

/**
 * One task in a list of them.
 *
 * `{work, objective}` is the pair `GatedWork` already established, so a reader
 * moving between the two reports meets one convention. `state` is what this
 * adds, and it is why the two types are not one: a `GatedWork` says what a gate
 * is holding up, and says nothing about whether that work has happened.
 *
 * `workList()` already collects every gate governing a task to compute
 * `state` (`workStateFrom` reads exactly this set), and `gates` exposes it: a
 * caller needs it to catch a task newly blocked by a criterion evaluation,
 * which touches the gate (`TRIGGERS`) and never the task itself. Exposing
 * what the computation already held, not a second query.
 */
export interface ListedWork {
  work: WorkRef;
  objective: string;
  state: WorkState;
  gates: GateRef[];
}

/**
 * One record a `why` explanation cites, and what it says — the shape `because`
 * is built from.
 *
 * The same `{handle, wording}` convention every other report in this file uses.
 * `when` is present only where the cited record carries an instant of its own,
 * such as an evaluation or a decision.
 */
export interface Cause {
  handle: Ref<Kind>;
  wording: string;
  when?: string;
}

/**
 * `why <handle>` — a mini-app dispatching on the handle's own kind, over
 * reports that already exist. Not new queries: a report is the plan, `why`
 * renders it as causes (Postgres `EXPLAIN`, for *why*).
 *
 * One shape for every kind it explains, so `--json` and MCP get structure and
 * the tty gets a sentence: *GATE_1 is blocked because CRIT_2 "…" failed on
 * 2026-08-04 and CRIT_3 "…" has never been run*.
 *
 * `report` carries the kind's own existing report **unflattened**. An envelope
 * dictating the embedded shape would cost `why CLM_1` its *Supported by / Held
 * to / Resting on* view for the sake of a one-line sentence.
 *
 * A discriminated union, not one interface with optional fields: `report`'s
 * type differs by `kind`, and a caller narrowing on `kind` gets the right one
 * without a cast. Only the kinds `read.ts`'s `EXPLAINED` table has a case for
 * are members; a kind `why` does not explain never constructs one of these, it
 * throws instead.
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
 * What one condition requires, what it has been evaluated to, and what it
 * governs.
 *
 * **The detail a gate's page sheds.** `GateStatus` answers what state every
 * condition is in; this answers what was actually said about one of them. They
 * are different questions, and a gate governing many conditions cannot carry
 * both.
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

export type Explanation =
  | ClaimExplanation
  | CriterionExplanation
  | WorkExplanation
  | EnquiryExplanation
  | GateExplanation
  | AnalysisExplanation;

/**
 * What an analysis revised, and which of the earlier findings actually moved.
 *
 * **Read, not returned.** Conclusions arrive one act at a time, so what a
 * replacement changed is spread across N calls and no single act holds it. It
 * is answered from the record: the lineage decision says which analysis this
 * one revises and on which review, and the per-finding decisions say which
 * findings were superseded and by what.
 *
 * `supersedes` and `because` are absent for an analysis that revises nothing,
 * which is the ordinary case and an honest answer rather than a refusal.
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
   *
   * Separate from {@link changed} because they answer different questions. A
   * re-run that confirms five of six results and moves one has done something
   * quite unlike one that moved all six, and a single "superseded" count
   * cannot tell a reader which happened. These are the **replacement's**
   * claims: the ones they supersede are withdrawn.
   */
  restated: ConcludedClaim[];
  /**
   * Conclusions the revision carried forward, and which still stand.
   *
   * They keep their original evidence, so asking why one holds answers with the
   * superseded analysis's own output — that is where the number came from.
   */
  kept: ConcludedClaim[];
  /**
   * Superseded findings with no successor this read could identify.
   *
   * **It never guesses.** New conclusions are paired to superseded ones by
   * proposition, and an analysis may assert the same sentence twice about
   * different endpoints — so where the match is ambiguous, or where nothing
   * new asserts the sentence at all, the finding is reported here rather than
   * paired with an arbitrary one.
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
 * "What am I blocked on right now, what are my priorities?" Literally the
 * composition of reads that already exist — `gateList`, `workList`,
 * `whatIsKnown` — never a private helper, so a section that needs a query
 * nothing else has yet shows up as a signature change the coverage tests
 * already police.
 *
 * `blocked`/`unevaluated`/`untouched` are `gateList()`/`workList()`
 * partitioned client-side by the state each already carries, not three
 * separate filtered queries: one traversal per read, not one per section.
 * `known` is `whatIsKnown()` unmodified, all five buckets present and
 * unmerged: `untested` is not a weak form of `unresolved`, and collapsing
 * them into a shorter section list reports a question nothing has been run
 * against identically to one that was worked on and not settled.
 *
 * **Deliberately no `at=`.** Gate and work state are computed from
 * evaluations and edges as they currently stand; a historical standing would
 * compute "blocked last Tuesday" from today's graph and present it as
 * history, not an honest empty result. `whatHappened` already refuses the
 * same thing a different way (it answers "what happened", never "what was
 * true").
 */
export interface Standing {
  /** Gates currently blocking work, and the work each protects — two reads, not a join. */
  blocked: { gates: ListedGate[]; work: ListedWork[] };
  /** Gates nobody has finished checking: `never-evaluated` or `incomplete`. */
  unevaluated: ListedGate[];
  /** Planned work with nothing recorded against it yet — what is ready to start. */
  untouched: ListedWork[];
  /** Where every question currently stands. */
  known: KnowledgeSurvey;
  /** This read's position in the event stream — what `now({since})` takes next. */
  seq: number;
  /**
   * The cursor this answer was asked from. Absent means this is the full
   * standing; present means every section above has already been narrowed
   * to what a touched handle appears in since that cursor — presence *is*
   * the "moved" marker, not a per-item flag repeating it.
   */
  since?: number;
}
