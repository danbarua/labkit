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
  ReplacementReport,
  Restated,
  SharpenedQuestion,
  StatedCriterion,
  VerificationReport,
} from "../report";
import type {
  AcceptAsUnresolvedCommand,
  AmendDesignCommand,
  CloseEnquiryCommand,
  PoseCommand,
  ConcludeCommand,
  DeclareGateCommand,
  EvaluateCriterionCommand,
  IsCommand,
  KeepCommand,
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
} from "../commands";
import { SessionCore, type Methods, type ResearchSessionOptions } from "../core";
import type { DomainEvent } from "../events";
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

/** What `emit` looks like from inside a group module — see the file header. */
export type Emit = (
  operation: Operation,
  subject: Ref<string>,
  detail?: Record<string, unknown>,
) => Promise<DomainEvent[]>;

/**
 * The delta a verb states before it writes anything.
 *
 * `emit` drains what the graph already did; this takes what the graph is
 * *about* to do, so the event exists before the record does.
 */
export type Delta = Partial<Pick<DomainEvent, "created" | "edges" | "sets">>;

/** A command in flight: the operation, and what the caller passed. */
export interface Handled {
  operation: Operation;
  input: unknown;
}

/** `emit`, for a verb that authors its delta rather than having it drained. */
export type EmitDelta = (
  operation: Operation,
  subject: Ref<string>,
  delta: Delta,
  detail?: Record<string, unknown>,
) => Promise<DomainEvent[]>;

export class WriteSurface extends SessionCore {
  private readonly asking: Asking;
  private readonly work: Work;
  private readonly counting: Counting;
  private readonly revising: Revising;
  private readonly stopping: Stopping;

  constructor(graph: TenantGraph, options: ResearchSessionOptions = {}) {
    super(graph, options);
    const emit: Emit = (operation, subject, detail) => this.emit(operation, subject, detail);
    const emitDelta: EmitDelta = (operation, subject, delta, detail) =>
      this.emitDelta(operation, subject, delta, detail);
    this.asking = new Asking(graph, options, emit, emitDelta);
    this.work = new Work(graph, options, emit);
    this.counting = new Counting(graph, options, emit);
    this.revising = new Revising(graph, options, emit);
    this.stopping = new Stopping(graph, options, emit, emitDelta);
  }

  async pose(input: PoseCommand): Promise<Posed> {
    return this.handling({ operation: "pose", input }, () => this.asking.pose(input));
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

  async recordReview(input: RecordReviewCommand): Promise<RecordedReview> {
    return this.work.recordReview(input);
  }

  async closeEnquiry(input: CloseEnquiryCommand): Promise<ClosedEnquiry> {
    return this.handling({ operation: "closeEnquiry", input }, () =>
      this.stopping.closeEnquiry(input),
    );
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
   * The single choke point. Every state-changing verb reaches the sink through
   * here, so a field added to this one `record` call is stamped on every event
   * the domain will ever emit — which is why `attribution` needed no verb to
   * change and no signature to move.
   *
   * Both context fields are read at the moment of the emit, not captured at
   * construction, so a surface built per command reports that command's clock
   * and that command's attribution.
   *
   * Returns an array, always -- one entry per event `emit` recorded, which
   * today is always exactly one. The uniform shape is for the caller: every
   * write verb hands its own `events` field straight through from here, so a
   * `--json` renderer needs no new plumbing if a verb ever records more.
   */
  /**
   * The command being handled, for the duration of one call.
   *
   * Per call rather than on {@link CommandContext}: that is captured at
   * construction, and `fragments/replay.ts`, `fragments/run.ts` and two test
   * files each build one surface and drive many commands through it.
   */
  private handled?: Handled;

  /**
   * Runs one command, with the command itself in scope for whatever the call
   * flows through.
   *
   * TypeScript erases the type, so the operation is stated once here rather
   * than restated as a string literal at the emit site. `revising.ts` already
   * had to thread it by hand for `keep`/`replaceAnalysis`, which share one
   * command shape and are two different acts.
   */
  private async handling<T>(command: Handled, work: () => Promise<T>): Promise<T> {
    const outer = this.handled;
    this.handled = command;
    try {
      return await work();
    } finally {
      this.handled = outer;
    }
  }

  /**
   * Records what a verb is about to do, before it does it.
   *
   * The delta is stated by the caller rather than drained from the graph, so
   * the event exists first and the graph is what the event produces. Inside
   * the verb's own transaction, as `emit` is: the event and the writes it
   * describes still commit together or neither does.
   */
  private async emitDelta(
    operation: Operation,
    subject: Ref<string>,
    delta: Delta,
    detail?: Record<string, unknown>,
  ): Promise<DomainEvent[]> {
    const recorded = await this.events.record({
      at: this.clock.now(),
      attribution: this.attribution,
      operation,
      subject,
      created: delta.created ?? [],
      edges: delta.edges ?? [],
      sets: delta.sets ?? [],
      detail,
    });
    return [recorded];
  }

  private async emit(
    operation: Operation,
    subject: Ref<string>,
    detail?: Record<string, unknown>,
  ): Promise<DomainEvent[]> {
    const recorded = await this.events.record({
      at: this.clock.now(),
      attribution: this.attribution,
      operation,
      subject,
      // Drained, not listed. Every id `TenantGraph` minted since the last
      // event, which is the set this act brought into existence -- and the
      // question `subject` cannot answer, since most verbs are *about*
      // something other than what they created.
      created: this.graph.drainMinted(),
      // The other half of the same collection. See `DomainEvent.edges`.
      edges: this.graph.drainMintedEdges(),
      // Nothing drains a property set: the nineteen verbs that still write
      // first have no collector for one. See `applyDelta` in ./shared.ts.
      sets: [],
      detail,
    });
    return [recorded];
  }
}
