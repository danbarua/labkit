export { ResearchSession } from "./session";
export type { ResearchSessionOptions } from "./session";
// The two halves, exported so a caller can take one. A read-only adapter that
// never constructs a WriteSurface cannot write -- worth more than a comment
// saying it must not. See docs/session-log for the split's measurements.
export { ReadSurface } from "./read";
export { WriteSurface } from "./write";
export { SessionCore } from "./core";
export { systemClock, inMemoryEventLog } from "./events";
export type { Clock, DomainEvent, EventSink } from "./events";
export type {
  Ref,
  ObservationsRef,
  AnalysisRef,
  ReviewRef,
  EnquiryRef,
  QuestionRef,
  QuestionStanding,
  KnowledgeSurvey,
  HistoricalSurvey,
  QuestionOrigin,
  AmendmentReport,
  AmendmentRecord,
  DesignHistory,
  ReinterpretationReport,
  Revision,
  InterpretationHistory,
  ClaimSubject,
  ConflictSide,
  ConflictVerdict,
  TaskContract,
  Conclusion,
  ConclusionRef,
  ChangedConclusion,
  ReplacementReport,
  UnaffectedRecord,
  DependencyReport,
  IdentifiedArtefact,
  SupportExplanation,
  GateStatus,
  CheckStatus,
  EnquiryStatus,
  EvaluationRecord,
  CriterionRef,
  GateRef,
  WorkRef,
} from "./report";
