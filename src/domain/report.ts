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
export type CriterionRef = Ref<"criterion">;
export type GateRef = Ref<"gate">;
export type WorkRef = Ref<"work">;
export type AnalysisRef = Ref<"analysis">;
export type ReviewRef = Ref<"review">;
export type EnquiryRef = Ref<"enquiry">;

/** One proposition an analysis concluded, and the finding that supports it. */
export interface Conclusion {
  proposition: string;
  finding: string;
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
 * `state` deliberately has three values, not two. "Never evaluated" is not a
 * kind of failure and must never read as a pass: a gate nobody has evaluated
 * and a gate that evaluated and failed are different situations, and PJ-001's
 * doctrine is that a missing evaluation must not be confused with a pass.
 */
export interface GateStatus {
  gate: string;
  consequence: string;
  state: "never-evaluated" | "blocked" | "satisfied";
  /** Evaluations of this gate's criterion. Empty is an answer, not an absence. */
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

/** The answer to "why does this conclusion count as supported?" — bullet 4. */
export interface SupportExplanation {
  proposition: string;
  supported: boolean;
  /** Findings currently supporting the proposition, each with the analysis that produced it. */
  support: Array<{ finding: string; via: string }>;
  /** Observations the supporting findings ultimately rest on. */
  restingOn: string[];
  /** Support that was withdrawn, and why — bullet 5. */
  superseded: Array<{ finding: string; via: string; reason: string }>;
}
