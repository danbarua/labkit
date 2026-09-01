import { labelForNaturalId, type NodeLabel } from "../db/domain";
import type { DomainEvent } from "./events";

/**
 * What the domain layer hands back — research answers, not graph rows.
 *
 * Every type here is derived from one of S-11's "Afterward" bullets
 * (docs/project-journal/008_user_story_mining.md). That direction matters: if
 * a bullet has no natural home in these types, the API is wrong rather than
 * the bullet. Nothing here mentions a node or edge label.
 */

declare const KIND: unique symbol;

/**
 * A handle a caller passes back in — LabKit's short natural id, and nothing
 * else. Never AGE's internal graphid.
 *
 * **It *is* the id.** The brand exists only at compile time; at runtime a
 * `GateRef` is the string `"GATE_1"`. That was `{ kind, id }` until 2026-08-24,
 * and the change is not cosmetic — the object shape had two failure modes that
 * a string does not, both of which shipped in the one commit that introduced it
 * (PR #15):
 *
 * - **`===` was reference equality.** `left.enquiry === right.enquiry` compiled,
 *   type-checked, and was false for the same enquiry. It reported two claims in
 *   one line of enquiry as being in different ones, turning a contradiction into
 *   a dissociation, and only S-5 caught it. Here `===` is value equality, and
 *   comparing two *different* kinds is a compile error rather than a permanent
 *   `false`.
 * - **A handle bound as a Cypher parameter matched nothing.** Params are
 *   `Record<string, unknown>`, so `{ id: gate }` where `{ id: gate.id }` was
 *   meant type-checked and silently found no rows. Three of those shipped.
 *   Here `{ id: gate }` is simply correct.
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
 * `Artefact`, *work* and means a `Task`. Five of the thirteen differ, so the
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
} satisfies Record<string, NodeLabel>;

/**
 * Every kind a handle can name — the closed union `why` (#128, redesigned on
 * review) dispatches on. `satisfies` rather than a `: Record<string, NodeLabel>`
 * annotation is what keeps this closed: the annotation used to erase the
 * literal keys, so `keyof typeof LABEL_BY_KIND` was `string` and there was
 * nowhere for a total `Record<Kind, …>` table to be checked against.
 */
export type Kind = keyof typeof LABEL_BY_KIND;

/**
 * A handle of any kind — every {@link Ref} this record can mint, in one type.
 *
 * Earned by `why` (#128, redesigned on review): its subject is a handle whose
 * kind is not yet known, or a proposition, and `check:no-stringly-typed`
 * reads the written type node rather than resolving it — so this, unlike a
 * bare `string`, is never flagged, without needing an allowlist entry for a
 * parameter that genuinely does name a record.
 */
export type AnyRef = Ref<Kind>;

/**
 * Builds a handle, and **refuses one whose id does not match its kind**.
 *
 * The check is new with the branded form and is the point of keeping `kind` as
 * an argument at all. Under `{ kind, id }` the two halves could disagree and
 * nothing noticed; here they cannot disagree in the type, and this stops them
 * disagreeing at the moment of minting. It costs one prefix lookup at each of
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
 * A claim, by identity.
 *
 * Claims had no handle: they were addressed only as a {@link ConclusionRef},
 * which is an analysis id plus **wording**, and reported as bare propositions.
 * That is the collapse PJ-030 is about, at the one entity the model is most
 * about. `ConclusionRef` stays as an *input* convenience for a caller who has
 * just run an analysis and does not hold the claim id yet; every report hands
 * back one of these.
 */
export type ClaimRef = Ref<"claim">;

/** A finding, by identity. */
export type EvidenceRef = Ref<"evidence">;

/**
 * The inferential activity an analysis carried out — an `EvidenceUnit`.
 *
 * The last natural-id prefix without a handle. `EU_` had no `Ref` type because
 * nothing outside the write surface names one: a caller says *analysis* and
 * means the `Computation`, while the unit is what `EVALUATES` and `IMPLEMENTS`
 * actually point at. It exists now because `unitOf()` was handing one back as a
 * bare string, which is the shape this refactor is removing, not because a new
 * caller wants it.
 *
 * Kind `"unit"`, not `"evidenceUnit"` — the kinds name research concepts rather
 * than labels throughout (`observations` for `Artefact`, `analysis` for
 * `Computation`, `work` for `Task`), and this follows that.
 */
