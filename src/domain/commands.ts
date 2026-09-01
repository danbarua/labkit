/**
 * The write half's command shapes, named.
 *
 * `report.ts` is the read model — what a question to the record returns.
 * This is its counterpart: what an act on the record takes. The two files are
 * the domain's DTOs, and until now only one of them existed, because every
 * verb in `write.ts` declared its argument shape inline and anonymously. A
 * caller could satisfy those shapes but could not *hold* one, which is what an
 * MCP write tool will have to do.
 *
 * **Extraction only.** Every shape below is the one its verb already had,
 * moved rather than redesigned, doc comments and all — the reasoning on a
 * field belongs with the field, and `bun run check:doc-comments` enforces
 * that. Structural typing means no call site changed; `tsc` proves it.
 *
 * The verbs taking a single scalar — `pose`, `openEnquiry`, `stateCriterion` —
 * are deliberately absent. A named type wrapping one `string` is ceremony, and
 * the argument is already named by the parameter.
 */

import type {
  AnalysisRef,
  Conclusion,
  CriterionRef,
  EnquiryRef,
  GateRef,
  InputRef,
  QuestionRef,
  ReviewRef,
  WorkRef,
  ClaimRef,
  EvidenceRef,
} from "./report";

/** `pursue` — open a line of enquiry against a question already on the record. */
export interface PursueCommand {
  question: QuestionRef;
  approach: string;
}

/** `sharpen` — narrow a question into a more precise one, recording why. */
export interface SharpenCommand {
  from: QuestionRef;
  into: string;
  because: string;
}

/** `recordObservations` — put measurement on the record, without analysing it. */
export interface RecordObservationsCommand {
  enquiry: EnquiryRef;
  name: string;
  finding: string;
  contentHash?: string;
}

/**
 * `recordAnalysis` — a computation, its evidence unit, and its output artefact.
 *
 * **It takes no conclusions, and that is #173.** A conclusion is its own act:
 * findings arrive one at a time, over days, and `conclude` records one. The
 * array this used to carry is why exactly three of eighteen CLI commands took
 * JSON, and they were exactly the three that mint conclusions.
 *
 * A run with its findings already on it, in one call, is what a test usually
 * wants — and that is a **fragment**, `fragments/index.ts`'s `recordAnalysis`,
 * same name with the surface first. Dan's own definition of one: *"one
 * 'Afterward' question, one complete call."* The domain layer holds the
 * primitives; a move over them is a fragment.
 */
export interface RecordAnalysisCommand {
  enquiry: EnquiryRef;
  method: string;
  /**
   * What this analysis read. Earned by S-11d, row AE.
   *
   * Until it accepted an `AnalysisRef`, a two-stage pipeline had one
   * recordable form — re-enter the intermediate as if it were fresh
   * measurement — and that produced a confidently wrong answer: stage two
   * reported `reproducible: true` while resting on data the record itself
   * called unverifiable, because the re-entered intermediate carried a hash
   * of its own and the chain to the real input was severed.
   *
   * See {@link InputRef} for why the other two recording verbs now take the
   * same type.
   */
  from: InputRef[];
  /**
   * The planned work this analysis carries out, if it carries out any.
   *
   * Earned by S-7: a gate protects work, and until an analysis said which
   * work it was, the blast radius of amending a gated condition reached the
   * *work* and stopped there — so "was any confirmatory result affected?"
   * could only be answered by asserting it. `IMPLEMENTS` already existed
   * for this and had never been written.
   */
  implementing?: WorkRef;
  /**
   * The prespecified conditions this analysis's conclusions are held to.
   *
   * Earned by S-3b: criteria that qualify a finding and gate nothing. The
   * checks are agreed before the run, so they are stated separately and
   * named here; recording them at evaluation time cannot work, because a
   * check nobody ran must still count against the finding. See
   * EDGE_SCHEMA.QUALIFIES.
   */
  heldTo?: CriterionRef[];
}

