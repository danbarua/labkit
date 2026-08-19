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
  state: "passed" | "failed" | "never-run";
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
}

/** The answer to "why does this conclusion count as supported?" — bullet 4. */
export interface SupportExplanation {
  proposition: string;
  supported: boolean;
  /** Findings currently supporting the proposition, each with the analysis that produced it. */
  support: Array<{ finding: string; via: string }>;
  /** Observations the supporting findings ultimately rest on. */
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
