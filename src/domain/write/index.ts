/**
 * The verbs that change the record.
 */

import type { TenantGraph } from "../../db/graph";
import type { Prose } from "../../db/domain";
import type {
  AcceptedAsUnresolved,
  AmendmentReport,
  ClosedEnquiry,
  ClosedGate,
  DeclaredGate,
  EvaluatedCriterion,
  StoppedWork,
  Noted,
  NoteRef,
  OpenedEnquiry,
  PlannedWork,
  Posed,
  Pursued,
  Ref,
  ReinterpretationReport,
  RecordedAnalysis,
  RecordedObservations,
  RecordedReview,
  Synthesised,
  ReplacementReport,
  Restated,
  Undone,
  SharpenedQuestion,
  StatedCriterion,
  VerificationReport,
} from "../report";
import type {
  Command,
  AcceptAsUnresolvedCommand,
  AmendDesignCommand,
  CloseEnquiryCommand,
  CloseGateCommand,
  StopWorkCommand,
  PoseCommand,
  ConcludeCommand,
  DeclareGateCommand,
  EvaluateCriterionCommand,
  ClaimIsConfirmedCommand,
  ClaimIsUndecidedCommand,
  KeepCommand,
  UndoCommand,
  NoteCommand,
  PlanWorkCommand,
  PursueCommand,
  RecordAnalysisCommand,
  RecordObservationsCommand,
  RecordReviewCommand,
  ReinterpretCommand,
  ReplaceAnalysisCommand,
  ReverifyCommand,
  SharpenCommand,
  SynthesiseCommand,
} from "../commands";
import { SessionCore, type Methods, type ResearchSessionOptions } from "../core";
import type { DomainEvent } from "../events";
import { naturalIds, UnitOfWork } from "../projection";
import { Asking } from "./asking";
import { Counting } from "./counting";
import { Revising } from "./revising";
import { Stopping } from "./stopping";
import { Work } from "./work";

/**
 * The write verbs a research *move* needs — what a fragment depends on.
 */
export type ResearchWrites = Pick<WriteSurface, Methods<WriteSurface>>;

/**
 * The verb an event records — one name per public write verb, and the same name.
 */
export type Operation = Methods<WriteSurface>;

/**
 * An operation no verb writes any more, but that recorded events still carry.
 */
export type RetiredOperation = "promote" | "is";

/** What a verb's body returns: what the act was about, and what it produced. */
export interface Act<R> {
  subject: Ref<string>;
  result: R;
}

/**
 * The pipeline, as a group module sees it: open the transaction, run the
 * verb against a fresh unit of work, record one event carrying its changes,
 * project that event into the graph, commit.
 */
export type Handle = <R extends object>(
  operation: Operation,
  command: Command,
  work: (unitOfWork: UnitOfWork) => Promise<Act<R>>,
) => Promise<R & { events: DomainEvent[] }>;

export class WriteSurface extends SessionCore {
  private readonly asking: Asking;
  private readonly work: Work;
  private readonly counting: Counting;
  private readonly revising: Revising;
  private readonly stopping: Stopping;

  constructor(graph: TenantGraph, options: ResearchSessionOptions = {}) {
    super(graph, options);
    // **`this.events`, not `options.events`.** `SessionCore` defaults an absent
    // sink to a fresh `inMemoryEventLog()` per surface, so passing `options`
    // straight down gave each group a log of its own: `handling` recorded into
    // this one while `undo` read the revising group's, which was empty.
    const shared: ResearchSessionOptions = { ...options, events: this.events };
    const handle: Handle = (operation, command, work) => this.handling(operation, command, work);
    this.asking = new Asking(graph, shared, handle);
    this.work = new Work(graph, shared, handle);
    this.counting = new Counting(graph, shared, handle);
    this.revising = new Revising(graph, shared, handle);
    this.stopping = new Stopping(graph, shared, handle);
  }

  async pose(input: PoseCommand): Promise<Posed> {
    return this.asking.pose(input);
  }

  async note(input: NoteCommand): Promise<Noted> {
    return this.asking.note(input);
  }

  async pursue(input: PursueCommand): Promise<Pursued> {
    return this.asking.pursue(input);
  }

