/**
 * Research actions, not persistence operations.
 *
 * The layering this sits in the middle of:
 *
 *   src/db/        knows nodes and edges
 *   src/domain/    knows research actions   <- here
 *   (MCP, later)   knows researcher/agent language
 *
 * So there is deliberately no `createClaim()` / `createEvidence()` here —
 * those are persistence operations wearing domain names. One verb below may
 * create several nodes and many edges, and the caller neither knows nor cares:
 * `recordAnalysis()` writes a computation, an evidence unit, an output
 * artefact, and one piece of evidence and one claim per conclusion.
 *
 * Scope: S-11 only (docs/project-journal/008_user_story_mining.md). Verbs are
 * added when a scenario needs them, not in anticipation.
 */

import type { TenantGraph } from "../db/graph";
import { optional, scalar, vertexProps } from "../db/cypher";
import type { ArtefactProps, ClaimProps, ComputationProps, EvidenceProps } from "../db/domain";
import { type Clock, type EventSink, inMemoryEventLog, systemClock } from "./events";
import type {
  AnalysisRef,
  ChangedConclusion,
  Conclusion,
  EnquiryRef,
  ObservationsRef,
  ReplacementReport,
  ReviewRef,
  SupportExplanation,
  UnaffectedRecord,
} from "./report";

export interface ResearchSessionOptions {
  clock?: Clock;
  events?: EventSink;
}

export class ResearchSession {
  private readonly clock: Clock;
  readonly events: EventSink;

  constructor(
    private readonly graph: TenantGraph,
    options: ResearchSessionOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.events = options.events ?? inMemoryEventLog();
  }

  // -------------------------------------------------------------------------
  // Recording
  // -------------------------------------------------------------------------

  /** Opens a line of enquiry. S-11 needs one only as somewhere for its analyses to hang. */
  async openEnquiry(question: string): Promise<EnquiryRef> {
    const enquiry = await this.graph.createNode("LineOfEnquiry", { name: question });
    this.emit("openEnquiry", enquiry.natural_id, { question });
    return { kind: "enquiry", id: enquiry.natural_id };
  }

  /**
   * Records raw observations — the durable measurements an analysis later
   * interprets. Kept distinct from the conclusions drawn from them, which is
   * the entire premise of S-11: an inference can be wrong while the
   * observations it consumed remain fine.
   */
  async recordObservations(input: {
    enquiry: EnquiryRef;
    name: string;
    finding: string;
    contentHash?: string;
  }): Promise<ObservationsRef> {
    const artefact = await this.graph.createNode("Artefact", {
      kind: "observations",
      logical_name: input.name,
      ...(input.contentHash ? { content_hash: input.contentHash } : {}),
    });
    const evidence = await this.graph.createNode("Evidence", { statement: input.finding });
    await this.graph.createEdge(evidence.natural_id, "RECORDED_IN", artefact.natural_id);
    // The enquiry requires these observations. This is also, currently, the
    // ONLY way a later analysis can be traced back to what it read — see
    // recordAnalysis(). It says "the enquiry needs this", not "that analysis
    // consumed this", which is weaker than S-11 asks for.
    await this.graph.createEdge(input.enquiry.id, "REQUIRES", evidence.natural_id);

    this.emit("recordObservations", artefact.natural_id, { name: input.name });
    return { kind: "observations", id: artefact.natural_id };
  }

  /**
   * Records an analysis: a method applied to observations, yielding
   * conclusions. Creates the computation, the unit of work that ran it, the
   * artefact holding its output, and one finding + proposition per conclusion.
   *
   * `from` names the observations consumed — but there is no edge meaning
   * "this computation read that artefact". The only route back to them is
   * ADDRESSES to the enquiry, then REQUIRES to whatever observations the
   * enquiry needs (see recordObservations). That is archaeology: it answers
   * "what observations does this enquiry rest on", not "what did THIS
   * analysis read", and it cannot distinguish two analyses on one enquiry
   * that consumed different inputs. Recorded as a finding, not worked around
   * by stuffing the ids into a property that means something else.
   */
  async recordAnalysis(input: {
    enquiry: EnquiryRef;
    method: string;
    from: ObservationsRef[];
    concludes: Conclusion[];
  }): Promise<AnalysisRef> {
    const computation = await this.graph.createNode("Computation", {
      kind: input.method,
      status: "completed",
    });
    const unit = await this.graph.createNode("EvidenceUnit", { role: "analysis" });
    const output = await this.graph.createNode("Artefact", {
      kind: "analysis-output",
      logical_name: `${input.method} output`,
    });

    await this.graph.createEdge(unit.natural_id, "USES", computation.natural_id);
    await this.graph.createEdge(unit.natural_id, "ADDRESSES", input.enquiry.id);
    await this.graph.createEdge(unit.natural_id, "PRODUCES", output.natural_id);

    for (const conclusion of input.concludes) {
      const evidence = await this.graph.createNode("Evidence", { statement: conclusion.finding });
      const claim = await this.graph.createNode("Claim", { name: conclusion.proposition, kind: "confirmatory" });
      await this.graph.createEdge(unit.natural_id, "PRODUCES", evidence.natural_id);
      await this.graph.createEdge(evidence.natural_id, "RECORDED_IN", output.natural_id);
      await this.graph.createEdge(evidence.natural_id, "SUPPORTS", claim.natural_id);
    }

    this.emit("recordAnalysis", computation.natural_id, {
      method: input.method,
      // Kept in the event log because the graph has nowhere to put it.
      read: input.from.map((o) => o.id),
      concluded: input.concludes.map((c) => c.proposition),
    });
    return { kind: "analysis", id: computation.natural_id };
  }

