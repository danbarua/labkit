/**
 * Domain report types and identity aliases.
 * Runtime report codecs live in reports.ts; their types are inferred there.
 */

import type { DomainEvent } from "./events";
import type { ConcludedClaim, Explanation } from "./reports";
import { GATE_STATES, WORK_STATES } from "./vocab";
import type { AnyRef, Kind, Ref } from "./ref";

export type { ResolutionKind } from "../db/domain";
export { GATE_STATES, WORK_STATES };
export {
  LABEL_BY_KIND,
  KIND_BY_LABEL,
  ref,
  kindOf,
  isRefOfKind,
  type Ref,
  type Kind,
  type AnyRef,
} from "./ref";

/**
 * Handles in the order a person reads them: TASK_1, TASK_2, TASK_11.
 *
 * Plain `localeCompare` sorts the digits as text, which puts TASK_11 directly
 * after TASK_1 and TASK_2 four rows below it.
 */
export const byHandle = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true });

export type ObservationsRef = Ref<"observations">;
export type QuestionRef = Ref<"question">;
export type CriterionRef = Ref<"criterion">;
export type NoteRef = Ref<"note">;
export type GateRef = Ref<"gate">;
export type WorkRef = Ref<"work">;
export type AnalysisRef = Ref<"analysis">;
export type ReviewRef = Ref<"review">;
export type EnquiryRef = Ref<"enquiry">;
export type ClaimRef = Ref<"claim">;
export type EvidenceRef = Ref<"evidence">;
export type UnitRef = Ref<"unit">;
export type EvaluationRef = Ref<"evaluation">;
export type DecisionRef = Ref<"decision">;
export type InputRef = ObservationsRef | AnalysisRef;

export interface ConclusionRef {
  analysis: AnalysisRef;
  proposition: string;
}

export type Verdict =
  | "supported"
  | "undecided"
  | "withdrawn"
  | "challenged"
  | "drawn-across"
  | "standard-unmet"
  | "unexamined";

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
  if (of.drawnAcross.length > 0 && of.support.length === 0) return "drawn-across";
  return of.unmet.length > 0 ? "standard-unmet" : "unexamined";
}

export type ClaimStanding = {
  withdrawn: boolean;
  by: DecisionRef[];
  insteadOf: ConcludedClaim[];
};
export type WalkedKind =
  | "question"
  | "unit"
  | "evidence"
  | "decision"
  | "evaluation"
  | "review"
  | "observations"
  | "note";
export type EventPage = {
  acts: readonly DomainEvent[];
  more: boolean;
};

export type Conclusion = {
  proposition: string;
  finding: string;
  bearing?: "supports" | "challenges";
  standing?: "exploratory" | "confirmatory";
};
export type QuestionBucket = "established" | "unresolved" | "untested" | "provisional" | "accepted";
export type WorkState = (typeof WORK_STATES)[number];
export type StoppedReason = { decision: DecisionRef; because: string; at: string };
export type ClaimExplanation = Extract<Explanation, { kind: "claim" }>;
export type WorkExplanation = Extract<Explanation, { kind: "work" }>;
export type EnquiryExplanation = Extract<Explanation, { kind: "enquiry" }>;
export type GateExplanation = Extract<Explanation, { kind: "gate" }>;
export type AnalysisExplanation = Extract<Explanation, { kind: "analysis" }>;
export type CriterionExplanation = Extract<Explanation, { kind: "criterion" }>;

export type {
  ConcludedClaim,
  SearchMatch,
  SearchGroup,
  Notes,
  How,
  HowStep,
  ListedNote,
  QuestionStanding,
  AcceptedQuestion,
  PursuitAnswer,
  AnsweredQuestion,
  ClosedPursuit,
  IdentifiedArtefact,
  CitedFinding,
  EvaluationRecord,
  BearingFinding,
  AffectedClaim,
  AffectedEnquiry,
  ConfirmatoryResult,
  DecidedQuestion,
  GatedWork,
  ReplacementClaim,
  Reverification,
  BlockedWork,
  UnmetCheck,
  Condition,
  DecidingEvaluation,
  CheckStatus,
  AmendmentRecord,
  Revision,
  ConditionHistory,
  RevisedFinding,
  GateGoverned,
  AnalysisRevision,
  Registration,
  ListedAnalysis,
  ListedClaim,
  ListedCriterion,
  ListedEnquiry,
  ListedGate,
  ListedWork,
  Standing,
  Transcription,
  ChangedConclusion,
  UnaffectedRecord,
  Cause,
  KnowledgeSurvey,
  HistoricalSurvey,
  SupportExplanation,
  DependencyReport,
  EnquiryQuestion,
  EnquiryStatus,
  EnquiryInContext,
  DesignHistory,
  InterpretationHistory,
  ReproductionReport,
  QuestionOrigin,
  OriginOf,
  Addressing,
  TaskContract,
  CriteriaGoverning,
  GateStatus,
  CriterionStanding,
  Explanation,
  ConflictSide,
  ConflictVerdict,
  ReproducibilityReport,
  RecordedAnalysis,
  Posed,
  Noted,
  Pursued,
  OpenedEnquiry,
  RecordedObservations,
  SharpenedQuestion,
  Synthesised,
  RecordedReview,
  ClosedEnquiry,
  StoppedWork,
  ClosedGate,
  PlannedWork,
  StatedCriterion,
  DeclaredGate,
  EvaluatedCriterion,
  AcceptedAsUnresolved,
  Restated,
  Undone,
  VerificationReport,
  AmendmentReport,
  ReplacementReport,
  ReinterpretationReport,
  Pursuits,
  RegisteredSession,
  GateList,
  WorkList,
} from "./reports";