export type UnitRef = Ref<"unit">;

/** An evaluation of a criterion, by identity. */
export type EvaluationRef = Ref<"evaluation">;

/** A decision, by identity. */
export type DecisionRef = Ref<"decision">;

/**
 * What `recordObservations` produced — #161's audit: withheld entirely, a
 * caller had no handle back at all.
 *
 * `evidence` is not named here: it is exactly what `events[0].created` already
 * carries, and naming it a second time is the per-verb echo #161's mechanism
 * is meant to replace. `observations` stays because it is what the caller
 * asked to create and is the one thing every reader of this return wants
 * without going via the event.
 */
export interface RecordedObservations {
  observations: ObservationsRef;
  events: DomainEvent[];
}

/**
 * What `openEnquiry` produced — #161's audit: the `Question` was withheld,
 * even though it is the half a caller needs to `sharpen` or `accept` later.
 */
export interface OpenedEnquiry {
  enquiry: EnquiryRef;
  question: QuestionRef;
  events: DomainEvent[];
}

/**
 * What `sharpen` produced — #161's audit: the `Decision` holding the frozen
 * what-was-known snapshot was withheld, unlike every other verb that mints
 * one alongside its main effect (`closeEnquiry`, `promote`, `amendDesign`,
 * `reinterpret`).
 */
export interface SharpenedQuestion {
  question: QuestionRef;
  decision: DecisionRef;
  events: DomainEvent[];
}

/**
 * What `recordAnalysis` produced — the analysis, and **the claims it minted**.
 *
 * The claims are here because CLAUDE.md asks of every minting verb: *does the
 * act record what it produced, or only what it acted on?* This one returned
 * only the analysis, so every later reference to one of its claims had to
 * re-identify it **by wording** — which is what {@link ConclusionRef} was, and
 * why it existed. A caller now holds a {@link ClaimRef} the moment the claim
 * exists and never has to describe it again.
 *
 * The output artefact is not named here — #161 first added it directly, then
 * dropped it once `events` existed: it is exactly `events[0].created`'s other
 * member, and `outputArtefactOf()` still earns its keep resolving *other*
 * analyses' artefacts, which this act's own event cannot supply.
 */
export interface RecordedAnalysis {
  analysis: AnalysisRef;
  claims: ConcludedClaim[];
  events: DomainEvent[];
}

/**
 * One claim an analysis minted: its handle, and the proposition it asserts.
 *
 * `finding` is optional, not always-populated the way `claim`/`asserts` are:
 * `recordAnalysis`/`reverify`/`replaceAnalysis` each mint exactly one
 * `Evidence` per conclusion and can name it directly (#132's own step one).
 * A claim reached by wording (`claimsAsserting`) or one that narrows several
 * prior findings into a single reading (`reinterpret`'s `nowClaims`) has no
 * single canonical finding to name here — `evidenceStanding` is where that
 * report lists them instead. Left absent rather than guessed at either way.
 */
export interface ConcludedClaim {
  claim: ClaimRef;
  asserts: string;
  finding?: EvidenceRef;
}

/**
 * What each of the eight single-mint write verbs produced — a name for the one
 * thing the act minted, plus the event that recorded it.
 *
 * Before #161 these returned the bare ref alone (`pose`, `pursue`,
 * `recordReview`, `planWork`, `stateCriterion`, `declareGate`) or nothing at
 * all (`closeEnquiry`, `evaluateCriterion`, `acceptAsUnresolved`, `promote`
 * returned `void`, or later a bare ref once each got its own type-safe
 * widening). `events` is added uniformly rather than case-by-case: "did my
 * write land as event 103" is the same question for every verb, and a
 * surface where six verbs answer one shape and twelve another is the
 * exception-accretion CLAUDE.md's "delete the reason, not the exception"
 * warns about, built on purpose.
 */