/** `recordReview` — a verdict on an analysis, which a later retraction can rest on. */
export interface RecordReviewCommand {
  of: AnalysisRef;
  verdict: string;
}

/** `closeEnquiry` — answered, or abandoned when `answeredBy` is absent. */
export interface CloseEnquiryCommand {
  enquiry: EnquiryRef;
  answeredBy?: ClaimRef;
}

/** `planWork` — state an objective and what would count as meeting it. */
export interface PlanWorkCommand {
  objective: string;
  acceptance: string;
  /**
   * What this work is permitted to read. Closed-world — see `TaskContract`.
   *
   * Earned by S-8, and the first walk of `TaskProps.inputs`, which
   * `planWork()` had hardcoded to `""` since it was written. Stored as JSON
   * rather than a delimited string so an entry containing punctuation cannot
   * silently split; if a scenario ever needs to query *by element*, that is
   * when it becomes a real list property rather than a serialised one.
   */
  mayRead?: string[];
  /**
   * The line of enquiry this work exists to advance, if any.
   *
   * Earned by #98: `labkit contract` could not say why a piece of planned
   * work exists, and the real Bonsai record has a task (Stage 2A's
   * feasibility-ladder gate) that exists specifically to serve a question,
   * with nothing to say so. Optional because `planWork` allows ungated work
   * (#91) — a task with no enquiry is still an honest answer, not a missing
   * one, matching PJ-011 §5.
   */
  addressing?: EnquiryRef;
}

/** `declareGate` — bind criteria to the work they gate. */
export interface DeclareGateCommand {
  governedBy: CriterionRef[];
  consequence: string;
  protecting: WorkRef[];
}

/** `evaluateCriterion` — record a check's outcome, optionally citing what decided it. */
export interface EvaluateCriterionCommand {
  criterion: CriterionRef;
  /**
   * The gate this verdict is being reached for, if it is being reached for
   * one. Omitted when the condition qualifies a finding and gates no work —
   * S-3b, where requiring a gate forced the caller to mint one that
   * protected nothing.
   */
  gate?: GateRef;
  value: string;
  outcome: "pass" | "fail";
  /** The finding this verdict was reached against, if it was reached against one. */
  citing?: ClaimRef;
}

/** `reverify` — re-run a historical analysis under current observations. Not reproduction (S-10). */
export interface ReverifyCommand {
  historical: AnalysisRef;
  enquiry: EnquiryRef;
  method: string;
  /** What the re-verification read this time. {@link InputRef} — an earlier analysis's output counts. */
  under: InputRef[];
  concludes: Conclusion;
}

/** `acceptAsUnresolved` — leave a question open on purpose, with the condition that reopens it (S-14). */
export interface AcceptAsUnresolvedCommand {
  enquiry: EnquiryRef;
  /** Why it is being accepted rather than pursued. */
  because: string;
  /** What would reopen it. About the world, not about re-running the same analysis. */
  until: string;
  /** The finding it is being accepted in light of — what was known at the time. */
  inLightOf: ClaimRef;
}

/** `amendDesign` — change a locked criterion's wording, and report whether the change was mechanical or scientific. */
export interface AmendDesignCommand {
  criterion: CriterionRef;
  nowRequires: string;
  because: string;
  citing: ClaimRef;
}

/**
 * `conclude` — assert one thing an analysis found.
 *
 * One conclusion, one call, one event. `recordAnalysis`, `replaceAnalysis` and
 * `reverify` compose it; both surfaces expose this one.
 *
 * `proposition` is required **unless** `replacing` is given, in which case it
 * and `bearing` are inherited from the finding being superseded. Passing both is
 * an override, not a conflict.
 */
