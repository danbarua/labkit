/**
 * The verbs that change the record.
 */

import type { TenantGraph } from "@labkit/core-db/graph";
import type { Prose } from "@labkit/core-db/domain";
import type {
  AcceptedAsUnresolved,
  AmendmentReport,
  ClosedEnquiry,
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
  RecordedAnalysis,
  RecordedObservations,
  Synthesised,
  Restated,
  StatedCriterion,
} from "../report";
import type {
  Command,
  AcceptAsUnresolvedCommand,
  AmendDesignCommand,
  CloseEnquiryCommand,
  StopWorkCommand,
  PoseCommand,
  ConcludeCommand,
  DeclareGateCommand,
  EvaluateCriterionCommand,
  ClaimIsConfirmedCommand,
  NoteCommand,
  PlanWorkCommand,
  PursueCommand,
  RecordAnalysisCommand,
  RecordObservationsCommand,
  SynthesiseCommand,
} from "../commands";
import { SessionCore, type Methods, type ResearchSessionOptions } from "../core";
import { resolveIn, type DomainEvent } from "../events";
import { snapshotPriorValues, UnitOfWork } from "../projection";
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
    // straight down gave each group a log of its own, and a group reading the log
    // would read one `handling` never records into.
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

  async closeEnquiry(input: CloseEnquiryCommand): Promise<ClosedEnquiry> {
    return this.stopping.closeEnquiry(input);
  }

  async acceptAsUnresolved(input: AcceptAsUnresolvedCommand): Promise<AcceptedAsUnresolved> {
    return this.stopping.acceptAsUnresolved(input);
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

  async isConfirmed(input: ClaimIsConfirmedCommand): Promise<Restated> {
    return this.revising.isConfirmed(input);
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
      const unitOfWork = new UnitOfWork();
      const act = await work(unitOfWork);
      // **Here and nowhere else.** The graph still holds the old values at this
      // instant -- the act only staged, and the projectors below have not run --
      // so this is the one point where a change can record what it replaced.
      const changes = await snapshotPriorValues(this.graph, unitOfWork.delta());
      // The store takes the workspace's next number, stamps it into every placeholder the
      // act staged, and hands back what it wrote. `Q_17` is what event 17 created.
      const recorded = await this.events.record({
        at: this.clock.now(),
        attribution: this.attribution,
        operation,
        subject: act.subject,
        command,
        changes,
        reconstructedFrom: this.reconstructedFrom,
      });
      // The graph is one of these, not the step this used to be. Ordered:
      // a projector that reads the graph must come after the one that writes
      // it -- see `ResearchSessionOptions.projectors`.
      for (const projector of this.projectors) await projector.apply(recorded);
      // The verb built its result out of placeholders, because the number did not exist yet.
      return { ...resolveIn(act.result, recorded.seq), events: [recorded] };
    });
  }
}
