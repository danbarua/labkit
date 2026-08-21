/**
 * `ResearchSession` — the whole research surface in one object.
 *
 * A facade, and deliberately only that. It exists because tests and future
 * callers want one thing to hold: `new ResearchSession(graph, { clock, events })`
 * then verbs in researcher language. It owns no logic — every member below
 * forwards to {@link ReadSurface} or {@link WriteSurface}.
 *
 * Application code need not bind to it. When this was split, `findReferences`
 * on the class reported 113 references across 19 files and **every one outside
 * `src/domain` was a test** — `src/cli.ts` was empty and `src/index.ts` was a
 * hello-world. So the facade is a usage affordance, not a contract the modules
 * are subordinate to. An MCP or CLI adapter should compose the two surfaces
 * directly and take only the half it needs; a read-only adapter that cannot
 * construct a `WriteSurface` cannot write, which is worth more than a comment
 * saying it should not.
 *
 * Delegation is written as `readonly x: Surface["x"] = (...args) => ...` rather
 * than as 32 restated signatures. The types come from the surfaces, so a
 * signature cannot drift here, and the line names which half owns the verb.
 */

import type { TenantGraph } from "../db/graph";
import type { EventSink } from "./events";
import { ReadSurface } from "./read";
import { WriteSurface } from "./write";
import type { ResearchSessionOptions } from "./core";

export type { ResearchSessionOptions } from "./core";
export { SessionCore } from "./core";
export { ReadSurface } from "./read";
export { WriteSurface } from "./write";

export class ResearchSession {
  private readonly reads: ReadSurface;
  private readonly writes: WriteSurface;
  readonly events: EventSink;

  constructor(graph: TenantGraph, options: ResearchSessionOptions = {}) {
    // One options object, so both halves share a clock and an event sink; and
    // one `TenantGraph`, so `inTransaction`'s re-entrancy depth is shared.
    this.writes = new WriteSurface(graph, options);
    this.reads = new ReadSurface(graph, { ...options, events: this.writes.events });
    this.events = this.writes.events;
  }

  readonly pose: WriteSurface["pose"] = (...args) => this.writes.pose(...args);
  readonly pursue: WriteSurface["pursue"] = (...args) => this.writes.pursue(...args);
  readonly openEnquiry: WriteSurface["openEnquiry"] = (...args) => this.writes.openEnquiry(...args);
  readonly pursuitsOf: ReadSurface["pursuitsOf"] = (...args) => this.reads.pursuitsOf(...args);
  readonly sharpen: WriteSurface["sharpen"] = (...args) => this.writes.sharpen(...args);
  readonly originOf: ReadSurface["originOf"] = (...args) => this.reads.originOf(...args);
  readonly whatIsKnown: ReadSurface["whatIsKnown"] = (...args) => this.reads.whatIsKnown(...args);
  readonly whatWasKnown: ReadSurface["whatWasKnown"] = (...args) => this.reads.whatWasKnown(...args);
  readonly recordObservations: WriteSurface["recordObservations"] = (...args) => this.writes.recordObservations(...args);
  readonly recordAnalysis: WriteSurface["recordAnalysis"] = (...args) => this.writes.recordAnalysis(...args);
  readonly recordReview: WriteSurface["recordReview"] = (...args) => this.writes.recordReview(...args);
  readonly closeEnquiry: WriteSurface["closeEnquiry"] = (...args) => this.writes.closeEnquiry(...args);
  readonly enquiryStatus: ReadSurface["enquiryStatus"] = (...args) => this.reads.enquiryStatus(...args);
  readonly planWork: WriteSurface["planWork"] = (...args) => this.writes.planWork(...args);
  readonly contractFor: ReadSurface["contractFor"] = (...args) => this.reads.contractFor(...args);
  readonly stateCriterion: WriteSurface["stateCriterion"] = (...args) => this.writes.stateCriterion(...args);
  readonly declareGate: WriteSurface["declareGate"] = (...args) => this.writes.declareGate(...args);
  readonly evaluateCriterion: WriteSurface["evaluateCriterion"] = (...args) => this.writes.evaluateCriterion(...args);
  readonly criteriaGoverning: ReadSurface["criteriaGoverning"] = (...args) => this.reads.criteriaGoverning(...args);
  readonly reverify: WriteSurface["reverify"] = (...args) => this.writes.reverify(...args);
  readonly reproductionOf: ReadSurface["reproductionOf"] = (...args) => this.reads.reproductionOf(...args);
  readonly acceptAsUnresolved: WriteSurface["acceptAsUnresolved"] = (...args) => this.writes.acceptAsUnresolved(...args);
  readonly promote: WriteSurface["promote"] = (...args) => this.writes.promote(...args);
  readonly amendDesign: WriteSurface["amendDesign"] = (...args) => this.writes.amendDesign(...args);
  readonly designHistory: ReadSurface["designHistory"] = (...args) => this.reads.designHistory(...args);
  readonly gateStatus: ReadSurface["gateStatus"] = (...args) => this.reads.gateStatus(...args);
  readonly replaceAnalysis: WriteSurface["replaceAnalysis"] = (...args) => this.writes.replaceAnalysis(...args);
  readonly reinterpret: WriteSurface["reinterpret"] = (...args) => this.writes.reinterpret(...args);
  readonly interpretationHistory: ReadSurface["interpretationHistory"] = (...args) => this.reads.interpretationHistory(...args);
  readonly doTheseConflict: ReadSurface["doTheseConflict"] = (...args) => this.reads.doTheseConflict(...args);
  readonly whySupported: ReadSurface["whySupported"] = (...args) => this.reads.whySupported(...args);
  readonly reproducibilityOf: ReadSurface["reproducibilityOf"] = (...args) => this.reads.reproducibilityOf(...args);
  readonly whatDependsOn: ReadSurface["whatDependsOn"] = (...args) => this.reads.whatDependsOn(...args);
}
