export { ResearchSession } from "./session";
export type { ResearchSessionOptions } from "./session";
// The two halves, exported so a caller can take one. A read-only adapter that
// never constructs a WriteSurface cannot write -- worth more than a comment
// saying it must not. See docs/session-log for the split's measurements.
export { ReadSurface } from "./read";
export { WriteSurface } from "./write";
export { SessionCore } from "./core";
export { systemClock, inMemoryEventLog, domainEvent, UNATTRIBUTED } from "./events";
export type {
  Clock,
  AttributionContext,
  AttributionHow,
  CommandContext,
  DomainEvent,
  EventFilter,
  EventSink,
  // Re-exported from `src/db/domain` through `./events`, so a consumer of the
  // domain barrel can name an edge without importing the persistence layer.
  MintedEdge,
  Operation,
} from "./events";
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
  ConflictSide,
  ConflictVerdict,
  TaskContract,
  Addressing,
  Conclusion,
  ConcludedClaim,
  SearchGroup,
  SearchMatch,
  RecordedAnalysis,
  ClaimRef,
  EvidenceRef,
  UnitRef,
  EvaluationRef,
  DecisionRef,
  Condition,
  ConclusionRef,
  ChangedConclusion,
  ReplacementReport,
  UnaffectedRecord,
  DependencyReport,
  IdentifiedArtefact,
  ReproductionReport,
  ReproducibilityReport,
  SupportExplanation,
  GateStatus,
  ListedGate,
  ListedWork,
  WorkState,
  CheckStatus,
  EnquiryStatus,
  EnquiryInContext,
  QuestionBucket,
  EvaluationRecord,
  CriterionRef,
  GateRef,
  WorkRef,
  Kind,
  Cause,
  Explanation,
  ClaimExplanation,
  WorkExplanation,
  EnquiryExplanation,
} from "./report";
// The write half's command shapes. `report.ts` above is what a read returns;
// these are what an act takes. Exported so an adapter can hold one -- which is
// what an MCP write tool will need and what inline anonymous shapes prevented.
export type {
  PursueCommand,
  SharpenCommand,
  RecordObservationsCommand,
  RecordAnalysisCommand,
  RecordReviewCommand,
  CloseEnquiryCommand,
  PlanWorkCommand,
  DeclareGateCommand,
  EvaluateCriterionCommand,
  ReverifyCommand,
  AcceptAsUnresolvedCommand,
  AmendDesignCommand,
  ReplaceAnalysisCommand,
  ReinterpretCommand,
  PromoteCommand,
} from "./commands";