export interface Posed {
  question: QuestionRef;
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
export interface Promoted {
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
 * Earned by `why` (#128, redesigned on review): dispatching a single verb on
 * a handle's kind needs to tell "a handle of a kind I don't explain yet"
 * apart from "ordinary prose, go look it up by wording" -- `isRefOfKind`
 * answers only "is this ONE kind", which cannot make that distinction without
 * calling it once per kind and hoping none throw.
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
 * `handle` is a proper `Ref` — a union of every kind {@link
 * SEARCHABLE_PROSE} names a label for, all nine of which have an entry in
 * {@link KIND_BY_LABEL} — not the bare string `fragments/trace.ts`'s
 * `created` field uses. That precedent does not transfer: `trace.ts` is the
 * rendering pipeline, not a report, and PJ-030's rule ("every handle in a
 * report is a `Ref`") makes no exception for a report whose results happen
 * to span several kinds. {@link SearchGroup} already narrows to one label
 * per group, so the kind is never actually mixed within one `matches` array
 * — only across groups, which a union still expresses honestly.
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
    | WorkRef;
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
   * Defaults to `exploratory`, and that default is the point. Until S-7 every
   * claim was written `confirmatory` by the only writer, so a solver diagnosis
   * and a prespecified comparison were indistinguishable — and an amendment
   * that touched only feasibility work reported itself as compromising a
   * confirmatory result, which is a false p-hacking alarm rather than an empty
   * answer. Confirmatory standing is claimed deliberately or not at all.
   *
   * Whether standing should instead be *conferred* by an act was open until
   * S-18 (PJ-008 rows G, K, R), and the answer is **both, for different work**.
   * Declaring here is prespecification: saying before the run that this is the
   * confirmatory comparison, which is the thing a locked design locks. Work
   * that could not have said it — scratch, captured before anyone knew it
   * mattered — is promoted afterwards by `ResearchSession.promote()` and pays
   * for the lateness with a recorded reason. Declaring *after* the fact is the
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
 * reached it. Nested rather than flattened for one measured reason: flattened,
 * every pursuit of an answered question reported *itself* answered and offered
 * the closing evidence as its own, so a caller summing findings across pursuits
 * counted one finding twice. PJ-030 §6.
 */
export interface QuestionClosure {
  /** The question's identity, matching `QuestionStanding.question`. */
  question: QuestionRef;
  /** What it asks, in its own words. */
  asks: string;
  open: boolean;
  /**
   * `accepted-as-unresolved` replaces the `deferred` token, which no verb ever
   * wrote — `enquiryStatus()` could report it and nothing could produce it.
   * S-14 gives the state its one meaning: left open on purpose, with the
   * condition that would reopen it named. "Parked pending work" is a different
   * state and has not been needed by any scenario; it gets built when one needs
   * it, not before.
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
   * The standing of the evidence a closure rests on (S-18). Present when the
   * question is `answered`.
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
 * under `question`, where it cannot be mistaken for this pursuit's own — that
 * separation is the whole of PJ-030 §6, and the shape before it asserted four
 * things of a pursuit that had produced nothing.
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
   * recorded against it — which is a real answer and used to be unavailable,
   * because the only findings this report carried were the question's.
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
 * Earned by #128, narrowed on review (PJ-030, PJ-034 §5): "is this
 * reopening/closure decision warranted?" recurred three times, verbatim,
 * across the real Bonsai transcript, and every instance chained `enquiry`
 * with `known` by hand -- but what the transcript was actually doing was
 * scrolling the whole survey to find where **this** question had landed, not
 * reading every other question in the programme. An earlier version of this
 * report appended the entire `KnowledgeSurvey`; that answers about every
 * question in the record, not the one this report is about (PJ-030), and is
 * exactly the `everything` dump PJ-034 §5 says a detail tool exists not to
 * become. `standing` is `null` only when no question stands behind the
 * enquiry, matching `EnquiryStatus.question` -- every question that exists
 * lands in exactly one bucket of `whatIsKnown()`'s partition, so a non-null
 * question always has one.
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
 * Field-by-field, this is S-11's Afterward list: `affected`/`unaffected` are
 * bullets 1 and 2, `changed`/`unchanged` are bullet 3. Bullets 4 and 5 are
 * queries on the session, because they must remain answerable long after this
 * report was returned.
 */
export interface ReplacementReport {
  at: string;
  /**
   * The analysis this act brought into existence.
   *
   * The act recorded what it replaced and what that cost, and not what it
   * produced — so the replacement was unreachable to the caller that had just
   * created it. Row AB's shape for the fourth time, and the first where the
   * omission blocks a scenario outright rather than degrading an answer: S-3c
   * has to cite the corrected check to evaluate a criterion against it, and
   * could not name it. The remedy is the smallest of the four, which is the
   * point of the heuristic — it says look, not what to do.
   */
  replacement: AnalysisRef;
  /**
   * The claims the replacement minted.
   *
   * Same reason `recordAnalysis` returns its own (PJ-030): a replacement
   * asserts its predecessor's propositions afresh, so after one there are two
   * claims saying each sentence and a caller holding only the analysis has no
   * way to name either. The sixth time CLAUDE.md's *"does the act record what
   * it produced?"* has caught something.
   */
  claims: ConcludedClaim[];
  /**
   * The claims whose support ran through the replaced analysis — enumerable,
   * not "everything downstream". These are the **superseded** records: each is
   * withdrawn by this act, and the replacement's claim asserting the same
   * sentence is in `claims`.
   */
  affected: ConcludedClaim[];
  /** Still valid, and still cited by the replacement. */
  unaffected: UnaffectedRecord[];
  changed: ChangedConclusion[];
  /**
   * The **replacement's** claims whose supporting finding is the same as
   * before. Deliberately the new records and not the superseded ones: every
   * claim in `affected` is withdrawn by this act, so naming those here would
   * report a withdrawn record as unchanged.
   */
  unchanged: ConcludedClaim[];
  /**
   * The event this act recorded — `events[0].created` names the replacement's
   * own output artefact, which is the handle #161 first added a dedicated
   * `artefact` field for and then withdrew once this existed.
   * `outputArtefactOf()` still earns its keep here: it resolves the
   * *superseded* analysis's artefact, which no event of this act can name.
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
   * saying it was "not produced by the replaced analysis" said something
   * false about it (S-11e).
   */
  invalidated?: true;
  /** What it is, in the researcher's words — the wording half this used to lack. */
  named: string;
  why: string;
}

/**
 * Whether a gate may be relied on — S-17's four Afterward questions.
 *
 * `state` deliberately has four values. "Never evaluated" is not a kind of
 * failure and must never read as a pass: a gate nobody has evaluated and a
 * gate that evaluated and failed are different situations, and PJ-001's
 * doctrine is that a missing evaluation must not be confused with a pass.
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
   * Every governing condition, itemised. `never-run` is a first-class value,
   * not the absence of an entry — S-3 requires failing checks to be
   * distinguishable from checks nobody performed.
   */
  checks: CheckStatus[];
  /** Conditions not currently passing — what would have to change. Named before anyone spends the compute. */
  unmet: UnmetCheck[];
  /**
   * Evaluations of this gate's criteria, flattened from `checks`. Empty is an
   * answer, not an absence.
   *
   * `EvaluationRecord`, which is what the code has always put here — the
   * declared type said `{value, outcome, at}` and structural typing let a
   * wider object through, because excess-property checking only applies to
   * object literals. Nothing failed: `tsc` was satisfied, the `Exact<>` gate
   * in `src/mcp/schemas.ts` compared two agreeing *declarations*, and the
   * strict output schema then rejected the real payload at run time — so
   * `gate_status` errored over MCP for any gate that had been evaluated, and
   * no test called it. See `EvaluationRecord.criterion`, whose own comment
   * says this flattened list loses the criterion otherwise.
   */
  evaluations: EvaluationRecord[];
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
   * stands. It is emphatically not `never-run` — the check ran, and reporting
   * otherwise contradicted the `evaluations` list in the same object (external
   * review of S-3c). It counts as unmet, exactly as `never-run` does.
   */
  state: "passed" | "failed" | "never-run" | "no-standing-verdict";
  /**
   * Every evaluation of this criterion for this gate, oldest first, ties
   * broken by identity. Cypher imposes no ordering, so without an explicit
   * sort "the value of this check" is not a stable contract.
   */
  evaluations: EvaluationRecord[];
  /**
   * The evaluation that decided `state` — the failing one where a check
   * failed, since failure is decisive. Absent for a check never run.
   */
  decidedBy?: EvaluationRecord;
}

export interface EvaluationRecord {
  /**
   * This evaluation's handle.
   *
   * It was computed and then discarded on the way out, so two evaluations of
   * different criteria sharing a value, outcome and instant were
   * indistinguishable once `GateStatus.evaluations` flattened them (PJ-030 §7).
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
   * Empty means the verdict was asserted, not measured — a real and different
   * thing from a verdict backed by a result, and S-8's reason for existing:
   * work is promoted "by explicit evidence rather than agent enthusiasm", and
   * the two must not read alike. See PJ-008 row W.
   */
  basis: CitedFinding[];
}

/**
 * What a re-run did and did not establish about a historical result (S-10).
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
   * An `execution: "reproduced" | "not-reproduced"` field used to sit here and
   * was removed for exactly that. It called a reversed rerun of an
   * order-sensitive method a reproduction, and the fix attempted first — a
   * third value meaning "cannot say" — made the guess hedged rather than
   * absent. Two lists and no adjudication is less machinery than either.
   *
   * Order is recorded because the caller supplied it: `recordAnalysis({ from })`
   * takes an ordered array, and discarding it was the actual defect — losing
   * something a caller said, in the record whose job is not to.
   */
  verificationRead: IdentifiedArtefact[];
  /** The same, for the analysis being re-checked. Empty when it recorded nothing. */
  ofRead: IdentifiedArtefact[];
  /**
   * What the two runs did not share. `unrecorded-in-the-original` is the case
   * S-10 exists for and is **not** the same as `changed`: nobody wrote the
   * original's conditions down, so the two are not known to differ and are not
   * known to agree. Row I's distinction, asked of execution instead of evidence.
   */
  differs: Array<{
    /**
     * The input, identified. Not a bare name: two artefacts legitimately share
     * a `logical_name` — a regeneration carries the name of the part it
     * replaces — and a re-run that swapped one for the other reported **two**
     * entries reading "control series", one `changed` and one
     * `not-used-by-the-re-run`, contradicting each other under one label with
     * nothing to tell them apart (S-10c).
     *
     * Fourth read caught doing this, after `reproducibilityOf()` (S-9c) and
     * `whySupported().restingOn` (S-9d). Each decided by `natural_id` and
     * reported the name, which is the shape rather than the incident.
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
 * `part` is identity; `name` is what a person reads. Keeping both is row F's
 * lesson applied to the **output** side of a read — S-9 already took parts by
 * *reference* on the way in, with a comment that a name-keyed map "would merge
 * exactly the two things this scenario exists to keep apart", and then reported
 * bare names on the way out.
 *
 * Two reads have now been caught doing that, which is why this is a shared
 * shape rather than one report's private type. `reproducibilityOf()` put a
 * single name in `exact` and `differing` at once (S-9c), and
 * `whySupported().restingOn` deduplicated two distinct inputs into one entry
 * (S-9d) — hiding, in that case, that a regeneration with inferred provenance
 * was underneath a conclusion.
 *
 * Named for what it is rather than for either caller: this was `ReproducedPart`
 * until a second read needed it, at which point the name described one caller's
 * use of it rather than the thing.
 *
 * The sentence above said `IdentifiedArtefact` — the **new** name — as though it
 * were the old one, directly over the declaration. Written in the same hunk as
 * the rename, in the commit that was itself fixing a comment that disagreed with
 * its code. That is PJ-028's headline: the fix went where the author was
 * looking, and the prose one line up did not.
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
   * Invalidating a record deliberately does **not** withdraw what rests on it
   * — S-11's whole design is that the consequence is *enumerable*, through
   * `whatDependsOn`, rather than automatic. That only holds while the reader
   * can see the retraction. Without this field a conclusion whose sole input
   * had been retracted reported `supported: true` and named the artefact with
   * no hint of its state (S-11e), which is the answer overstating itself
   * rather than the doctrine working.
   */
  invalidated?: true;
}

/**
 * How much of a past construction can be rebuilt (S-9).
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
   * **And false when there were no parts at all** — the sentence above was
   * satisfied vacuously by an analysis that consumed nothing, so this reported
   * that a construction with nothing in it reproduces (S-9e). At least one part
   * must be in `exact`. An analysis whose subject does not exist is refused
   * rather than reported on; absent and empty are different states.
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
 * gives you only an id. This is the shape `QuestionStanding` and
 * `IdentifiedArtefact` already use (PJ-030 §4).
 */
export interface AffectedClaim {
  claim: ClaimRef;
  asserts: string;
}

/**
 * A finding, identified as well as quoted.
 *
 * `evidence` is the handle, `states` what it says. Used wherever a report names
 * findings a conclusion or a decision rests on — PJ-030 §4.
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
 * runs of one method are two analyses and the old shape — a bare method name
 * under `via` — could not tell them apart (PJ-030 §4).
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
 * Designer 2 required that *"no dependency found"* never read as
 * *"independent"*. `docs/consumer-contract/022` §4 classified it as query
 * semantics rather than missing structure and declined to act until someone
 * demonstrated a reader acting on the gap and being wrong. S-11c is that
 * demonstration, and this shape is the whole remedy: no new durable state, no
 * new edge, just an answer that stops overstating itself.
 *
 * The fourth catch on this one verb. PJ-021 found it returning `claims: []` for
 * an input while still naming the enquiry.
 */
export interface DependencyReport {
  /**
   * The artefact this answer is about.
   *
   * Echoed because the verb also accepts a logical **name**, and a caller who
   * passed one otherwise cannot tell which record the name resolved to — the
   * report described a record it never identified. `kind` is `observations`
   * for the same reason the argument's is: the `ART_` prefix does not
   * distinguish a raw input from an analysis output — which PJ-008's row AG
   * measured on 2026-08-24 and found to be reference-model debt rather than a
   * missing distinction, so it is not a claim being made here either.
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
   * `enquiries` and is **not thereby independent**. The known gap, demonstrated
   * in S-11c: `recordAnalysis({ from })` accepts only observations handles, so
   * an analysis cannot read another analysis's output, and a multi-stage
   * pipeline is recorded as disconnected stages. Everything downstream of such
   * a break is unreachable from here.
   */
  routesWalked: string[];
  /**
   * Always `false`, and it is a type-level statement rather than a flag.
   *
   * Traversal here is **open-world**: this reports what was found, never that
   * nothing else exists. A caller cannot write `if (report.complete)` and have
   * it mean anything, which is the point — the alternative is a reader
   * inferring completeness from a populated-looking list, which is what S-11c
   * shows going wrong.
   *
   * **Do not widen this to `boolean`.** Asserting completeness needs to know
   * the relevant dependency set *is* complete, which is durable coverage state
   * this model does not have; `023` §4 preserves that as a discriminator for
   * later and says explicitly not to build it. Widening the type here would
   * ship the assertion without the state behind it.
   */
  complete: false;
}

/** The answer to "why does this conclusion count as supported?" — bullet 4. */
export interface SupportExplanation {
  /**
   * The claim this answer is about.
   *
   * The caller passes a handle in and the report gave back only a sentence, so
   * the answer stopped identifying its own subject the moment it was stored or
   * sent — and over MCP it is exactly a stored blob. Two claims can assert the
   * same sentence (S-5), which is when the omission stops being cosmetic.
   */
  claim: ClaimRef;
  proposition: string;
  /**
   * Whether the record currently stands behind this proposition: evidence
   * supports it, nothing has withdrawn it, and it meets whatever standard it
   * was held to. `support`, `withdrawn` and `unmet` say which of the three is
   * missing when it is false — reporting them identically is the confusion
   * this field has been fixed for twice (S-12, S-3b).
   */
  supported: boolean;
  /**
   * Whether this finding has been promoted to confirmatory standing (S-18).
   * `exploratory` until an act says otherwise — scratch is captured before
   * anyone knows it matters, so the standing cannot be declared at birth.
   */
  standing: "exploratory" | "confirmatory";
  /** Why it was promoted. Present only when `standing` is `confirmatory`. */
  promotedBecause?: string;
  /** Findings currently supporting the proposition, each with the analysis that produced it. */
  support: BearingFinding[];
  /**
   * Analyses that re-checked a supporting finding without reproducing its
   * execution, by method (S-10).
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
   * different state from meeting one and from failing one. S-3b: without this,
   * `supported` meant "some evidence exists" and a finding whose own
   * robustness checks had failed read as plainly supported.
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
   * `name` is `recordObservations({ name })` and never the `finding` text; two
   * different strings describe an observation set and asserting on the wrong
   * one is a mistake this project has already made. But the name is not the
   * identity: `part` is, and `IdentifiedArtefact` says in its own docstring
   * that *"two parts may legitimately share"* a name. Keying on the name
   * collapsed two same-named inputs into one entry (S-9d).
   *
   * This field was `string[]` and this docstring told the reader to key on the
   * name. The commit that widened the type left the instruction standing, so
   * it went on recommending exactly the mistake it had just fixed.
   */
  restingOn: IdentifiedArtefact[];
  /** Findings withdrawn because their analysis was replaced — bullet 5. Either bearing. */
  superseded: Array<BearingFinding & { reason: string; bearing: "supports" | "challenges" }>;
  /**
   * Whether any finding bears *against* this proposition.
   *
   * Distinct from `supported: false`, which is also true of a proposition
   * nobody has ever examined. A claim refuted by a null result and a claim
   * never investigated are different scientific states, and reporting them
   * identically confuses absence of evidence with failure — see S-4.
   */
  challenged: boolean;
  against: BearingFinding[];
  /**
   * Whether the record has stopped claiming this at all.
   *
   * A third state, and it is not `challenged`. Challenged means evidence bears
   * against the sentence; withdrawn means nobody is asserting the sentence any
   * more, usually because a narrower one replaced it. The findings underneath a
   * withdrawn interpretation are untouched — that is the whole point of S-12 —
   * so `support` stays populated while `supported` is false.
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
 * says. The two are kept apart deliberately: S-1 pursues one question two
 * ways and poses two identically-worded questions, and neither may be
 * resolved by comparing text.
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
}

/**
 * What the programme knows, in more states than settled-or-not. The buckets are
 * the fields below; they have been added one scenario at a time and the count
 * is deliberately not written here, because it was wrong for every scenario
 * after the third (PJ-028).
 *
 * `untested` is not a weak form of `unresolved`: one is a question nothing has
 * ever been run against, the other is a question something has been run
 * against without settling it. PJ-001's doctrine that absence of evidence must
 * not read as a negative result is why they are separate lists rather than a
 * flag on one.
 *
 * Boundaries S-1 does not test, and which are therefore classified by
 * structure alone: a question closed *without* cited evidence (abandoned)
 * appears under `unresolved` if anything ever addressed it, and a deferred one
 * appears under `untested` if nothing did.
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
   * The first is S-18's: the finding nobody promoted. A result is relied on and
   * the question is settled *as far as anyone has taken it*, but what settles
   * it is scratch. Kept out of `established` so that reading the survey for
   * "what do we actually know" cannot silently include a lunchtime notebook
   * sweep.
   *
   * The second is S-19's, and it is the opposite shape: the finding somebody
   * **did** promote, held to a prespecified check that failed or was never
   * run. Promotion says a person vouched for it; the check says nobody
   * confirmed it, and S-3b holds a check nobody performed to count against the
   * finding it qualifies.
   *
   * **One bucket rather than a sixth**, which is the answer S-19 arrived at by
   * landing here rather than by being designed. The two reasons differ and the
   * consequence does not: *this is answered, and it is not something to build
   * on*. A reader acts identically on both. Row Y is the standing warning
   * against a bucket built for nobody, and splitting these would be one —
   * `whySupported` already distinguishes them for anyone who needs to know
   * which it is.
   *
   * The heading this renders under said "resting on work nobody promoted"
   * until 2026-08-27, which was true of the first reason and false of the
   * second the moment it existed.
   *
   * `AnsweredQuestion`, not `QuestionStanding` — see its own doc comment.
   */
  provisional: AnsweredQuestion[];
  /**
   * Open on purpose (S-14). Worked on, not settled, and deliberately left —
   * with the condition that would reopen it recorded on the deciding act.
   *
   * Its own bucket rather than a flag on `unresolved`, because a reader
   * scanning for what still needs doing must not find it there. That is the
   * whole of PJ-001's "should not accumulate ceremony" bullet: the alternative
   * is a to-do list that can never be emptied and is therefore never read.
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
 * earlier decision. S-1's hardest Afterward question is asked *after* more
 * evidence has arrived, precisely to catch that.
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
 * the difference between a legitimate repair and p-hacking, and the record has
 * to carry it — S-7's own words. It is derived, not declared: an amendment is
 * scientific exactly when something the confirmatory boundary rests on is in
 * its blast radius. Nobody can set it to "mechanical".
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
 * `amendments` is ordered oldest-first, and that order is reconstructed from
 * the supersession chain alone — no timestamp on any decision, and nothing
 * read from the event log. See PJ-008 row Z for what this does and does not
 * settle about chronology.
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
   * enquiry concluding the same sentence share one (S-12), so a single handle
   * here would be an arbitrary pick between records this act withdrew
   * together. They all assert the same `asserts`; the handles are what differ.
   */
  previously: ConcludedClaim[];
  /** The narrower claim this act minted. It had no handle until PJ-030. */
  nowClaims: ConcludedClaim;
  /** Findings that carried the old reading and carry the new one. Unchanged, and demonstrably so. */
  evidenceStanding: CitedFinding[];
  /** Things decided on the strength of the old sentence — not things computed from the numbers. */
  restingOnTheOldReading: DecidedQuestion[];
  requiresRecomputation: boolean;
  /**
   * The event this act recorded — `events[0].created` names the `Review` and
   * the `Decision` this act minted, both withheld entirely before #161: every
   * other act that mints a `Decision` and/or a `Review` alongside its main
   * effect (`closeEnquiry`, `promote`, `replaceAnalysis`) hands the caller a
   * dedicated field, and the event carries the same information without one.
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
  /** The claim's handle. Two sides can assert the same sentence about different endpoints (S-5). */
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
 * sentences — S-5's two claims are worded identically on purpose. Two claims
 * of the same scope with opposing support contradict each other; two claims of
 * different scope do not, however alike they read.
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
 * The line of enquiry (and the question behind it) a task exists to advance
 * (#98). Carries wording alongside each handle, matching `EnquiryStatus.pursuing`
 * and `QuestionClosure.asks` -- the demonstrated need was "why does this task
 * exist" answering nothing, and a bare handle answers that only for a caller
 * willing to chain a second read. `question` is never absent when `enquiry`
 * is present: `pursue()` requires a question to open a line of enquiry, so
 * every `LineOfEnquiry` has exactly one `MOTIVATES` edge behind it by
 * construction.
 *
 * Named and shared (not inlined per report) because #128 gave it a second
 * reader: `WorkExplanation`'s `report` is the same `TaskContract` this shape
 * already sat on.
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
 * the system cannot give — S-8's own expressibility note concedes this.
 */
export interface TaskContract {
  /** The work's handle. `GateStatus.gating` names the same entity as `{work, objective}`. */
  work: WorkRef;
  objective: string;
  acceptance: string;
  mayRead: string[];
  enforced: false;
  /** Absent, not `null`, when `planWork` wasn't told one -- ungated work (#91) is a genuine case. */
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
 * One record a `why` explanation cites, and what it says — the shape
 * `because` is built from (#128, redesigned on review).
 *
 * The same `{handle, wording}` convention every other report in this file
 * uses (PJ-030 §4); `when` is present only where the cited record carries an
 * instant of its own (an evaluation, a decision), which is why it is optional
 * rather than always asked for.
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
 * the tty gets a sentence — `GATE_1 is blocked because CRIT_2 "…" failed on
 * 2026-08-04 and CRIT_3 "…" has never been run` is Gate's, dictated on #182.
 * `report` carries the kind's own existing report **unflattened**: an
 * envelope that dictated the embedded shape would have cost `why CLM_1` the
 * *Resting on / Held to / Ultimately resting on* view it has today, for a
 * one-line sentence — a regression wearing a redesign.
 *
 * A discriminated union, not one interface with optional fields: `report`'s
 * type differs by `kind`, and a caller narrowing on `kind` gets the right one
 * without a cast. Only the kinds `read.ts`'s `EXPLAINED` table has a case for
 * are members — the rest are #182's remaining kinds, added one at a time as
 * someone asks and gets the refusal (the usage-era bar, per #182's own
 * text) — and a kind `why` does not yet explain never constructs one of
 * these; it throws instead.
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
export type Explanation = ClaimExplanation | WorkExplanation | EnquiryExplanation | GateExplanation;

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
