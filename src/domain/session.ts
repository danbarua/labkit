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
 * Scope: the scenarios built so far — S-11 (analysis replacement), S-17 and
 * S-3 (the criterion/gate chain). See docs/project-journal/008_user_story_mining.md.
 * Verbs are added when a scenario needs them, not in anticipation.
 */

import type { TenantGraph } from "../db/graph";
import { optional, scalar, vertexProps } from "../db/cypher";
import type { ArtefactProps, ClaimProps, ComputationProps, EvidenceProps } from "../db/domain";
import { type Clock, type EventSink, inMemoryEventLog, systemClock } from "./events";
import type {
  AnalysisRef,
  CheckStatus,
  EnquiryStatus,
  EvaluationRecord,
  CriterionRef,
  GateRef,
  GateStatus,
  WorkRef,
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

  /**
   * Opens a line of enquiry pursuing a question.
   *
   * Both nodes are created, because they are different things: the question
   * is what is unknown, the enquiry is how it is being pursued. Until S-4
   * this created only the enquiry — and closure attaches to the question, so
   * a closed enquiry went on reporting itself open. That was a service-layer
   * collapse, not a gap in the model: `MOTIVATES` and `RESOLVES` both already
   * existed. See PJ-008 row Q.
   *
   * The two currently share a name because the caller supplies one string.
   * A scenario that sharpens one question into several, or pursues one
   * question two ways, would be the thing that forces them apart.
   */
  async openEnquiry(question: string): Promise<EnquiryRef> {
    const asked = await this.graph.createNode("Question", { name: question });
    const enquiry = await this.graph.createNode("LineOfEnquiry", { name: question });
    await this.graph.createEdge(asked.natural_id, "MOTIVATES", enquiry.natural_id);
    this.emit("openEnquiry", enquiry.natural_id, { question, asked: asked.natural_id });
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
    // The enquiry requires these observations -- a statement about the
    // enquiry, not about any analysis. What a given analysis actually read is
    // CONSUMES, drawn in recordAnalysis(); this edge no longer stands in for
    // it.
    await this.graph.createEdge(input.enquiry.id, "REQUIRES", evidence.natural_id);

    this.emit("recordObservations", artefact.natural_id, { name: input.name });
    return { kind: "observations", id: artefact.natural_id };
  }

  /**
   * Records an analysis: a method applied to observations, yielding
   * conclusions. Creates the computation, the unit of work that ran it, the
   * artefact holding its output, and one finding + proposition per conclusion.
   *
   * `from` names the observations consumed, recorded as real execution
   * lineage (`CONSUMES`). Until S-11 forced the question there was no such
   * edge, and the only route back to inputs went out to the enquiry and
   * back — which answered a different question and produced a genuine false
   * inference in `whySupported()`. See EDGE_SCHEMA.CONSUMES.
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
    // Both levels of provenance, deliberately: the evidence unit produced
    // this scientific output; the computation produced this concrete
    // execution output. Without the second, CONSUMES would be half a pair --
    // "what did this computation read" answerable in one hop while "what did
    // it produce" still needed a detour through the unit.
    await this.graph.createEdge(unit.natural_id, "PRODUCES", output.natural_id);
    await this.graph.createEdge(computation.natural_id, "PRODUCES", output.natural_id);
    for (const observations of input.from) {
      await this.graph.createEdge(computation.natural_id, "CONSUMES", observations.id);
    }

    for (const conclusion of input.concludes) {
      const evidence = await this.graph.createNode("Evidence", { statement: conclusion.finding });
      const claim = await this.graph.createNode("Claim", { name: conclusion.proposition, kind: "confirmatory" });
      await this.graph.createEdge(unit.natural_id, "PRODUCES", evidence.natural_id);
      await this.graph.createEdge(evidence.natural_id, "RECORDED_IN", output.natural_id);
      // A null result is a finding, not an absence of one -- it bears
      // against the proposition rather than failing to bear on it.
      const bearing = conclusion.bearing === "challenges" ? "CHALLENGES" : "SUPPORTS";
      await this.graph.createEdge(evidence.natural_id, bearing, claim.natural_id);
    }

    this.emit("recordAnalysis", computation.natural_id, {
      method: input.method,
      read: input.from.map((o) => o.id),
      concluded: input.concludes.map((c) => c.proposition),
    });
    return { kind: "analysis", id: computation.natural_id };
  }

  /**
   * Records a reviewer's finding about an analysis.
   *
   * The review attaches to the inferential activity (the evidence unit), not
   * to the execution that ran it — what gets criticized in S-11 is the
   * method, and nothing ran incorrectly. See EDGE_SCHEMA.EVALUATES.
   */
  async recordReview(input: { of: AnalysisRef; verdict: string }): Promise<ReviewRef> {
    const review = await this.graph.createNode("Review", { verdict: input.verdict });
    await this.graph.createEdge(review.natural_id, "EVALUATES", await this.unitOf(input.of));
    this.emit("recordReview", review.natural_id, { of: input.of.id, verdict: input.verdict });
    return { kind: "review", id: review.natural_id };
  }

  // -------------------------------------------------------------------------
  // Question lifecycle
  // -------------------------------------------------------------------------

  /**
   * Closes an enquiry by resolving the question that motivates it.
   *
   * `answeredBy` is what makes this an answer rather than an abandonment:
   * closing with nothing cited is a real and different act, and the two must
   * not read alike.
   */
  async closeEnquiry(input: { enquiry: EnquiryRef; answeredBy?: AnalysisRef }): Promise<void> {
    const question = await this.questionBehind(input.enquiry);
    const decision = await this.graph.createNode("Decision", {
      reason: input.answeredBy ? `answered by ${input.answeredBy.id}` : "closed without a cited result",
      invalidation_check: "new evidence bearing on the question",
    });
    if (question) await this.graph.createEdge(decision.natural_id, "RESOLVES", question);

    if (input.answeredBy) {
      const findings = await this.graph.query(
        `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:PRODUCES]->(e:Evidence) RETURN e`,
        { e: vertexProps<{ natural_id: string }>() },
        { id: input.answeredBy.id },
      );
      for (const row of findings) {
        await this.graph.createEdge(decision.natural_id, "BASED_ON", row.e.natural_id);
      }
    }

    this.emit("closeEnquiry", input.enquiry.id, { answeredBy: input.answeredBy?.id ?? null });
  }

  /** Is this enquiry open, and if not, how did it close? */
  async enquiryStatus(enquiry: EnquiryRef): Promise<EnquiryStatus> {
    const named = await this.graph.query(
      `MATCH (loe:LineOfEnquiry {natural_id: $id}) RETURN loe`,
      { loe: vertexProps<{ name: string }>() },
      { id: enquiry.id },
    );
    const loe = named[0];
    if (!loe) throw new Error(`no enquiry ${enquiry.id}`);

    // Closure attaches to the question the enquiry pursues, not to the
    // enquiry itself -- an enquiry is a way of pursuing a question, and it is
    // the question that gets answered.
    const rows = await this.graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $id})
       OPTIONAL MATCH (resolving:Decision)-[:RESOLVES]->(q)
       OPTIONAL MATCH (deferring:Decision)-[:DEFERS]->(q)
       RETURN q, resolving, deferring`,
      {
        q: vertexProps<{ name: string }>(),
        resolving: optional(vertexProps<{ natural_id: string }>()),
        deferring: optional(vertexProps<{ natural_id: string }>()),
      },
      { id: enquiry.id },
    );

    const question = rows[0]?.q.name ?? loe.loe.name;
    const resolving = rows.find((r) => r.resolving)?.resolving ?? null;
    const deferred = rows.some((r) => r.deferring);

    if (!resolving && !deferred) {
      return { enquiry: enquiry.id, question, open: true, closure: null, answer: null, evidence: [] };
    }
    if (deferred && !resolving) {
      return { enquiry: enquiry.id, question, open: false, closure: "deferred", answer: null, evidence: [] };
    }

    // What the closing decision rests on. Nothing cited means the question was
    // abandoned, not answered -- absence of evidence is not a negative result.
    const cited = await this.graph.query(
      `MATCH (:Decision {natural_id: $id})-[:BASED_ON]->(e:Evidence)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(against:Claim)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(forClaim:Claim)
       RETURN e, against, forClaim`,
      {
        e: vertexProps<{ statement: string }>(),
        against: optional(vertexProps<{ name: string }>()),
        forClaim: optional(vertexProps<{ name: string }>()),
      },
      { id: resolving!.natural_id },
    );

    if (cited.length === 0) {
      return { enquiry: enquiry.id, question, open: false, closure: "abandoned", answer: null, evidence: [] };
    }

    // Polarity is derived from which way the cited findings cut, not stored on
    // the decision: a question answered by evidence that challenges its
    // proposition was answered "no".
    const challenges = cited.some((r) => r.against !== null);
    return {
      enquiry: enquiry.id,
      question,
      open: false,
      closure: "answered",
      answer: challenges ? "no" : "yes",
      evidence: [...new Set(cited.map((r) => r.e.statement))],
    };
  }

  private async questionBehind(enquiry: EnquiryRef): Promise<string | undefined> {
    const rows = await this.graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $id}) RETURN q`,
      { q: vertexProps<{ natural_id: string }>() },
      { id: enquiry.id },
    );
    return rows[0]?.q.natural_id;
  }

  // -------------------------------------------------------------------------
  // Gating
  // -------------------------------------------------------------------------

  /** Records a piece of work whose start a gate may protect. */
  async planWork(input: { objective: string; acceptance: string }): Promise<WorkRef> {
    const task = await this.graph.createNode("Task", {
      objective: input.objective,
      inputs: "",
      outputs: "",
      acceptance: input.acceptance,
      is_open: true,
    });
    this.emit("planWork", task.natural_id, { objective: input.objective });
    return { kind: "work", id: task.natural_id };
  }

  /** States a condition that must hold. Stating it is not evaluating it. */
  async stateCriterion(proposition: string): Promise<CriterionRef> {
    const criterion = await this.graph.createNode("Criterion", { proposition });
    this.emit("stateCriterion", criterion.natural_id, { proposition });
    return { kind: "criterion", id: criterion.natural_id };
  }

  /**
   * Declares a gate: a consequence attached to a criterion, protecting some
   * work. Declaring a gate must not make it satisfied — that is the entire
   * subject of S-17.
   */
  async declareGate(input: { governedBy: CriterionRef[]; consequence: string; protecting: WorkRef[] }): Promise<GateRef> {
    if (input.governedBy.length === 0) throw new Error("a gate governed by no condition is not a gate");
    const gate = await this.graph.createNode("Gate", { consequence: input.consequence });
    for (const criterion of input.governedBy) {
      await this.graph.createEdge(criterion.id, "GOVERNS", gate.natural_id);
    }
    for (const work of input.protecting) {
      await this.graph.createEdge(gate.natural_id, "GATES", work.id);
    }
    this.emit("declareGate", gate.natural_id, {
      governedBy: input.governedBy.map((c) => c.id),
      protecting: input.protecting.map((w) => w.id),
    });
    return { kind: "gate", id: gate.natural_id };
  }

  /**
   * Records that a criterion was actually evaluated, and what came back.
   *
   * The criterion must already govern the gate. Without that check an
   * evaluation could be attached to an unrelated gate, and `gateStatus()`
   * would mostly *hide* the result — its traversal starts from `GOVERNS`, so
   * the malformed evaluation sits in the graph as durable nonsense without
   * producing a visibly wrong report. Same invariant class as
   * `assertReviewOf`, and checked before anything is written so a rejected
   * command leaves no partial state.
   */
  async evaluateCriterion(input: {
    criterion: CriterionRef;
    gate: GateRef;
    value: string;
    outcome: "pass" | "fail";
  }): Promise<void> {
    await this.assertCriterionGovernsGate(input.criterion, input.gate);
    const at = this.clock.now();
    const evaluation = await this.graph.createNode("CriterionEvaluation", {
      value: input.value,
      outcome: input.outcome,
      evaluated_at: at,
    });
    await this.graph.createEdge(input.criterion.id, "EVALUATED_AS", evaluation.natural_id);
    await this.graph.createEdge(evaluation.natural_id, "TRIGGERS", input.gate.id);
    this.emit("evaluateCriterion", evaluation.natural_id, {
      criterion: input.criterion.id,
      gate: input.gate.id,
      outcome: input.outcome,
    });
  }

  /**
   * Which criterion governs this gate?
   *
   * The reviewer in S-17 asks for evidence that the guard fails when the
   * protected artefact is wrong. That is a question about the criterion, and
   * answering it requires knowing which criterion a gate enforces.
   *
   * Answered via `GOVERNS`, which exists from the moment the gate is
   * declared. Before that edge, the only route ran through a
   * CriterionEvaluation and so returned null for exactly the gates S-17 is
   * about — see EDGE_SCHEMA.GOVERNS.
   */
  async criteriaGoverning(gate: GateRef): Promise<CriterionRef[]> {
    const rows = await this.graph.query(
      `MATCH (c:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ natural_id: string }>() },
      { id: gate.id },
    );
    return rows.map((r) => ({ kind: "criterion" as const, id: r.c.natural_id }));
  }

  /**
   * S-17/S-3: may this gate be relied on, and on what evidence?
   *
   * Every governing condition is itemised, including the ones nobody has
   * evaluated. That is the point: S-3 requires a failed check to be
   * distinguishable from a check never run, and an absent list entry cannot
   * carry that difference.
   */
  async gateStatus(gate: GateRef): Promise<GateStatus> {
    const declared = await this.graph.query(
      `MATCH (g:Gate {natural_id: $id}) RETURN g`,
      { g: vertexProps<{ consequence: string }>() },
      { id: gate.id },
    );
    const found = declared[0];
    if (!found) throw new Error(`no gate ${gate.id}`);

    // Every governing criterion with the evaluations that pertain to THIS
    // gate. Two scopes are deliberately kept apart, and S-17 plus S-3
    // together are what force the distinction:
    //
    //   gate-scoped  (here) -- has this condition been checked FOR this gate?
    //   criterion-scoped    -- has this check ever been shown able to fail?
    //
    // One criterion can govern several gates and be evaluated separately
    // against each (the same hash check, run against staging and against
    // release). Collapsing the two scopes made a gate nobody had evaluated
    // report as blocked because its criterion had failed somewhere else.
    //
    // OPTIONAL MATCH is load-bearing twice over: a criterion nobody evaluated
    // must still appear as a check, and `g` is bound from the first MATCH so
    // only evaluations triggering this gate count.
    const rows = await this.graph.query(
      `MATCH (c:Criterion)-[:GOVERNS]->(g:Gate {natural_id: $id})
       OPTIONAL MATCH (c)-[:EVALUATED_AS]->(ev:CriterionEvaluation)-[:TRIGGERS]->(g)
       RETURN c, ev`,
      {
        c: vertexProps<{ natural_id: string; proposition: string }>(),
        ev: optional(
          vertexProps<{ natural_id: string; value: string; outcome: "pass" | "fail"; evaluated_at: string }>(),
        ),
      },
      { id: gate.id },
    );

    // Keyed by natural id, not by proposition text. Two criteria worded
    // identically are two criteria; whether they SHOULD be one is an identity
    // question, and a read-side query must not settle it by string equality.
    type TimedEvaluation = EvaluationRecord & { id: string };
    const byCriterion = new Map<string, { proposition: string; evaluations: TimedEvaluation[] }>();
    for (const row of rows) {
      const id = row.c.natural_id;
      const entry = byCriterion.get(id) ?? { proposition: row.c.proposition, evaluations: [] };
      if (row.ev) {
        entry.evaluations.push({
          id: row.ev.natural_id,
          value: row.ev.value,
          outcome: row.ev.outcome,
          at: row.ev.evaluated_at,
        });
      }
      byCriterion.set(id, entry);
    }

    const strip = ({ value, outcome, at }: TimedEvaluation): EvaluationRecord => ({ value, outcome, at });

    const checks: CheckStatus[] = [];
    const evaluations: GateStatus["evaluations"] = [];
    for (const [id, entry] of byCriterion) {
      // Cypher imposes no ordering, so sort explicitly: by time, then by
      // identity. Without this, which evaluation gets reported as "the" value
      // of a check is not a stable contract between runs.
      const ordered = entry.evaluations.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
      evaluations.push(...ordered.map(strip));

      // A failure sticks: one failing evaluation is decisive for this check
      // even if a later run passed, so re-running until green is not
      // evidence. NOTE this is an S-3 policy that currently applies to every
      // gate -- see ledger row X, which asks whether a repaired artefact
      // should stay blocked forever.
      const decisive = ordered.find((e) => e.outcome === "fail") ?? ordered[0];
      checks.push({
        criterion: id,
        proposition: entry.proposition,
        state: decisive === undefined ? "never-run" : decisive.outcome === "fail" ? "failed" : "passed",
        evaluations: ordered.map(strip),
        ...(decisive ? { decidedBy: strip(decisive) } : {}),
      });
    }

    const unmet = checks.filter((c) => c.state !== "passed").map((c) => c.proposition);

    // Order matters. Absence is checked before satisfaction so a gate nobody
    // evaluated can never fall through to "satisfied" (S-17); failure is
    // checked before incompleteness because a failure is decisive (S-3).
    const state: GateStatus["state"] = checks.every((c) => c.state === "never-run")
      ? "never-evaluated"
      : checks.some((c) => c.state === "failed")
        ? "blocked"
        : checks.some((c) => c.state === "never-run")
          ? "incomplete"
          : "satisfied";

    // Criterion-scoped, deliberately unfiltered by gate: "has this check ever
    // been shown able to fail" is a question about the check itself.
    const criterionOutcomes = await this.graph.query(
      `MATCH (c:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id})
       MATCH (c)-[:EVALUATED_AS]->(ev:CriterionEvaluation)
       RETURN ev`,
      { ev: vertexProps<{ outcome: "pass" | "fail" }>() },
      { id: gate.id },
    );

    const gating = await this.graph.query(
      `MATCH (:Gate {natural_id: $id})-[:GATES]->(w) RETURN w`,
      { w: vertexProps<{ objective?: string; kind?: string }>() },
      { id: gate.id },
    );

    return {
      gate: gate.id,
      consequence: found.g.consequence,
      state,
      checks,
      unmet,
      evaluations,
      gating: gating.map((g) => g.w.objective ?? g.w.kind ?? "unknown"),
      everFailed: criterionOutcomes.some((r) => r.ev.outcome === "fail"),
    };
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
    await this.assertReviewOf(input.because, input.supersedes);
    const before = await this.conclusionsOf(input.supersedes);

    const output = await this.outputArtefactOf(input.supersedes);
    await this.graph.query(
      `MATCH (a:Artefact {natural_id: $id}) SET a.invalidated = true RETURN a`,
      { a: vertexProps<ArtefactProps>() },
      { id: output },
    );

    // Note what is NOT recorded here: no Decision, and no SUPERSEDES edge.
    //
    // Not a Decision. An earlier draft minted one ("we replaced X because of
    // review Y") and linked it BASED_ON to the REPLACEMENT's evidence, which
    // points causality backwards -- the decision to replace preceded that
    // evidence and cannot rest on it. No assertion used it. S-11 contains an
    // invalidated analysis and a replacement, both of which the graph
    // represents directly; it does not contain a researcher decision. S-7,
    // which turns on an explicit decision to amend a locked procedure, is
    // where a Decision should be earned.
    //
    // Nor supersession. Invalidating the replaced analysis's output plus the
    // replacement's own support answers every question this scenario asks.
    // That is not the same as concluding invalidation *is* supersession:
    // `invalidated = true` means "no longer valid as a source of current
    // inference", and the two merely coincide here. S-12 is the
    // discriminator -- there the numbers stay valid and only the
    // interpretation changes, which invalidation cannot honestly carry.
    const replacement = await this.recordAnalysis({
      enquiry: input.enquiry,
      method: input.method,
      from: input.from,
      concludes: input.concludes,
    });

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
       OPTIONAL MATCH (r:Review)-[:EVALUATES]->(u)
       RETURN e, comp, a, r`,
      {
        e: vertexProps<EvidenceProps>(),
        comp: vertexProps<ComputationProps>(),
        a: optional(vertexProps<ArtefactProps>()),
        r: optional(vertexProps<{ verdict: string }>()),
      },
      { name: proposition },
    );

    const support: SupportExplanation["support"] = [];
    const superseded: SupportExplanation["superseded"] = [];
    for (const row of rows) {
      const entry = { finding: row.e.statement, via: row.comp.kind };
      // Why support was withdrawn comes from the review of the inferential
      // unit -- the edge S-11 earned. Before it existed this was a hardcoded
      // string, because the review's subject lived only in the event stream.
      //
      // Two related gaps, recorded rather than solved. With NO review the
      // reason is manufactured, which is the absence-vs-inconclusive shape
      // (PJ-008 row I) and should probably be null. With SEVERAL reviews of
      // one unit the row multiplies and the reason is ambiguous: EVALUATES
      // says who reviewed the analysis, never which review caused a later
      // invalidation. That second one may not want a relationship at all --
      // it describes why state changed, which is what the event history is
      // for. S-3/S-7 should put enough pressure on the event model to settle
      // both.
      if (row.a?.invalidated) superseded.push({ ...entry, reason: row.r?.verdict ?? "its analysis was replaced" });
      else support.push(entry);
    }

    // What the analyses actually consumed -- one hop from the computation,
    // not a detour through the enquiry. Only currently-supporting evidence
    // counts: a superseded analysis's inputs are not what the claim rests on
    // now.
    const resting = await this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(e:Evidence)<-[:PRODUCES]-(:EvidenceUnit)-[:USES]->(comp:Computation)
       MATCH (comp)-[:CONSUMES]->(a:Artefact)
       MATCH (e)-[:RECORDED_IN]->(out:Artefact)
       WHERE out.invalidated IS NULL OR out.invalidated = false
       RETURN a`,
      // `invalidated` is optional, so "not invalidated" has two spellings:
      // absent, and explicitly false. Both are accepted here because the
      // sibling branch above partitions on JS truthiness, which treats them
      // alike. A bare `IS NULL` did not, and the mismatch made a claim whose
      // output artefact was explicitly `false` report supported-but-resting-
      // on-nothing.
      //
      // NB: "never invalidated" and "no output artefact" still look alike.
      // Safe only because recordAnalysis always draws RECORDED_IN.
      { a: vertexProps<ArtefactProps>() },
      { name: proposition },
    );

    // Findings that bear against the proposition. Without this, a refuted
    // claim and one nobody has examined return identical objects -- both
    // `supported: false` with empty support -- which asserts an equivalence
    // between two different scientific states.
    const againstRows = await this.graph.query(
      // `u` is bound and reused deliberately. Two anonymous (:EvidenceUnit)
       // patterns do not have to match the same unit, so the computation came
       // back as a cross product with every other analysis in the tenant.
      `MATCH (c:Claim {name: $name})<-[:CHALLENGES]-(e:Evidence)
       MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
       MATCH (u)-[:USES]->(comp:Computation)
       RETURN e, comp`,
      { e: vertexProps<EvidenceProps>(), comp: vertexProps<ComputationProps>() },
      { name: proposition },
    );
    const against = againstRows.map((r) => ({ finding: r.e.statement, via: r.comp.kind }));

    return {
      proposition,
      supported: support.length > 0,
      support,
      restingOn: [...new Set(resting.map((r) => r.a.logical_name))],
      superseded,
      challenged: against.length > 0,
      against,
    };
  }

  /**
   * "What is affected if this record is invalidated?" -- PJ-001's MVP
   * propagation query. Deliberately the affected side only; what is *not*
   * affected is reported by replaceAnalysis, because it depends on what the
   * replacement rests on rather than on the invalidated record alone.
   *
   * Unrelated to whySupported()'s `restingOn`, which moved to CONSUMES: this
   * asks which enquiries REQUIRE the evidence held here, not what any
   * computation read.
   */
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
    // One hop, via the computation's own PRODUCES -- the direct counterpart
    // to CONSUMES. This previously had to go out through the evidence unit.
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})-[:PRODUCES]->(a:Artefact)
       RETURN a`,
      { a: vertexProps<ArtefactProps & { natural_id: string }>() },
      { id: analysis.id },
    );
    const found = rows[0];
    if (!found) throw new Error(`analysis ${analysis.id} has no output record`);
    return found.a.natural_id;
  }

  /**
   * A replacement must be justified by a review OF the analysis being
   * replaced -- otherwise any review's verdict could retire any analysis,
   * and `whySupported()` would report a withdrawal reason that never
   * referred to the withdrawn work.
   *
   * This is why `Review -[:EVALUATES]-> EvidenceUnit` is not decorative: it
   * constrains a research action, not just an explanatory query.
   */
  private async assertCriterionGovernsGate(criterion: CriterionRef, gate: GateRef): Promise<void> {
    const rows = await this.graph.query(
      `MATCH (:Criterion {natural_id: $criterion})-[:GOVERNS]->(:Gate {natural_id: $gate}) RETURN 1`,
      { ok: scalar<number>() },
      { criterion: criterion.id, gate: gate.id },
    );
    if (rows.length === 0) {
      throw new Error(`criterion ${criterion.id} does not govern gate ${gate.id}; it cannot be evaluated for it`);
    }
  }

  private async assertReviewOf(review: ReviewRef, analysis: AnalysisRef): Promise<void> {
    const rows = await this.graph.query(
      `MATCH (:Review {natural_id: $review})-[:EVALUATES]->(:EvidenceUnit)-[:USES]->(:Computation {natural_id: $analysis})
       RETURN 1`,
      { ok: scalar<number>() },
      { review: review.id, analysis: analysis.id },
    );
    if (rows.length === 0) {
      throw new Error(`review ${review.id} does not review analysis ${analysis.id}; it cannot justify replacing it`);
    }
  }

  /**
   * The inferential activity behind an analysis.
   *
   * An `AnalysisRef` currently carries the computation's id, so reaching the
   * unit is a hop. Worth watching: "analysis" keeps behaving like the
   * EvidenceUnit (the bounded inferential activity) rather than the
   * Computation (its execution) -- the review endpoint went that way too. Not
   * changed now, because S-11 passes and renaming nouns is not a reason to
   * refactor; flagged so a later scenario can settle it.
   */
  private async unitOf(analysis: AnalysisRef): Promise<string> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(u:EvidenceUnit) RETURN u`,
      { u: vertexProps<{ natural_id: string }>() },
      { id: analysis.id },
    );
    const found = rows[0];
    if (!found) throw new Error(`analysis ${analysis.id} has no inferential unit`);
    return found.u.natural_id;
  }

}