  /** Records a reviewer's finding about an analysis. */
  async recordReview(input: { of: AnalysisRef; verdict: string }): Promise<ReviewRef> {
    const review = await this.graph.createNode("Review", { verdict: input.verdict });
    // A Review can EVALUATE a Claim, Decision or Evidence -- not an analysis.
    // The review's subject is therefore only in the event log, not the graph.
    this.emit("recordReview", review.natural_id, { of: input.of.id, verdict: input.verdict });
    return { kind: "review", id: review.natural_id };
  }

  // -------------------------------------------------------------------------
  // Revision
  // -------------------------------------------------------------------------

  /**
   * "Replace the analysis, mark the prior inference superseded, and propagate
   * whatever claims change." One instruction in the conversation, so one verb
   * here — it invalidates the old analysis's output, records the replacement
   * against the same observations, and returns what moved.
   *
   * The observations are deliberately untouched: only the artefact holding
   * the old analysis's OUTPUT is invalidated. That separation is the whole
   * point of S-11.
   */
  async replaceAnalysis(input: {
    supersedes: AnalysisRef;
    because: ReviewRef;
    enquiry: EnquiryRef;
    method: string;
    from: ObservationsRef[];
    concludes: Conclusion[];
  }): Promise<ReplacementReport> {
    const at = this.clock.now();
    const before = await this.conclusionsOf(input.supersedes);

    const output = await this.outputArtefactOf(input.supersedes);
    await this.graph.query(
      `MATCH (a:Artefact {natural_id: $id}) SET a.invalidated = true RETURN a`,
      { a: vertexProps<ArtefactProps>() },
      { id: output },
    );

    // "Mark the prior inference superseded" has no direct expression:
    // supersession runs between decisions only, and an analysis is not one.
    // The decision below is a genuine record ("we replaced X because of
    // review Y"), but the SUPERSEDES edge it wants to draw usually cannot be
    // drawn -- the analysis being replaced has no decision of its own unless
    // someone minted one purely to have something supersedable. Confirmed
    // empirically for S-11: one decision created, zero SUPERSEDES edges, and
    // every scenario assertion still passes. What actually carries
    // "superseded" here is the invalidated output artefact above.
    const supersededBy = await this.graph.createNode("Decision", {
      reason: `replaced ${input.supersedes.id}: ${await this.verdictOf(input.because)}`,
      invalidation_check: "re-review of the inferential method",
    });
    const original = await this.decisionFor(input.supersedes);
    if (original) await this.graph.createEdge(supersededBy.natural_id, "SUPERSEDES", original);

    const replacement = await this.recordAnalysis({
      enquiry: input.enquiry,
      method: input.method,
      from: input.from,
      concludes: input.concludes,
    });
    await this.linkDecision(supersededBy.natural_id, replacement);

    const changed: ChangedConclusion[] = [];
    const unchanged: string[] = [];
    for (const now of input.concludes) {
      const was = before.find((b) => b.proposition === now.proposition);
      if (!was) continue;
      if (was.finding === now.finding) unchanged.push(now.proposition);
      else changed.push({ proposition: now.proposition, before: was.finding, after: now.finding });
    }

    const unaffected: UnaffectedRecord[] = input.from.map((o) => ({
      what: o.id,
      why: "observations were not produced by the replaced analysis, and the replacement rests on them",
    }));

    const report: ReplacementReport = {
      at,
      affected: before.map((b) => b.proposition),
      unaffected,
      changed,
      unchanged,
    };
    this.emit("replaceAnalysis", replacement.id, {
      supersedes: input.supersedes.id,
      because: input.because.id,
      affected: report.affected,
      changed: report.changed.map((c) => c.proposition),
    });
    return report;
  }

  // -------------------------------------------------------------------------
  // Explanation -- must stay answerable long after the report was returned
  // -------------------------------------------------------------------------

