/**
 * The verbs that change the record.
 *
 * `WriteSurface` is the only public class here and every call site elsewhere
 * is unchanged — `new WriteSurface(graph, options).pose(...)` reads exactly as
 * it did before this file was one class of 2,000 lines. What changed is
 * internal: each group of verbs — asking, doing the work, saying in advance
 * what counts, revising, stopping (`../groups.ts`'s `WRITE_GROUPS`) — is now a
 * class of its own extending `SessionCore`, and `WriteSurface` composes one
 * instance of each over the same `TenantGraph` and delegates every public
 * method to one of them.
 *
 * **`emit` stays here.** It is the choke point all twenty-one verbs pass
 * through, stamping clock and attribution and draining minted ids, and it is
 * `private` so a read cannot reach it — `SessionCore` declares no verbs and no
 * `emit`, which is what makes that structural rather than remembered. A group
 * module cannot call `this.emit`; each is handed this method bound, as `Emit`,
 * at construction, which is also what stops one group emitting on another's
 * behalf without anyone deciding that on purpose.
 *
 * **`write/shared.ts`'s `Shared` class holds what more than one group needs**
 * — `recorded`, `concluding` and `conclusionEvents` look like `Work`'s own
 * machinery until `Revising`'s `reverify` turns out to call all three (two of
 * them via `concluding`'s own body, which also needs `unitOf` and
 * `revisedBy`). `Work` and `Revising` both `extend Shared` rather than hold an
 * instance of it, because its methods have to stay `protected` — see
 * `shared.ts`'s own header for why a merely `public` one would read as an
 * unexposed write verb to the coverage tests.
 *
 * Every verb below runs inside `graph.inTransaction()`, over its whole body —
 * not because each was reasoned about individually, but because `eec49b8`
 * wrapped all of them uniformly: `TenantGraph.inTransaction` is re-entrant by
 * depth, so a verb that already opened its own nested transaction (a mint
 * scope, or a validate-before-write block) simply joins the outer one, and the
 * event `emit` records now commits with the writes it describes rather than
 * after them. Before that, ten verbs opened a transaction the emit sat outside
 * of, and three more — `sharpen`, `pursue`, `declareGate` — opened none at
 * all. What a verb's internal comments say about *why* it writes a particular
 * edge last, or nests a transaction of its own, is still true and still worth
 * reading: the outer wrap makes the whole call atomic against a thrown
 * exception, but says nothing about which edge a caller should be able to read
 * partway through, or in what order two edges should exist for a later reader
 * to make sense of either alone.
 */

import type { TenantGraph } from "../../db/graph";
import type { Prose } from "../../db/domain";
import type {
  AcceptedAsUnresolved,
  AmendmentReport,
  ClosedEnquiry,
  DeclaredGate,
  EvaluatedCriterion,
  Noted,
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
  PoseCommand,
  ConcludeCommand,
  DeclareGateCommand,
  EvaluateCriterionCommand,
  IsCommand,
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
import { applyDelta, UnitOfWork } from "../projection";
import { Asking } from "./asking";
import { Counting } from "./counting";
import { Revising } from "./revising";
import { Stopping } from "./stopping";
import { Work } from "./work";

/**
 * The write verbs a research *move* needs — what a fragment depends on.
 *
 * **Narrower than `WriteSurface` on purpose.** A fragment composes a few of
 * these into one thing a researcher did; the class carries members it never
 * calls — protected helpers, the event sink, `SessionCore`'s internals.
 *
 * Depending on the class also excludes `ResearchSession`, which *composes* a
 * `WriteSurface` rather than extending one and keeps `writes` private, so it is
 * not assignable:
 *
 *     TS2740: missing … posed, pursued, standingFindings, recorded, and 24 more
 *
 * A scenario holds a `ResearchSession`, so with the class as the dependency it
 * cannot call a fragment at all.
 *
 * Naming the dependency here rather than inside `fragments/` is what lets
 * `ResearchSession` be checked against it (see `../session.ts`): a delegating
 * property whose signature drifts then fails to compile **where the drift is**,
 * rather than three files away in whichever fragment happened to call it.
 */
export type ResearchWrites = Pick<WriteSurface, Methods<WriteSurface>>;

/**
 * The verb an event records — one name per public write verb, and the same name.
 *
 * **Derived, so there is no list to keep.** Every method here is a research act
 * and emits one event named for itself; a hand-kept union was a second place to
 * add a verb and it drifted, shipping `keep` with no entry.
 *
 * It is a union rather than `string` for one job: a typo at the point of
 * emission. `emit("recordAnalyis", …)` is a compile error rather than an event
 * nobody can filter for. The stored record holds a plain string, which is what
 * comes back out of Postgres — see `DomainEvent.operation`.
 */
export type Operation = Methods<WriteSurface>;

/**
 * An operation no verb writes any more, but that recorded events still carry.
 *
 * A durable log is not migrated when a verb is retired: every snapshot taken
 * before the change still holds the old name, and replaying one is how the
 * Explorer reads a real record. So the *writer* goes and the *reader* stays,
 * and `DECODERS` covers both sets — a retired name with no decoder is a replay
 * that stops at the first such event.
 *
 * `promote` was retired by `is <claim> confirmed` (#184). It wrote `PROMOTES`
 * and set `Claim.kind`, which is exactly what that state writes now, so its
 * decoder forwards to it and the replayed record is identical.
 */
export type RetiredOperation = "promote";

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
    const handle: Handle = (operation, command, work) => this.handling(operation, command, work);
    this.asking = new Asking(graph, options, handle);
    this.work = new Work(graph, options, handle);
    this.counting = new Counting(graph, options, handle);
    this.revising = new Revising(graph, options, handle);
    this.stopping = new Stopping(graph, options, handle);
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

  async openEnquiry(question: Prose): Promise<OpenedEnquiry> {
    return this.asking.openEnquiry(question);
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

  async is(input: IsCommand): Promise<Restated> {
    return this.revising.is(input);
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
      const unitOfWork = new UnitOfWork(this.graph);
      const act = await work(unitOfWork);
      const recorded = await this.events.record({
        at: this.clock.now(),
        attribution: this.attribution,
        operation,
        subject: act.subject,
        command,
        changes: unitOfWork.delta(),
      });
      await applyDelta(this.graph, recorded);
      await this.events.projected?.(recorded);
      return { ...act.result, events: [recorded] };
    });
  }
}
