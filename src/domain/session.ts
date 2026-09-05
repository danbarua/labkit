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
 * than restating every signature. The types come from the surfaces, so a
 * signature cannot drift here, and the line names which half owns the verb.
 */

import type { TenantGraph } from "../db/graph";
import type { EventSink } from "./events";
import { ReadSurface, type ResearchReads } from "./read";
import { WriteSurface, type ResearchWrites } from "./write";
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
    this.reads = new ReadSurface(graph, {
      ...options,
      events: this.writes.events,
    });
    this.events = this.writes.events;
  }

  readonly pose: WriteSurface["pose"] = (...args) => this.writes.pose(...args);
  readonly note: WriteSurface["note"] = (...args) => this.writes.note(...args);
  readonly pursue: WriteSurface["pursue"] = (...args) => this.writes.pursue(...args);
  readonly openEnquiry: WriteSurface["openEnquiry"] = (...args) => this.writes.openEnquiry(...args);
  readonly pursuitsOf: ReadSurface["pursuitsOf"] = (...args) => this.reads.pursuitsOf(...args);
  readonly sharpen: WriteSurface["sharpen"] = (...args) => this.writes.sharpen(...args);
  readonly originOf: ReadSurface["originOf"] = (...args) => this.reads.originOf(...args);
  readonly whatIsKnown: ReadSurface["whatIsKnown"] = (...args) => this.reads.whatIsKnown(...args);
  readonly whatWasKnown: ReadSurface["whatWasKnown"] = (...args) =>
    this.reads.whatWasKnown(...args);
  readonly recordObservations: WriteSurface["recordObservations"] = (...args) =>
    this.writes.recordObservations(...args);
  readonly recordAnalysis: WriteSurface["recordAnalysis"] = (...args) =>
    this.writes.recordAnalysis(...args);
  readonly conclude: WriteSurface["conclude"] = (...args) => this.writes.conclude(...args);
  readonly synthesise: WriteSurface["synthesise"] = (...args) => this.writes.synthesise(...args);
  readonly recordReview: WriteSurface["recordReview"] = (...args) =>
    this.writes.recordReview(...args);
  readonly closeEnquiry: WriteSurface["closeEnquiry"] = (...args) =>
    this.writes.closeEnquiry(...args);
  readonly enquiryStatus: ReadSurface["enquiryStatus"] = (...args) =>
    this.reads.enquiryStatus(...args);
  readonly planWork: WriteSurface["planWork"] = (...args) => this.writes.planWork(...args);
  readonly contractFor: ReadSurface["contractFor"] = (...args) => this.reads.contractFor(...args);
  readonly stateCriterion: WriteSurface["stateCriterion"] = (...args) =>
    this.writes.stateCriterion(...args);
  readonly declareGate: WriteSurface["declareGate"] = (...args) => this.writes.declareGate(...args);
  readonly evaluateCriterion: WriteSurface["evaluateCriterion"] = (...args) =>
    this.writes.evaluateCriterion(...args);
  readonly criteriaGoverning: ReadSurface["criteriaGoverning"] = (...args) =>
    this.reads.criteriaGoverning(...args);
  readonly reverify: WriteSurface["reverify"] = (...args) => this.writes.reverify(...args);
  readonly reproductionOf: ReadSurface["reproductionOf"] = (...args) =>
    this.reads.reproductionOf(...args);
  readonly acceptAsUnresolved: WriteSurface["acceptAsUnresolved"] = (...args) =>
    this.writes.acceptAsUnresolved(...args);
  readonly is: WriteSurface["is"] = (...args) => this.writes.is(...args);
  readonly undo: WriteSurface["undo"] = (...args) => this.writes.undo(...args);
  readonly amendDesign: WriteSurface["amendDesign"] = (...args) => this.writes.amendDesign(...args);
  readonly designHistory: ReadSurface["designHistory"] = (...args) =>
    this.reads.designHistory(...args);
  readonly gateStatus: ReadSurface["gateStatus"] = (...args) => this.reads.gateStatus(...args);
  readonly criterionStanding: ReadSurface["criterionStanding"] = (...args) =>
    this.reads.criterionStanding(...args);
  readonly gateList: ReadSurface["gateList"] = (...args) => this.reads.gateList(...args);
  readonly workList: ReadSurface["workList"] = (...args) => this.reads.workList(...args);
  readonly replaceAnalysis: WriteSurface["replaceAnalysis"] = (...args) =>
    this.writes.replaceAnalysis(...args);
  readonly keep: WriteSurface["keep"] = (...args) => this.writes.keep(...args);
  readonly reinterpret: WriteSurface["reinterpret"] = (...args) => this.writes.reinterpret(...args);
  readonly interpretationHistory: ReadSurface["interpretationHistory"] = (...args) =>
    this.reads.interpretationHistory(...args);
  readonly doTheseConflict: ReadSurface["doTheseConflict"] = (...args) =>
    this.reads.doTheseConflict(...args);
  readonly claimsAsserting: ReadSurface["claimsAsserting"] = (...args) =>
    this.reads.claimsAsserting(...args);
  readonly whySupported: ReadSurface["whySupported"] = (...args) =>
    this.reads.whySupported(...args);
  readonly reproducibilityOf: ReadSurface["reproducibilityOf"] = (...args) =>
    this.reads.reproducibilityOf(...args);
  readonly whatDependsOn: ReadSurface["whatDependsOn"] = (...args) =>
    this.reads.whatDependsOn(...args);
  readonly why: ReadSurface["why"] = (...args) => this.reads.why(...args);
  readonly analysisRevision: ReadSurface["analysisRevision"] = (...args) =>
    this.reads.analysisRevision(...args);
  readonly search: ReadSurface["search"] = (...args) => this.reads.search(...args);
  readonly whatHappened: ReadSurface["whatHappened"] = (...args) =>
    this.reads.whatHappened(...args);
  readonly enquiryInContext: ReadSurface["enquiryInContext"] = (...args) =>
    this.reads.enquiryInContext(...args);
  readonly now: ReadSurface["now"] = (...args) => this.reads.now(...args);
}

/**
 * **`ResearchSession` delegates every research verb, checked at compile time.**
 *
 * `ResearchWrites` names the write verbs a research move calls;
 * `fragments/` depends on that type rather than on `WriteSurface`, and this is
 * what keeps a session able to satisfy it. A delegate whose signature drifts,
 * or one nobody added, fails to compile **here** rather than three files away
 * in whichever fragment happened to call it.
 *
 * A type, not a test, because the claim is about signatures: a runtime check
 * could only see that the properties exist, and the drift worth catching is a
 * delegate that still exists and no longer matches. A verb with no delegate at
 * all is invisible to the suite — every scenario writes through this class, and
 * one nobody has called yet is simply never reached.
 */
const _sessionDelegatesEveryResearchVerb: ResearchWrites = null as unknown as ResearchSession;
void _sessionDelegatesEveryResearchVerb;

/**
 * The same check for the read half.
 *
 * A read verb with no delegate is invisible in exactly the way a write one is:
 * every scenario reads through this class, and one nobody has called yet is
 * simply never reached.
 */
const _sessionDelegatesEveryRead: ResearchReads = null as unknown as ResearchSession;
void _sessionDelegatesEveryRead;
