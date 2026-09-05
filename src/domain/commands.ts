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
 * Every operation is a command.
 */

import type {
  AnalysisRef,
  AnyRef,
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
  ObservationsRef,
} from "./report";
import type { Prose } from "../db/domain";

/**
 * `synthesise` — one finding drawn across others, running nothing new.
 *
 * `restingOn` is what it is drawn from, and it is the whole of what makes the
 * claim: a synthesis has no method, no input and no output, so there is
 * nothing else for a reader to reach it by.
 */
export interface SynthesiseCommand {
  proposition: Prose;
  restingOn: ClaimRef[];
}

/** `pose` — put a question on the record, unpursued. */
export interface PoseCommand {
  question: Prose;
}

/** `openEnquiry` — pose a question and pursue it, as one act. */
export interface OpenEnquiryCommand {
  question: Prose;
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
 *
 * `on` is the only other field, and it is optional on purpose: attaching a
 * note is cheap, and requiring an attachment is the gate this verb exists to
 * remove. It takes any handle already on the record, not one specific kind —
 * a note may concern a question, a claim, a gate, another note, anything.
 */
export interface NoteCommand {
  text: string;
  on?: AnyRef;
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
 * **It takes no conclusions.** A conclusion is its own act, recorded by
 * `conclude`. A run with its findings already on it, in one call, is
 * `fragments/index.ts`'s `recordAnalysis` — same name, surface first.
 */
export interface RecordAnalysisCommand {
  enquiry: EnquiryRef;
  method: string;
  /**
   * What this analysis read.
   *
   * **It accepts an `AnalysisRef`**, without which a two-stage pipeline has one
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
   * A gate protects work, so without this the blast radius of amending a gated
   * condition reaches the *work* and stops there, and "was any confirmatory
   * result affected?" can only be answered by asserting it. Writes
   * `IMPLEMENTS`.
   */
  implementing?: WorkRef;
  /**
   * The prespecified conditions this analysis's conclusions are held to.
   *
   * Criteria that qualify a finding and gate nothing. The checks are agreed
   * before the run, so they are stated separately and named here: recording
   * them at evaluation time cannot work, because a check nobody ran must still
   * count against the finding. See EDGE_SCHEMA.QUALIFIES.
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
   * Stored as JSON rather than a delimited string, so an entry containing
   * punctuation cannot silently split. It becomes a real list property when
   * something needs to query *by element*.
   */
  mayRead?: string[];
  /**
   * The line of enquiry this work exists to advance, if any.
   *
   * Without it, *why does this piece of planned work exist* has no answer.
   *
   * Optional, because `planWork` allows ungated work: a task with no enquiry is
   * an honest answer rather than a missing one.
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
   * What this verdict was reached against — the evidence, by whichever route
   * the caller holds.
   *
   * **A verdict rests on evidence, and a claim is one way to name it.** Taking
   * only a claim made a *measured* check unrecordable: a pipeline-health count
   * produces observations and no scientific claim, so the verdict came out with
   * an empty basis — which the record reads as `asserted`, the opposite of what
   * happened. Bonsai's Stage 2A go/no-go was recorded that way (#150).
   *
   * Each entry is normalised to the `Evidence` it identifies before anything is
   * written: a claim resolves through the finding that bears on it, an
   * observations handle through the finding recorded in it, and an evidence
   * handle is already there. Repeatable, because a check may rest on several
   * measurements and citing one of them would name an arbitrary part.
   */
  citing?: CitedBasis[];
  /**
   * The finding this verdict is about, when one rule is applied to several.
   *
   * **A criterion is a rule, and a rule gets applied more than once.** Bonsai's
   * Stage 1D holds one decision rule against four comparisons; without this,
   * the only way to record four verdicts is to state the criterion four times
   * with identical wording, so the rule exists once in the researcher's head
   * and four times on the record with nothing connecting the copies (#133).
   *
   * Omitted when the criterion is evaluated as a whole, which is the ordinary
   * case and every existing caller. Given, `gateStatus` itemises one line per
   * finding judged rather than one per criterion.
   */
  about?: ClaimRef;
}

/**
 * A route to the evidence a verdict rests on.
 *
 * Three handles, one target. Which kind it is comes from the id's own prefix,
 * the way `ref()` and `createEdge` already decide it — never from `typeof`,
 * which is `"string"` for all three.
 */
export type CitedBasis = ClaimRef | ObservationsRef | EvidenceRef;

/** `reverify` — re-run a historical analysis under current observations. Not reproduction (S-10). */
export interface ReverifyCommand {
  historical: AnalysisRef;
  /**
   * Optional: the analysis being re-checked knows its own enquiry, and one
   * hop from what the caller already named is inferred rather than restated.
   * Given explicitly it is honoured — a re-check may be recorded under a
   * different line of enquiry than the analysis it re-checks.
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
 *
 * Closed, and every member names an act that writes it. `exploratory` is
 * absent deliberately: it is what an unset `kind` means, so a value for it
 * would be a second way to say nothing happened.
 *
 * `confirmed` is stored as `confirmatory`, which is the property's own word
 * and predates the verb; `src/domain/write.ts` holds the map, so the two words
 * meet in one place.
 */
export type ClaimState = "undecided" | "confirmed";

/**
 * Puts a claim into a state, and says what put it there.
 *
 * **The reason's shape is per state, not one shape for the set.** They are
 * different kinds of reason and the record already holds both: what leaves a
 * proposition open is a *finding*, which is on the record and has a handle, so
 * naming it lets a reader follow the state back to what produced it rather
 * than to a paraphrase. What confirms one is a *judgement* about evidence
 * already gathered — every real promotion on this repo's own record supplies
 * a sentence, and none of them has a single finding to point at. Requiring a
 * handle there would make confirming cost a record nobody has.
 */
export type IsCommand =
  | { claim: ClaimRef; state: "undecided"; because: EvidenceRef }
  | { claim: ClaimRef; state: "confirmed"; because: Prose };

/**
 * `undo` — takes back a mistaken act by naming the event it recorded.
 *
 * `event` is a `seq`, not a handle: it names the act, not any one thing the
 * act touched, and `seq` is already the vocabulary `labkit happened` shows a
 * caller for exactly this — the cursor `--since` takes back.
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
  | RecordReviewCommand
  | ReinterpretCommand
  | ReplaceAnalysisCommand
  | ReverifyCommand
  | SharpenCommand
  | StateCriterionCommand
  | SynthesiseCommand
  | UndoCommand;
