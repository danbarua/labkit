/**
 * The write half's command shapes, named.
 */

import type {
  AnalysisRef,
  AnyRef,
  Conclusion,
  CriterionRef,
  EnquiryRef,
  GateRef,
  InputRef,
  NoteRef,
  QuestionRef,
  ReviewRef,
  WorkRef,
  ClaimRef,
  EvidenceRef,
  ObservationsRef,
} from "./report";
import type { Prose } from "../db/domain";

/**
 * `synthesise` — one finding drawn across others, running nothing new.
 */
export interface SynthesiseCommand {
  proposition: Prose;
  restingOn: ClaimRef[];
}

/** `pose` — put a question on the record, unpursued. */
export interface PoseCommand {
  question: Prose;
  /** The note this question came out of, when it came out of one. */
  from?: NoteRef;
}

/** `openEnquiry` — pose a question and pursue it, as one act. */
export interface OpenEnquiryCommand {
  question: Prose;
  from?: NoteRef;
}

/** `stateCriterion` — state a condition a result will be held to. */
export interface StateCriterionCommand {
  proposition: Prose;
}

/** `pursue` — open a line of enquiry against a question already on the record. */
export interface PursueCommand {
  question: QuestionRef;
  approach: string;
}

/**
 * `note` — a dated, attributed record with nothing else required.
 */
export interface NoteCommand {
  text: string;
  on?: AnyRef;
  /**
   * A question this note is the reason for — the other direction of `pose --from`, for when the
   * note is written after the question rather than before it.
   */
  prompted?: QuestionRef;
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
 */
export interface RecordAnalysisCommand {
  enquiry: EnquiryRef;
  method: string;
  /**
   * What this analysis read.
   */
  from: InputRef[];
  /**
   * The planned work this analysis carries out, if it carries out any.
   */
  implementing?: WorkRef;
  /**
   * The prespecified conditions this analysis's conclusions are held to.
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

/**
 * `stopWork` — planned work somebody decided not to do.
 */
export interface StopWorkCommand {
  work: WorkRef;
  because: Prose;
}

/** `planWork` — state an objective and what would count as meeting it. */
export interface PlanWorkCommand {
  objective: string;
  acceptance: string;
  /**
   * What this work is permitted to read. Closed-world — see `TaskContract`.
   */
  mayRead?: string[];
  /**
   * The line of enquiry this work exists to advance, if any.
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
   * one. Omitted when the condition qualifies a finding and gates no work;
   * requiring a gate would force the caller to mint one protecting nothing.
   */
  gate?: GateRef;
  value: string;
  outcome: "pass" | "fail";
  /**
   * What this verdict was reached against — the evidence, by whichever route the caller holds.
   */
  citing?: CitedBasis[];
  /**
   * The finding this verdict is about, when one rule is applied to several.
   */
  about?: ClaimRef;
}

/**
 * A route to the evidence a verdict rests on.
 */
export type CitedBasis = ClaimRef | ObservationsRef | EvidenceRef;

/** `reverify` — re-run a historical analysis under current observations. Not reproduction (S-10). */
export interface ReverifyCommand {
  historical: AnalysisRef;
  /**
   * Optional: the analysis being re-checked knows its own enquiry, and one hop from what the
   * caller already named is inferred rather than restated. Given explicitly it is honoured — a
   * re-check may be recorded under a different line of enquiry than the analysis it re-checks.
   */
  enquiry?: EnquiryRef;
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
  /**
   * The diagnosis the amendment rests on. Omitted only while the condition has never been
   * evaluated — before the first number there is nothing to have found.
   */
  citing?: ClaimRef;
}

/**
 * `conclude` — assert one thing an analysis found.
 */
export interface ConcludeCommand {
  /** The analysis this conclusion belongs to. */
  analysis: AnalysisRef;
  /** What was found, in this analysis's own words. */
  finding: string;
  /**
   * The proposition the finding bears on.
   */
  proposition?: string;
  /** Which way the finding cuts. Inherited when replacing; otherwise `supports`. */
  bearing?: "supports" | "challenges";
  /** Confirmatory standing. Defaults to `exploratory` — see {@link Conclusion}. */
  standing?: "exploratory" | "confirmatory";
  /**
   * The single finding this supersedes — a claim or an evidence handle.
   */
  replacing?: ClaimRef | EvidenceRef;
}

/**
 * One of a replacement's conclusions, and which earlier finding it stands in for.
 */
export interface ReplacementConclusion extends Conclusion {
  /**
   * The earlier finding this one stands in for, when the caller wants to say.
   */
  replacing?: ClaimRef | EvidenceRef;
}

/**
 * `keep` — revise an analysis by naming the conclusions that survive.
 */
export interface KeepCommand {
  /**
   * The conclusions that survive the revision.
   */
  keeping: ClaimRef[];
  /** The review that found the analysis wanting. */
  because: ReviewRef;
  /** What the revision did differently. */
  method: string;
  /**
   * Inputs the successor read **in addition to** the superseded analysis's own.
   */
  from?: InputRef[];
}

/**
 * `replaceAnalysis` — record a corrected analysis in place of a defective one, and the lineage
 * between them.
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
   * Which claim, by handle. Withdrawing by wording alone retracts every claim
   * asserting the sentence, including an unrelated line of work.
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

/**
 * A state a claim can be put into, and the whole of what `is` accepts.
 */
export type ClaimState = "undecided" | "confirmed";

/**
 * Puts a claim into a state, and says what put it there.
 */
export type IsCommand =
  | { claim: ClaimRef; state: "undecided"; because: EvidenceRef }
  | { claim: ClaimRef; state: "confirmed"; because: Prose };

/**
 * `undo` — takes back a mistaken act by naming the event it recorded.
 */
export interface UndoCommand {
  event: number;
  because: Prose;
}

/** Every command the write surface takes. What an act was asked to do. */
export type Command =
  | AcceptAsUnresolvedCommand
  | AmendDesignCommand
  | CloseEnquiryCommand
  | ConcludeCommand
  | DeclareGateCommand
  | EvaluateCriterionCommand
  | IsCommand
  | KeepCommand
  | NoteCommand
  | OpenEnquiryCommand
  | PlanWorkCommand
  | PoseCommand
  | PromoteCommand
  | PursueCommand
  | RecordAnalysisCommand
  | RecordObservationsCommand
  | StopWorkCommand
  | RecordReviewCommand
  | ReinterpretCommand
  | ReplaceAnalysisCommand
  | ReverifyCommand
  | SharpenCommand
  | StateCriterionCommand
  | SynthesiseCommand
  | UndoCommand;