  async openEnquiry(question: Prose, from?: NoteRef): Promise<OpenedEnquiry> {
    return this.asking.openEnquiry(question, from);
  }

  async sharpen(input: SharpenCommand): Promise<SharpenedQuestion> {
    return this.asking.sharpen(input);
  }

  async recordObservations(input: RecordObservationsCommand): Promise<RecordedObservations> {
    return this.work.recordObservations(input);
  }

  async recordAnalysis(input: RecordAnalysisCommand): Promise<RecordedAnalysis> {
    return this.work.recordAnalysis(input);
  }

  async conclude(input: ConcludeCommand): Promise<RecordedAnalysis> {
    return this.work.conclude(input);
  }

  async synthesise(input: SynthesiseCommand): Promise<Synthesised> {
    return this.work.synthesise(input);
  }

  async recordReview(input: RecordReviewCommand): Promise<RecordedReview> {
    return this.work.recordReview(input);
  }

  async closeEnquiry(input: CloseEnquiryCommand): Promise<ClosedEnquiry> {
    return this.stopping.closeEnquiry(input);
  }

  async acceptAsUnresolved(input: AcceptAsUnresolvedCommand): Promise<AcceptedAsUnresolved> {
    return this.stopping.acceptAsUnresolved(input);
  }

  async closeGate(input: CloseGateCommand): Promise<ClosedGate> {
    return this.stopping.closeGate(input);
  }

  async stopWork(input: StopWorkCommand): Promise<StoppedWork> {
    return this.stopping.stopWork(input);
  }

  async planWork(input: PlanWorkCommand): Promise<PlannedWork> {
    return this.counting.planWork(input);
  }

  async stateCriterion(proposition: Prose): Promise<StatedCriterion> {
    return this.counting.stateCriterion(proposition);
  }

  async declareGate(input: DeclareGateCommand): Promise<DeclaredGate> {
    return this.counting.declareGate(input);
  }

  async evaluateCriterion(input: EvaluateCriterionCommand): Promise<EvaluatedCriterion> {
    return this.counting.evaluateCriterion(input);
  }

  async amendDesign(input: AmendDesignCommand): Promise<AmendmentReport> {
    return this.counting.amendDesign(input);
  }

  async reverify(input: ReverifyCommand): Promise<VerificationReport> {
    return this.revising.reverify(input);
  }

  async isUndecided(input: ClaimIsUndecidedCommand): Promise<Restated> {
    return this.revising.isUndecided(input);
  }

  async isConfirmed(input: ClaimIsConfirmedCommand): Promise<Restated> {
    return this.revising.isConfirmed(input);
  }

  async undo(input: UndoCommand): Promise<Undone> {
    return this.revising.undo(input);
  }

  async replaceAnalysis(input: ReplaceAnalysisCommand): Promise<ReplacementReport> {
    return this.revising.replaceAnalysis(input);
  }

  async keep(input: KeepCommand): Promise<ReplacementReport> {
    return this.revising.keep(input);
  }

  async reinterpret(input: ReinterpretCommand): Promise<ReinterpretationReport> {
    return this.revising.reinterpret(input);
  }

  /**
   * One command: a transaction, a unit of work, one event, and the graph
   * projected from it. The verb queries and enforces and stages; nothing else
   * about a write is its business.
   */
  private async handling<R extends object>(
    operation: Operation,
    command: Command,
    work: (unitOfWork: UnitOfWork) => Promise<Act<R>>,
  ): Promise<R & { events: DomainEvent[] }> {
    return this.graph.inTransaction(async () => {
      const unitOfWork = new UnitOfWork(naturalIds(this.graph));
      const act = await work(unitOfWork);
      const recorded = await this.events.record({
        at: this.clock.now(),
        attribution: this.attribution,
        operation,
        subject: act.subject,
        command,
        changes: unitOfWork.delta(),
        reconstructedFrom: this.reconstructedFrom,
      });
      // The graph is one of these, not the step this used to be. Ordered:
      // a projector that reads the graph must come after the one that writes
      // it -- see `ResearchSessionOptions.projectors`.
      for (const projector of this.projectors) await projector.apply(recorded);
      return { ...act.result, events: [recorded] };
    });
  }
}
