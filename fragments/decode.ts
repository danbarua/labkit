/**
 * Replays one recorded `DomainEvent` by reissuing the command it carries —
 * the mechanism `fragments/replay.ts` runs in `seq` order to rebuild a real
 * record's derived state.
 *
 * There is nothing to reconstruct. An event carries the command the caller
 * issued, so a decoder is the verb call with that command handed to it. The
 * previous version of this file rebuilt each command field by field out of
 * `detail`, the act's own edges and the live record's node properties, and
 * carried three helpers and 40 casts to do it — none of which could recover a
 * field the writer had not thought to record.
 *
 * `DECODERS` is exhaustive over `Operation` at compile time
 * (`satisfies Record<Operation | RetiredOperation, Decoder>`), so a write verb
 * with no decoder fails `tsc` here rather than tripping the runtime refusal in
 * production.
 */

import type { WriteSurface, DomainEvent, Operation, RetiredOperation } from "../src/domain";
import type {
  AcceptAsUnresolvedCommand,
  AmendDesignCommand,
  CloseEnquiryCommand,
  ConcludeCommand,
  DeclareGateCommand,
  EvaluateCriterionCommand,
  IsCommand,
  UndoCommand,
  KeepCommand,
  NoteCommand,
  OpenEnquiryCommand,
  PlanWorkCommand,
  PoseCommand,
  PromoteCommand,
  PursueCommand,
  RecordAnalysisCommand,
  RecordObservationsCommand,
  RecordReviewCommand,
  ReinterpretCommand,
  ReplaceAnalysisCommand,
  ReverifyCommand,
  SharpenCommand,
  SynthesiseCommand,
  StateCriterionCommand,
} from "../src/domain/commands";
import { ref } from "../src/domain/report";

export interface DecodeContext {
  writes: WriteSurface;
}

export type Decoder = (ctx: DecodeContext, event: DomainEvent) => Promise<void>;

/** The command this event recorded, as the verb that issued it declares it. */
const as = <C>(event: DomainEvent): C => event.command as C;

export const DECODERS = {
  pose: async (ctx, e) => {
    await ctx.writes.pose(as<PoseCommand>(e));
  },

  note: async (ctx, e) => {
    await ctx.writes.note(as<NoteCommand>(e));
  },

  openEnquiry: async (ctx, e) => {
    await ctx.writes.openEnquiry(as<OpenEnquiryCommand>(e).question);
  },

  pursue: async (ctx, e) => {
    await ctx.writes.pursue(as<PursueCommand>(e));
  },

  sharpen: async (ctx, e) => {
    await ctx.writes.sharpen(as<SharpenCommand>(e));
  },

  recordObservations: async (ctx, e) => {
    await ctx.writes.recordObservations(as<RecordObservationsCommand>(e));
  },

  recordAnalysis: async (ctx, e) => {
    await ctx.writes.recordAnalysis(as<RecordAnalysisCommand>(e));
  },

  conclude: async (ctx, e) => {
    await ctx.writes.conclude(as<ConcludeCommand>(e));
  },

  synthesise: async (ctx, e) => {
    await ctx.writes.synthesise(as<SynthesiseCommand>(e));
  },

  recordReview: async (ctx, e) => {
    await ctx.writes.recordReview(as<RecordReviewCommand>(e));
  },

  closeEnquiry: async (ctx, e) => {
    await ctx.writes.closeEnquiry(as<CloseEnquiryCommand>(e));
  },

  planWork: async (ctx, e) => {
    await ctx.writes.planWork(as<PlanWorkCommand>(e));
  },

  stateCriterion: async (ctx, e) => {
    await ctx.writes.stateCriterion(as<StateCriterionCommand>(e).proposition);
  },

  declareGate: async (ctx, e) => {
    await ctx.writes.declareGate(as<DeclareGateCommand>(e));
  },

  evaluateCriterion: async (ctx, e) => {
    await ctx.writes.evaluateCriterion(as<EvaluateCriterionCommand>(e));
  },

  reverify: async (ctx, e) => {
    await ctx.writes.reverify(as<ReverifyCommand>(e));
  },

  acceptAsUnresolved: async (ctx, e) => {
    await ctx.writes.acceptAsUnresolved(as<AcceptAsUnresolvedCommand>(e));
  },

  // Retired, and still replayed -- see `RetiredOperation`. `is <claim>
  // confirmed` writes what `promote` wrote, so a record built before the
  // retirement replays into an identical one.
  promote: async (ctx, e) => {
    const promoted = as<PromoteCommand>(e);
    await ctx.writes.is({ claim: promoted.claim, state: "confirmed", because: promoted.because });
  },

  is: async (ctx, e) => {
    await ctx.writes.is(as<IsCommand>(e));
  },

  undo: async (ctx, e) => {
    await ctx.writes.undo(as<UndoCommand>(e));
  },

  amendDesign: async (ctx, e) => {
    await ctx.writes.amendDesign(as<AmendDesignCommand>(e));
  },

  keep: async (ctx, e) => {
    await ctx.writes.keep(as<KeepCommand>(e));
  },

  replaceAnalysis: async (ctx, e) => {
    await ctx.writes.replaceAnalysis(as<ReplaceAnalysisCommand>(e));
  },

  reinterpret: async (ctx, e) => {
    await ctx.writes.reinterpret(as<ReinterpretCommand>(e));
  },
} satisfies Record<Operation | RetiredOperation, Decoder>;
