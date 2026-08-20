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
   * Whether standing should instead be *conferred* by an act — preregistration,
   * promotion, passing a confirmatory gate — rather than declared at creation
   * is still open; see PJ-008 rows G, K and R.
   */
  standing?: "exploratory" | "confirmatory";
}

/**
 * Whether an enquiry is still open, and if not, how it closed.
 *
 * `closure` distinguishes three things that must not collapse into one:
 * a question that was **answered** on evidence, one **abandoned** without
 * any, and one **deferred**. `answer` carries polarity — a question can be
 * answered "no" and that is a substantive result, not a failure.
 */
export interface EnquiryStatus {
  enquiry: string;
  question: string;
  open: boolean;
  closure: "answered" | "abandoned" | "deferred" | null;
  answer: "yes" | "no" | null;
  /** The findings the closing decision rests on. Empty means nothing was cited. */
  evidence: string[];
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
  /** Propositions whose support ran through the replaced analysis — enumerable, not "everything downstream". */
  affected: string[];
  /** Still valid, and still cited by the replacement. */
  unaffected: UnaffectedRecord[];
  changed: ChangedConclusion[];
  unchanged: string[];
}

export interface UnaffectedRecord {
  what: string;
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
  gate: string;
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
  unmet: string[];
  /** Evaluations of this gate's criteria. Empty is an answer, not an absence. */
  evaluations: Array<{ value: string; outcome: "pass" | "fail"; at: string }>;
  /** What is currently relying on this gate — the blast radius of a fake guard. */
  gating: string[];
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
  criterion: string;
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
  basis: string[];
}

/**
 * What a re-run did and did not establish about a historical result (S-10).
 *
 * Two verdicts, deliberately not one: a conclusion can be re-reached by an
 * execution that was never reproduced, and collapsing those into a single
 * boolean is the mistake the scenario is named after.
 */
export interface ReproductionReport {
  /** The re-verifying analysis, by method. */
  verification: string;
  /** The historical analysis it re-checked, by method. */
  of: string;
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
    what: string;
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
 * How much of a past construction can be rebuilt (S-9).
 *
 * Three outcomes per part, not two. A part whose hash was never recorded is
 * **unverifiable**, which is not the same as one whose hash differs: nobody can
 * say whether it came back the same, and reporting it as differing would claim
 * knowledge the record does not have. Row I's absence-versus-difference
 * distinction, asked of an artefact.
 */
export interface ReproducibilityReport {
  /** Parts whose recorded hash matches the one offered, by name. */
  exact: string[];
  /** Parts whose recorded hash disagrees with the one offered. */
  differing: string[];
  /** Parts with no recorded hash — unanswerable, not unequal. */
  unverifiable: string[];
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
  notRebuilt: string[];
  /**
   * Whether the whole construction reproduces. False unless every part was
   * rebuilt and matched: anything differing, unverifiable or not attempted
   * leaves the construction unshown, and this is the field that must not
   * quietly say otherwise.
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
  /** Findings currently supporting the proposition, each with the analysis that produced it. */
  support: Array<{ finding: string; via: string }>;
  /**
   * Analyses that re-checked a supporting finding without reproducing its
   * execution, by method (S-10).
   *
   * Kept out of `support` deliberately. A re-verification is not a second
   * independent finding, and listing it as one made a claim established once
   * report itself as corroborated twice — see `EDGE_SCHEMA.REVERIFIES`.
   */
  reverifiedBy: string[];
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
  unmet: string[];
  /**
   * Observations the supporting findings ultimately rest on, by the **name**
   * they were recorded under — `recordObservations({ name })`, not the
   * `finding` text. Two different strings describe an observation set, and
   * asserting on the wrong one is a mistake this project has already made
   * once.
   */
  restingOn: string[];
  /** Findings withdrawn because their analysis was replaced — bullet 5. Either bearing. */
  superseded: Array<{ finding: string; via: string; reason: string; bearing: "supports" | "challenges" }>;
  /**
   * Whether any finding bears *against* this proposition.
   *
   * Distinct from `supported: false`, which is also true of a proposition
   * nobody has ever examined. A claim refuted by a null result and a claim
   * never investigated are different scientific states, and reporting them
   * identically confuses absence of evidence with failure — see S-4.
   */
  challenged: boolean;
  against: Array<{ finding: string; via: string }>;
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
  replacedBy?: string;
}

/**
 * A question on the record. `question` is its identity; `asks` is what it
 * says. The two are kept apart deliberately: S-1 pursues one question two
 * ways and poses two identically-worded questions, and neither may be
 * resolved by comparing text.
 */
export interface QuestionStanding {
  question: string;
  asks: string;
}

/**
 * What the programme knows, in three states rather than two.
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
  from: string;
  /** What that question asked — still in its original words. */
  fromAsks: string;
  /** Why it was sharpened. */
  reason: string;
  knownAtTheTime: string[];
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
  amendment: string;
  /** The setting as it stood, in its own words. Still readable afterwards — amending is not editing. */
  replaced: string;
  nowRequires: string;
  /** Work the amended condition protected, and which therefore has to be run again. Enumerated, not "everything downstream". */
  rerun: string[];
  /** Confirmatory results in the blast radius. Empty is the claim "none", and it is computed rather than assumed. */
  confirmatoryAffected: string[];
  nature: "mechanical" | "scientific";
}

/** One amendment in a design's history, as read back long afterwards. */
export interface AmendmentRecord {
  amendment: string;
  replaced: string;
  nowRequires: string;
  reason: string;
  /** The findings the amendment was actually taken on — cited specifically, not a snapshot of everything known. */
  citing: string[];
  rerun: string[];
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
  gate: string;
  /** What the design said before anyone amended it. */
  originally: string;
  nowRequires: string;
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
  evidenceStanding: string[];
  /** Things decided on the strength of the old sentence — not things computed from the numbers. */
  restingOnTheOldReading: string[];
  requiresRecomputation: boolean;
}

/** One revision of an interpretation, read back long afterwards. */
export interface Revision {
  revision: string;
  previously: string;
  nowClaims: string;
  reason: string;
  restingOnTheOldReading: string[];
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
  proposition: string;
  /** The question this claim answers. Where its scope lives — derived, not stored on the claim. */
  asks: string;
  supportedBy: string[];
  challengedBy: string[];
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
  objective: string;
  acceptance: string;
  mayRead: string[];
  enforced: false;
}
