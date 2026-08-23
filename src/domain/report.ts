/**
 * What the domain layer hands back — research answers, not graph rows.
 *
 * Every type here is derived from one of S-11's "Afterward" bullets
 * (docs/project-journal/008_user_story_mining.md). That direction matters: if
 * a bullet has no natural home in these types, the API is wrong rather than
 * the bullet. Nothing here mentions a node or edge label.
 */

/** A handle a caller passes back in. Opaque: the id inside is LabKit's short natural id, never AGE's internal graphid. */
export interface Ref<K extends string> {
  readonly kind: K;
  readonly id: string;
}

/** Builds a handle. Terser than the literal at the ~40 sites that mint one. */
export const ref = <K extends string>(kind: K, id: string): Ref<K> => ({ kind, id });

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

/** An evaluation of a criterion, by identity. */
export type EvaluationRef = Ref<"evaluation">;

/** A decision, by identity. */
export type DecisionRef = Ref<"decision">;

/**
 * What `recordAnalysis` produced — the analysis, and **the claims it minted**.
 *
 * The claims are here because CLAUDE.md asks of every minting verb: *does the
 * act record what it produced, or only what it acted on?* This one returned
 * only the analysis, so every later reference to one of its claims had to
 * re-identify it **by wording** — which is what {@link ConclusionRef} was, and
 * why it existed. A caller now holds a {@link ClaimRef} the moment the claim
 * exists and never has to describe it again.
 */
export interface RecordedAnalysis {
  analysis: AnalysisRef;
  claims: ConcludedClaim[];
}

/** One claim an analysis minted: its handle, and the proposition it asserts. */
export interface ConcludedClaim {
  claim: ClaimRef;
  asserts: string;
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
  before: string;
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
  /** Propositions whose support ran through the replaced analysis — enumerable, not "everything downstream". */
  affected: string[];
  /** Still valid, and still cited by the replacement. */
  unaffected: UnaffectedRecord[];
  changed: ChangedConclusion[];
  unchanged: string[];
}

export interface UnaffectedRecord {
  /** The record's handle. */
  what: ObservationsRef;
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
  /** Evaluations of this gate's criteria. Empty is an answer, not an absence. */
  evaluations: Array<{ value: string; outcome: "pass" | "fail"; at: string }>;
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
   * Whether the same execution was reproduced — the same recorded inputs, not
   * merely the same protocol. `not-reproduced` covers "the original never
   * recorded what it consumed", which is absence rather than difference; see
   * `differs`.
   */
  execution: "reproduced" | "not-reproduced";
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
  /**
   * Whether the two runs' numbers may be put side by side.
   *
   * Carried here rather than enforced by a refusing verb: LabKit has nothing
   * that plots or compares numbers, so a command existing only to reject its
   * arguments would be a feature invented to manufacture a wrong answer. The
   * caveat instead travels with the report a reader already asks for.
   */
  comparable: boolean;
  /** Why not, when `comparable` is false. Absent when it is true. */
  incomparableBecause?: string;
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
  /** Settled on cited evidence. Polarity is not here — an answered "no" is still settled; see `EnquiryStatus.answer`. */
  established: QuestionStanding[];
  /** Worked on, not settled. */
  unresolved: QuestionStanding[];
  /** On the books, never pursued. Not a failure and not an inconclusive result. */
  untested: QuestionStanding[];
  /**
   * Answered, but on a finding nobody has promoted (S-18).
   *
   * Its own bucket, and the distinction the story exists for: a
   * result is being relied on and the question is settled *as far as anyone has
   * taken it*, but what settles it is scratch. Kept out of `established` so
   * that reading the survey for "what do we actually know" cannot silently
   * include a lunchtime notebook sweep.
   */
  provisional: QuestionStanding[];
  /**
   * Open on purpose (S-14). Worked on, not settled, and deliberately left —
   * with the condition that would reopen it recorded on the deciding act.
   *
   * Its own bucket rather than a flag on `unresolved`, because a reader
   * scanning for what still needs doing must not find it there. That is the
   * whole of PJ-001's "should not accumulate ceremony" bullet: the alternative
   * is a to-do list that can never be emptied and is therefore never read.
   */
  accepted: QuestionStanding[];
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
  previously: string;
  nowClaims: string;
  /** Findings that carried the old reading and carry the new one. Unchanged, and demonstrably so. */
  evidenceStanding: CitedFinding[];
  /** Things decided on the strength of the old sentence — not things computed from the numbers. */
  restingOnTheOldReading: DecidedQuestion[];
  requiresRecomputation: boolean;
}

/** One revision of an interpretation, read back long afterwards. */
export interface Revision {
  revision: DecisionRef;
  previously: string;
  nowClaims: string;
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
  originally: string;
  nowClaims: string;
  revisions: Revision[];
}

/**
 * How a caller names one claim rather than another.
 *
 * A bare proposition is fine while a sentence is asserted in one line of
 * enquiry, which is the ordinary case. When the same words are asserted in
 * two, it stops identifying anything and a `ConclusionRef` — this analysis,
 * this proposition — is what picks one out. See S-5.
 */
export type ClaimSubject = string | ConclusionRef;

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
}