export interface ConcludeCommand {
  /** The analysis this conclusion belongs to. */
  analysis: AnalysisRef;
  /** What was found, in this analysis's own words. */
  finding: string;
  /**
   * The proposition the finding bears on.
   *
   * Optional only in the `replacing` case. Absent with nothing to inherit from
   * is a refusal, not a default: a conclusion is *about* something, and there is
   * no sensible thing to assume.
   */
  proposition?: string;
  /** Which way the finding cuts. Inherited when replacing; otherwise `supports`. */
  bearing?: "supports" | "challenges";
  /** Confirmatory standing. Defaults to `exploratory` — see {@link Conclusion}. */
  standing?: "exploratory" | "confirmatory";
  /**
   * The single finding this supersedes — a claim or an evidence handle.
   *
   * **One finding, not an analysis.** Coverage is exactly the calls the caller
   * made: a conclusion nothing names goes on standing, and so does everything
   * citing it.
   */
  replacing?: ClaimRef | EvidenceRef;
}

/**
 * One of a replacement's conclusions, and which earlier finding it stands in
 * for.
 *
 * `Conclusion` plus `replacing`, rather than a field on `Conclusion` itself:
 * `recordAnalysis` records a run that supersedes nothing.
 */
export interface ReplacementConclusion extends Conclusion {
  /**
   * The earlier finding this one stands in for, when the caller wants to say.
   *
   * **Optional, and never inferred at write time.** After `keep`, supersession
   * has already happened — every conclusion not kept fell when the revision was
   * recorded — so a new conclusion needs no pairing to be correct. Naming one
   * is how a caller states which finding this stands in place of, for a reader
   * that would otherwise have to match on wording.
   */
  replacing?: ClaimRef | EvidenceRef;
}

/**
 * `keep` — revise an analysis by naming the conclusions that survive.
 *
 * The inverse of naming each finding superseded, and the safer default: a
 * caller who forgets an entry supersedes something that is still true, which a
 * reader sees, rather than leaving something stale standing, which reads as
 * current.
 *
 * Every other conclusion of the analysis those claims came from is superseded
 * at this moment. The successor's own findings are recorded afterwards with
 * `conclude`.
 */
export interface KeepCommand {
  /**
   * The conclusions that survive the revision.
   *
   * They must come from **one** analysis — that is what identifies the analysis
   * being revised, so claims spanning two are refused rather than resolved to
   * whichever came first. May be empty only through `replaceAnalysis`, which is
   * the nothing-kept case said out loud.
   */
  keeping: ClaimRef[];
  /** The review that found the analysis wanting. */
  because: ReviewRef;
  /** What the revision did differently. */
  method: string;
  /**
   * Inputs the successor read **in addition to** the superseded analysis's own.
   *
   * Add-only: a revision reads what its predecessor read unless it says
   * otherwise, so re-listing them is work a caller should not have to do.
   */
  from?: InputRef[];
}

/**
 * `replaceAnalysis` — record a corrected analysis in place of a defective one,
 * and the lineage between them.
 *
 * **It takes no conclusions.** The replacement's findings are recorded with
 * `conclude`, one at a time, each naming the finding it supersedes; one the
 * caller does not name goes on standing. A run with its findings already on it
 * is a fragment — see `fragments/index.ts`.
 */
export interface ReplaceAnalysisCommand {
  supersedes: AnalysisRef;
  because: ReviewRef;
  method: string;
  /**
   * Inputs the replacement read **in addition to** the superseded analysis's
   * own. Add-only, as {@link KeepCommand.from} is.
   */
  from?: InputRef[];
}

/** `reinterpret` — narrow what a claim is taken to mean, without re-running anything. */
export interface ReinterpretCommand {
  /**
   * Which claim. A bare proposition while the sentence is asserted once;
   * naming the analysis that concluded it when it is not — S-5, where
   * withdrawing by wording alone retracted an unrelated line of work.
   */
  of: ClaimRef;
  as: string;
  because: string;
}

/** `promote` — move a finding from scratch to citable (S-18). */
export interface PromoteCommand {
  claim: ClaimRef;
  because: string;
}