  /** "Why does this conclusion count as supported?" and "what did the superseded inference claim?" */
  async whySupported(proposition: string): Promise<SupportExplanation> {
    const rows = await this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(e:Evidence)
       MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
       MATCH (u)-[:USES]->(comp:Computation)
       OPTIONAL MATCH (e)-[:RECORDED_IN]->(a:Artefact)
       RETURN e, comp, a`,
      { e: vertexProps<EvidenceProps>(), comp: vertexProps<ComputationProps>(), a: optional(vertexProps<ArtefactProps>()) },
      { name: proposition },
    );

    const support: SupportExplanation["support"] = [];
    const superseded: SupportExplanation["superseded"] = [];
    for (const row of rows) {
      const entry = { finding: row.e.statement, via: row.comp.kind };
      if (row.a?.invalidated) superseded.push({ ...entry, reason: "its analysis was replaced" });
      else support.push(entry);
    }

    // The observations reachable from the enquiry this claim's work addresses.
    // Note the shape of this traversal: it goes claim -> evidence -> unit ->
    // enquiry -> observations, because no edge connects an analysis directly
    // to what it read.
    const resting = await this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       MATCH (u)-[:ADDRESSES]->(loe:LineOfEnquiry)-[:REQUIRES]->(obs:Evidence)
       MATCH (obs)-[:RECORDED_IN]->(a:Artefact)
       RETURN a`,
      { a: vertexProps<ArtefactProps>() },
      { name: proposition },
    );

    return {
      proposition,
      supported: support.length > 0,
      support,
      restingOn: [...new Set(resting.map((r) => r.a.logical_name))],
      superseded,
    };
  }

  /** "What is affected if this record is invalidated, and what is not?" -- PJ-001's MVP propagation query. */
  async whatDependsOn(artefactName: string): Promise<{ claims: string[]; enquiries: string[] }> {
    const rows = await this.graph.query(
      `MATCH (a:Artefact {logical_name: $name})
       OPTIONAL MATCH (a)<-[:RECORDED_IN]-(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(claim:Claim)
       OPTIONAL MATCH (loe:LineOfEnquiry)-[:REQUIRES]->(e)
       RETURN claim, loe`,
      { claim: optional(vertexProps<ClaimProps>()), loe: optional(vertexProps<{ name: string }>()) },
      { name: artefactName },
    );
    return {
      claims: [...new Set(rows.flatMap((r) => (r.claim ? [r.claim.name] : [])))],
      enquiries: [...new Set(rows.flatMap((r) => (r.loe ? [r.loe.name] : [])))],
    };
  }

  // -------------------------------------------------------------------------
  // Internals -- the archaeology the current edge schema forces
  // -------------------------------------------------------------------------

  private emit(operation: string, subject: string, detail?: Record<string, unknown>): void {
    this.events.record({ at: this.clock.now(), operation, subject, detail });
  }

  private async conclusionsOf(analysis: AnalysisRef): Promise<Conclusion[]> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(u:EvidenceUnit)-[:PRODUCES]->(e:Evidence)
       MATCH (e)-[:SUPPORTS]->(c:Claim)
       RETURN e, c`,
      { e: vertexProps<EvidenceProps>(), c: vertexProps<ClaimProps>() },
      { id: analysis.id },
    );
    return rows.map((r) => ({ proposition: r.c.name, finding: r.e.statement }));
  }

  private async outputArtefactOf(analysis: AnalysisRef): Promise<string> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:PRODUCES]->(a:Artefact)
       RETURN a`,
      { a: vertexProps<ArtefactProps & { natural_id: string }>() },
      { id: analysis.id },
    );
    const found = rows[0];
    if (!found) throw new Error(`analysis ${analysis.id} has no output record`);
    return found.a.natural_id;
  }

  private async verdictOf(review: ReviewRef): Promise<string> {
    const rows = await this.graph.query(
      `MATCH (r:Review {natural_id: $id}) RETURN r`,
      { r: vertexProps<{ verdict: string }>() },
      { id: review.id },
    );
    return rows[0]?.r.verdict ?? "";
  }

  /** A Decision cannot point at a Computation, so "we use this analysis" is carried by BASED_ON to its evidence. */
  private async decisionFor(analysis: AnalysisRef): Promise<string | undefined> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:PRODUCES]->(e:Evidence)
       MATCH (d:Decision)-[:BASED_ON]->(e)
       RETURN d`,
      { d: vertexProps<{ natural_id: string }>() },
      { id: analysis.id },
    );
    return rows[0]?.d.natural_id;
  }

  private async linkDecision(decisionId: string, analysis: AnalysisRef): Promise<void> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:PRODUCES]->(e:Evidence)
       RETURN e`,
      { e: vertexProps<{ natural_id: string }>() },
      { id: analysis.id },
    );
    for (const row of rows) await this.graph.createEdge(decisionId, "BASED_ON", row.e.natural_id);
  }
}
