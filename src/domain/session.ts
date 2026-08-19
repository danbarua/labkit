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
 * S-3 (the criterion/gate chain), S-4 (negative closure), S-1 (posing,
 * pursuing and sharpening questions), S-7 (amending a locked design). See
 * docs/project-journal/008_user_story_mining.md. Verbs are added when a
 * scenario needs them, not in anticipation.
 */

import type { TenantGraph } from "../db/graph";
import { optional, scalar, vertexProps } from "../db/cypher";
import type { ArtefactProps, ClaimProps, ComputationProps, EvidenceProps } from "../db/domain";
import { type Clock, type EventSink, inMemoryEventLog, systemClock } from "./events";
import type {
  ReproductionReport,
  VerificationReport,
  AmendmentRecord,
  TaskContract,
  ClaimSubject,
  ConflictSide,
  ConflictVerdict,
  AmendmentReport,
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
  ConclusionRef,
  DesignHistory,
  EnquiryRef,
  KnowledgeSurvey,
  ObservationsRef,
  QuestionOrigin,
  QuestionRef,
  QuestionStanding,
  InterpretationHistory,
  ReinterpretationReport,
  ReplacementReport,
  Revision,
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
   * Puts a question on the record without pursuing it.
   *
   * This is what makes "untested" a state of the record rather than something
   * a reader invents: S-1 must answer *what has not been tested*, and a
   * question nobody has written down cannot be reported as untested without
   * manufacturing it. Posing is deliberately cheap — a hunch is allowed on the
   * books before anyone knows what the experiment is.
   *
   * Identity is the returned handle, never the wording. Posing the same words
   * twice gives two questions, because two people can ask the same thing for
   * different reasons and only the asker knows whether they meant one.
   */
  async pose(question: string): Promise<QuestionRef> {
    const asked = await this.posed(question);
    this.emit("pose", asked.id, { question });
    return asked;
  }

  /**
   * The write, without the event. Verbs that compose this one record the
   * action the caller actually took, not the steps it decomposed into — the
   * event stream is a record of research actions, and a researcher who opened
   * an enquiry did one thing, not three.
   */
  private async posed(question: string): Promise<QuestionRef> {
    const asked = await this.graph.createNode("Question", { name: question });
    return { kind: "question", id: asked.natural_id };
  }

  /**
   * Opens a line of enquiry pursuing a question already on the record.
   *
   * One question may be pursued many ways — that is what a `LineOfEnquiry`
   * *is*, and until S-1 nothing exercised it: every enquiry had exactly one
   * question and every question exactly one enquiry, so the two were
   * distinguishable only by S-4's closure argument. `approach` names the
   * pursuit, not the question, and carrying similar words to another pursuit
   * of the same question has no effect on identity either way.
   */
  async pursue(input: { question: QuestionRef; approach: string }): Promise<EnquiryRef> {
    const enquiry = await this.pursued(input);
    this.emit("pursue", enquiry.id, { question: input.question.id, approach: input.approach });
    return enquiry;
  }

  /** The write, without the event — see `posed`. */
  private async pursued(input: { question: QuestionRef; approach: string }): Promise<EnquiryRef> {
    const enquiry = await this.graph.createNode("LineOfEnquiry", { name: input.approach });
    await this.graph.createEdge(input.question.id, "MOTIVATES", enquiry.natural_id);
    return { kind: "enquiry", id: enquiry.natural_id };
  }

  /**
   * Poses a question and immediately pursues it — the common case, and the
   * only shape that existed before S-1.
   *
   * Both nodes are created, because they are different things: the question is
   * what is unknown, the enquiry is how it is being pursued. Until S-4 this
   * created only the enquiry — and closure attaches to the question, so a
   * closed enquiry went on reporting itself open. That was a service-layer
   * collapse, not a gap in the model: `MOTIVATES` and `RESOLVES` both already
   * existed. See PJ-008 row Q.
   */
  async openEnquiry(question: string): Promise<EnquiryRef> {
    const asked = await this.posed(question);
    const enquiry = await this.pursued({ question: asked, approach: question });
    this.emit("openEnquiry", enquiry.id, { question, asked: asked.id });
    return enquiry;
  }

  /** Every line of enquiry pursuing this question. */
  async pursuitsOf(question: QuestionRef): Promise<EnquiryRef[]> {
    const rows = await this.graph.query(
      `MATCH (:Question {natural_id: $id})-[:MOTIVATES]->(loe:LineOfEnquiry) RETURN loe`,
      { loe: vertexProps<{ natural_id: string }>() },
      { id: question.id },
    );
    return rows.map((r) => ({ kind: "enquiry", id: r.loe.natural_id }) as EnquiryRef);
  }

  /**
   * Sharpens a question into a more precise one, recording the act rather than
   * editing the original.
   *
   * The original keeps its words. A vague hunch that later turns out to have
   * been the right instinct is worth being able to read back in the form it
   * was actually held, and rewriting it in place would make every programme
   * look as though it had known its final question from the start — which is
   * S-1's whole complaint.
   *
   * Sharpening is not answering and not closing: the original stays open
   * unless something later resolves it on evidence.
   *
   * `knowing` freezes what the act was taken in light of. It is captured here,
   * at the moment of sharpening, because the alternative — reconstructing it
   * later from what stands *now* — back-dates every subsequent result onto the
   * decision. S-1 asks this question after more evidence has arrived, for
   * exactly that reason.
   */
  async sharpen(input: { from: QuestionRef; into: string; because: string }): Promise<QuestionRef> {
    const original = await this.graph.query(
      `MATCH (q:Question {natural_id: $id}) RETURN q`,
      { q: vertexProps<{ name: string }>() },
      { id: input.from.id },
    );
    if (original.length === 0) throw new Error(`no question ${input.from.id} to sharpen`);

    const decision = await this.graph.createNode("Decision", {
      reason: input.because,
      invalidation_check: "evidence that the sharper question was the wrong one to ask",
    });
    await this.graph.createEdge(decision.natural_id, "NARROWS", input.from.id);

    for (const finding of await this.standingFindings()) {
      await this.graph.createEdge(decision.natural_id, "BASED_ON", finding);
    }

    const sharper = await this.posed(input.into);
    await this.graph.createEdge(decision.natural_id, "MOTIVATES", sharper.id);
    this.emit("sharpen", sharper.id, { from: input.from.id, because: input.because, via: decision.natural_id });
    return sharper;
  }

  /** Every finding currently on the record — what "we knew at the time" means when an act is recorded. */
  private async standingFindings(): Promise<string[]> {
    const rows = await this.graph.query(
      `MATCH (:EvidenceUnit)-[:PRODUCES]->(e:Evidence)
       OPTIONAL MATCH (e)-[:RECORDED_IN]->(a:Artefact)
       RETURN e, a`,
      {
        e: vertexProps<{ natural_id: string }>(),
        a: optional(vertexProps<{ invalidated?: boolean }>()),
      },
    );
    return rows.filter((r) => !r.a?.invalidated).map((r) => r.e.natural_id);
  }

  /**
   * Where a question came from, if it came from sharpening an earlier one.
   *
   * `null` for a question somebody simply asked — most questions have no
   * origin beyond the person who thought of it, and inventing one would be
   * worse than saying so.
   */
  async originOf(question: QuestionRef): Promise<QuestionOrigin | null> {
    const rows = await this.graph.query(
      `MATCH (d:Decision)-[:MOTIVATES]->(:Question {natural_id: $id})
       MATCH (d)-[:NARROWS]->(from:Question)
       RETURN d, from AS origin`,
      {
        d: vertexProps<{ natural_id: string; reason: string }>(),
        origin: vertexProps<{ natural_id: string; name: string }>(),
      },
      { id: question.id },
    );
    if (rows.length === 0) return null;

    const row = rows[0]!;
    const knew = await this.graph.query(
      `MATCH (:Decision {natural_id: $id})-[:BASED_ON]->(e:Evidence) RETURN e`,
      { e: vertexProps<{ statement: string }>() },
      { id: row.d.natural_id },
    );

    return {
      from: row.origin.natural_id,
      fromAsks: row.origin.name,
      reason: row.d.reason,
      knownAtTheTime: knew.map((r) => r.e.statement).sort(),
    };
  }

  /**
   * What the programme knows: settled, unsettled, and never looked at.
   *
   * Three states rather than two, classified structurally — established is a
   * question resolved on cited evidence, untested is one nothing has ever been
   * run against, unresolved is the rest. Nothing here compares a question's
   * words to a claim's; the buckets come from what is attached to each
   * question, not from what it says.
   */
  async whatIsKnown(): Promise<KnowledgeSurvey> {
    const rows = await this.graph.query(
      `MATCH (q:Question)
       OPTIONAL MATCH (resolving:Decision)-[:RESOLVES]->(q)
       OPTIONAL MATCH (resolving)-[:BASED_ON]->(cited:Evidence)
       OPTIONAL MATCH (q)-[:MOTIVATES]->(:LineOfEnquiry)<-[:ADDRESSES]-(work:EvidenceUnit)
       RETURN q, cited, work`,
      {
        q: vertexProps<{ natural_id: string; name: string }>(),
        cited: optional(vertexProps<{ natural_id: string }>()),
        work: optional(vertexProps<{ natural_id: string }>()),
      },
    );

    const byQuestion = new Map<string, { asks: string; cited: boolean; worked: boolean }>();
    for (const row of rows) {
      const entry = byQuestion.get(row.q.natural_id) ?? { asks: row.q.name, cited: false, worked: false };
      entry.cited ||= row.cited !== null;
      entry.worked ||= row.work !== null;
      byQuestion.set(row.q.natural_id, entry);
    }

    const survey: KnowledgeSurvey = { established: [], unresolved: [], untested: [] };
    for (const [question, entry] of byQuestion) {
      const standing: QuestionStanding = { question, asks: entry.asks };
      if (entry.cited) survey.established.push(standing);
      else if (entry.worked) survey.unresolved.push(standing);
      else survey.untested.push(standing);
    }
    return survey;
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
    /**
     * The planned work this analysis carries out, if it carries out any.
     *
     * Earned by S-7: a gate protects work, and until an analysis said which
     * work it was, the blast radius of amending a gated condition reached the
     * *work* and stopped there — so "was any confirmatory result affected?"
     * could only be answered by asserting it. `IMPLEMENTS` already existed
     * for this and had never been written.
     */
    implementing?: WorkRef;
    /**
     * The prespecified conditions this analysis's conclusions are held to.
     *
     * Earned by S-3b: criteria that qualify a finding and gate nothing. The
     * checks are agreed before the run, so they are stated separately and
     * named here; recording them at evaluation time cannot work, because a
     * check nobody ran must still count against the finding. See
     * EDGE_SCHEMA.QUALIFIES.
     */
    heldTo?: CriterionRef[];
  }): Promise<AnalysisRef> {
    // Checked before anything is written. A proposition the record has
    // withdrawn cannot be re-asserted as a side effect of recording an
    // analysis: a fresh claim node would restore it while the objection that
    // withdrew it still stood, and the record would un-retract itself. See
    // PJ-008 row AC -- re-opening a withdrawn reading is a deliberate act, and
    // there is no verb for it yet.
    for (const conclusion of input.concludes) {
      // Scoped to the line of enquiry being recorded. Unscoped, this guard had
      // the very defect S-5 is about: a sentence withdrawn in one enquiry
      // would block legitimate work concluding the same words in another.
      const { withdrawn, replacedBy } = await this.withdrawalOf({
        proposition: conclusion.proposition,
        enquiry: input.enquiry.id,
      });
      if (withdrawn) {
        throw new Error(
          `"${conclusion.proposition}" was withdrawn${replacedBy ? ` in favour of "${replacedBy}"` : ""}; it cannot be re-asserted by recording another analysis`,
        );
      }
    }

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
    if (input.implementing) await this.graph.createEdge(input.implementing.id, "IMPLEMENTS", unit.natural_id);
    for (const criterion of input.heldTo ?? []) {
      await this.graph.createEdge(criterion.id, "QUALIFIES", unit.natural_id);
    }
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
      const claim = await this.graph.createNode("Claim", {
        name: conclusion.proposition,
        kind: conclusion.standing ?? "exploratory",
      });
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
  async closeEnquiry(input: { enquiry: EnquiryRef; answeredBy?: ConclusionRef }): Promise<void> {
    // Everything is validated before anything is written. A rejected close
    // must leave no Decision behind, and an analysis from some other enquiry
    // must not become the stated basis for resolving this question.
    const question = await this.questionBehind(input.enquiry);
    if (!question) throw new Error(`enquiry ${input.enquiry.id} has no motivating question to resolve`);

    let answerBearing: string | undefined;
    if (input.answeredBy) {
      const { analysis, proposition } = input.answeredBy;
      const addresses = await this.graph.query(
        `MATCH (:Computation {natural_id: $analysis})<-[:USES]-(:EvidenceUnit)-[:ADDRESSES]->(:LineOfEnquiry {natural_id: $enquiry})
         RETURN 1`,
        { ok: scalar<number>() },
        { analysis: analysis.id, enquiry: input.enquiry.id },
      );
      if (addresses.length === 0) {
        throw new Error(`analysis ${analysis.id} does not address enquiry ${input.enquiry.id}; it cannot answer its question`);
      }
      answerBearing = await this.findingFor(analysis, proposition);
      if (!answerBearing) {
        throw new Error(`analysis ${analysis.id} concluded nothing about "${proposition}"`);
      }
    }

    const decision = await this.graph.createNode("Decision", {
      reason: input.answeredBy ? `answered on "${input.answeredBy.proposition}"` : "closed without a cited result",
      invalidation_check: "new evidence bearing on the question",
    });
    await this.graph.createEdge(decision.natural_id, "RESOLVES", question);
    if (answerBearing) await this.graph.createEdge(decision.natural_id, "BASED_ON", answerBearing);

    this.emit("closeEnquiry", input.enquiry.id, {
      answeredBy: input.answeredBy?.analysis.id ?? null,
      proposition: input.answeredBy?.proposition ?? null,
    });
  }

  /** The single finding by which an analysis concluded something about one proposition. */
  private async findingFor(analysis: AnalysisRef, proposition: string): Promise<string | undefined> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $analysis})<-[:USES]-(u:EvidenceUnit)-[:PRODUCES]->(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(sc:Claim {name: $proposition})
       OPTIONAL MATCH (e)-[:CHALLENGES]->(cc:Claim {name: $proposition})
       RETURN e, sc, cc`,
      {
        e: vertexProps<{ natural_id: string }>(),
        sc: optional(vertexProps<{ name: string }>()),
        cc: optional(vertexProps<{ name: string }>()),
      },
      { analysis: analysis.id, proposition },
    );
    return rows.find((r) => r.sc !== null || r.cc !== null)?.e.natural_id;
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
      // Only the challenging bearing is fetched. An earlier version also
      // returned the supporting claim as `forClaim` and never read it: polarity
      // is "no" when something challenges and "yes" otherwise, so the
      // supporting side is the default rather than an input. Dead the same way
      // PJ-007's `buildAsClause` branch was -- and silently broken besides,
      // since a camelCase column decodes as null (see `buildAsClause`, which
      // now refuses the name that hid this).
      `MATCH (:Decision {natural_id: $id})-[:BASED_ON]->(e:Evidence)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(against:Claim)
       RETURN e, against`,
      {
        e: vertexProps<{ statement: string }>(),
        against: optional(vertexProps<{ name: string }>()),
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

  /**
   * Findings bearing on a proposition one way or the other.
   *
   * `bearing` is interpolated because pglite-age rejects edge-type
   * alternation outright — `[:SUPPORTS|CHALLENGES]` is a syntax error, not
   * merely unsupported for variable-length patterns. The value comes from a
   * closed set of literals here, never from a caller.
   */
  private async findingsBearing(scope: { proposition: string; enquiry?: string }, bearing: "SUPPORTS" | "CHALLENGES") {
    return this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:${bearing}]-(e:Evidence)
       MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
       ${this.withinScope(scope)}
       MATCH (u)-[:USES]->(comp:Computation)
       OPTIONAL MATCH (e)-[:RECORDED_IN]->(a:Artefact)
       OPTIONAL MATCH (r:Review)-[:EVALUATES]->(u)
       RETURN e, comp, a, r`,
      {
        e: vertexProps<EvidenceProps & { natural_id: string }>(),
        comp: vertexProps<ComputationProps>(),
        a: optional(vertexProps<ArtefactProps>()),
        r: optional(vertexProps<{ verdict: string }>()),
      },
      { name: scope.proposition, ...(scope.enquiry ? { enquiry: scope.enquiry } : {}) },
    );
  }

  /**
   * Restricts a claim traversal to one line of enquiry, when the caller named
   * one. Empty when they did not — a sentence asserted in a single scope needs
   * no qualifier, and every scenario before S-5 relies on that.
   */
  private withinScope(scope: { enquiry?: string }): string {
    return scope.enquiry ? `MATCH (u)-[:ADDRESSES]->(:LineOfEnquiry {natural_id: $enquiry})` : "";
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
  async planWork(input: {
    objective: string;
    acceptance: string;
    /**
     * What this work is permitted to read. Closed-world — see `TaskContract`.
     *
     * Earned by S-8, and the first walk of `TaskProps.inputs`, which
     * `planWork()` had hardcoded to `""` since it was written. Stored as JSON
     * rather than a delimited string so an entry containing punctuation cannot
     * silently split; if a scenario ever needs to query *by element*, that is
     * when it becomes a real list property rather than a serialised one.
     */
    mayRead?: string[];
  }): Promise<WorkRef> {
    const task = await this.graph.createNode("Task", {
      objective: input.objective,
      inputs: JSON.stringify(input.mayRead ?? []),
      outputs: "",
      acceptance: input.acceptance,
      is_open: true,
    });
    this.emit("planWork", task.natural_id, { objective: input.objective });
    return { kind: "work", id: task.natural_id };
  }

  /** What a planned task is permitted to touch, and whether anyone is enforcing it. */
  async contractFor(work: WorkRef): Promise<TaskContract> {
    const rows = await this.graph.query(
      `MATCH (t:Task {natural_id: $id}) RETURN t`,
      { t: vertexProps<{ objective: string; acceptance: string; inputs: string }>() },
      { id: work.id },
    );
    const task = rows[0]?.t;
    if (!task) throw new Error(`no planned work ${work.id}`);

    let mayRead: string[] = [];
    try {
      const parsed: unknown = JSON.parse(task.inputs || "[]");
      if (Array.isArray(parsed)) mayRead = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      // Work planned before contracts existed carries free text here. An
      // unparseable contract is an empty one, not a crash.
    }
    return { objective: task.objective, acceptance: task.acceptance, mayRead, enforced: false };
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
    // And a gate protecting nothing is not a gate either. Before S-3b there
    // was no way to record a check that qualifies a finding without minting
    // one: `gateStatus()` then answered "what is blocked?" with `blocked` and
    // an empty `gating` list -- a control-plane object asserting a consequence
    // for work that does not exist. `recordAnalysis({ heldTo })` is how a
    // standard with nothing downstream is recorded now.
    if (input.protecting.length === 0) throw new Error("a gate protecting nothing is not a gate");
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
   * A verdict is reached either *for a gate* or *about a finding held to the
   * criterion*, and one of the two must be true. Named a gate, the criterion
   * must already govern it: otherwise the evaluation attaches to an unrelated
   * gate and `gateStatus()` mostly *hides* the result — its traversal starts
   * from `GOVERNS`, so the malformed evaluation sits in the graph as durable
   * nonsense without producing a visibly wrong report. Named no gate, the
   * criterion must already qualify something (`recordAnalysis({ heldTo })`),
   * for the same reason: an evaluation no reader can reach still looks like a
   * check that was performed.
   *
   * Same invariant class as `assertReviewOf`, and both are checked before
   * anything is written so a rejected command leaves no partial state.
   */
  async evaluateCriterion(input: {
    criterion: CriterionRef;
    /**
     * The gate this verdict is being reached for, if it is being reached for
     * one. Omitted when the condition qualifies a finding and gates no work —
     * S-3b, where requiring a gate forced the caller to mint one that
     * protected nothing.
     */
    gate?: GateRef;
    value: string;
    outcome: "pass" | "fail";
    /** The finding this verdict was reached against, if it was reached against one. */
    citing?: ConclusionRef;
  }): Promise<void> {
    if (input.gate) await this.assertCriterionGovernsGate(input.criterion, input.gate);
    // Same invariant class as `assertCriterionGovernsGate`, for the other job
    // a criterion can do: an evaluation that neither triggers a gate nor bears
    // on a finding held to it is durable nonsense no reader would ever surface.
    else await this.assertCriterionQualifiesSomething(input.criterion);
    let basis: string | undefined;
    if (input.citing) {
      basis = await this.findingFor(input.citing.analysis, input.citing.proposition);
      if (!basis) {
        throw new Error(`analysis ${input.citing.analysis.id} concluded nothing about "${input.citing.proposition}"`);
      }
    }
    const at = this.clock.now();
    const evaluation = await this.graph.createNode("CriterionEvaluation", {
      value: input.value,
      outcome: input.outcome,
      evaluated_at: at,
    });
    await this.graph.createEdge(input.criterion.id, "EVALUATED_AS", evaluation.natural_id);
    if (input.gate) await this.graph.createEdge(evaluation.natural_id, "TRIGGERS", input.gate.id);
    // What the verdict was reached against. `BASED_ON: CriterionEvaluation ->
    // Evidence` was declared in PJ-004 and never written until S-8; without
    // it, a condition established by measurement and one asserted by an agent
    // returned identical records. See PJ-008 row W.
    if (basis) await this.graph.createEdge(evaluation.natural_id, "BASED_ON", basis);
    this.emit("evaluateCriterion", evaluation.natural_id, {
      criterion: input.criterion.id,
      ...(input.gate ? { gate: input.gate.id } : {}),
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
   * Records that a historical result was re-checked, without claiming its run
   * was reproduced (S-10).
   *
   * `recordAnalysis` plus one edge, and the edge is the whole point: recorded
   * as an ordinary analysis the re-run becomes a second finding behind the same
   * claim, and the record then says a proposition established once rests on two
   * independent results. See `EDGE_SCHEMA.REVERIFIES`.
   *
   * `under` is what the *new* run consumed. It is normally non-empty precisely
   * because the historical run's inputs were never recorded — that asymmetry is
   * the situation, not an error, and `reproductionOf()` reads it back as
   * `unrecorded-in-the-original` rather than as a difference.
   *
   * One event, not two: a researcher who re-verified a result did one thing.
   */
  async reverify(input: {
    historical: AnalysisRef;
    enquiry: EnquiryRef;
    method: string;
    under: ObservationsRef[];
    concludes: Conclusion;
  }): Promise<VerificationReport> {
    const at = this.clock.now();
    const original = await this.findingFor(input.historical, input.concludes.proposition);
    if (!original) {
      throw new Error(
        `analysis ${input.historical.id} concluded nothing about "${input.concludes.proposition}"; there is nothing to re-verify`,
      );
    }

    const verification = await this.recordAnalysis({
      enquiry: input.enquiry,
      method: input.method,
      from: input.under,
      concludes: [input.concludes],
    });
    const restated = await this.findingFor(verification, input.concludes.proposition);
    if (!restated) throw new Error("unreachable: the analysis just recorded this conclusion");
    await this.graph.createEdge(restated, "REVERIFIES", original);

    this.emit("reverify", verification.id, { of: input.historical.id, proposition: input.concludes.proposition });
    return { at, verification, of: input.historical };
  }

  /**
   * What a re-run did and did not establish (S-10).
   *
   * The execution verdict is derived from what each run recorded consuming, not
   * from a stored flag: two runs are a reproduction when they read the same
   * recorded inputs. Structure in the query rather than in the stored model, so
   * there is no value anyone can set to "reproduced".
   */
  async reproductionOf(verification: AnalysisRef): Promise<ReproductionReport> {
    const link = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:PRODUCES]->(new:Evidence)
       MATCH (new)-[:REVERIFIES]->(old:Evidence)<-[:PRODUCES]-(:EvidenceUnit)-[:USES]->(oldcomp:Computation)
       RETURN new, old, oldcomp`,
      {
        new: vertexProps<{ natural_id: string }>(),
        old: vertexProps<{ natural_id: string }>(),
        oldcomp: vertexProps<{ natural_id: string; kind: string }>(),
      },
      { id: verification.id },
    );
    const found = link[0];
    if (!found) throw new Error(`analysis ${verification.id} re-verifies nothing`);

    const method = await this.graph.query(
      `MATCH (c:Computation {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ kind: string }>() },
      { id: verification.id },
    );

    const inputs = async (computation: string): Promise<string[]> => {
      const rows = await this.graph.query(
        `MATCH (:Computation {natural_id: $id})-[:CONSUMES]->(a:Artefact) RETURN a`,
        { a: vertexProps<{ logical_name: string }>() },
        { id: computation },
      );
      return rows.map((r) => r.a.logical_name).sort();
    };
    const mine = await inputs(verification.id);
    const theirs = await inputs(found.oldcomp.natural_id);

    // Absence and difference are not the same answer. The original recording
    // nothing means the two are neither known to agree nor known to differ,
    // which is why this is not simply a set difference.
    const differs: ReproductionReport["differs"] =
      theirs.length === 0
        ? mine.map((what) => ({ what, standing: "unrecorded-in-the-original" as const }))
        : mine.filter((what) => !theirs.includes(what)).map((what) => ({ what, standing: "changed" as const }));

    const reproduced = differs.length === 0 && mine.length === theirs.length;

    // Which way the re-run cuts, read from the bearing the restated finding was
    // recorded with -- never from comparing the two findings' wording.
    const bearing = await this.graph.query(
      `MATCH (:Evidence {natural_id: $id})-[:CHALLENGES]->(:Claim) RETURN 1`,
      { ok: scalar<number>() },
      { id: found.new.natural_id },
    );
    const agrees = bearing.length === 0;

    return {
      verification: method[0]?.c.kind ?? "unknown",
      of: found.oldcomp.kind,
      conclusion: agrees ? "agrees" : "disagrees",
      execution: reproduced ? "reproduced" : "not-reproduced",
      differs,
      bearing: agrees ? "raises" : "lowers",
      // Agreement between two different executions is not confirmation of
      // either, however well the numbers line up.
      confirms: reproduced && agrees,
      comparable: reproduced,
      ...(reproduced
        ? {}
        : {
            incomparableBecause:
              theirs.length === 0
                ? "the original run's initial conditions were never recorded, so the two runs' numbers describe different executions"
                : "the two runs consumed different inputs",
          }),
    };
  }

  /**
   * S-17/S-3: may this gate be relied on, and on what evidence?
   *
   * Every governing condition is itemised, including the ones nobody has
   * evaluated. That is the point: S-3 requires a failed check to be
   * distinguishable from a check never run, and an absent list entry cannot
   * carry that difference.
   */
  /**
   * Amends a locked design: replaces one condition with another, recording the
   * act rather than editing the setting.
   *
   * This is the `Decision` S-11 declined to mint. There, "we replaced X
   * because of review Y" pointed causality backwards and no assertion used it.
   * Here the decision is the whole point: the original setting has to stay
   * readable, the reason and its evidence have to survive, and one amendment
   * has to be orderable against another.
   *
   * The diagnosis is cited **specifically**, not snapshotted. `sharpen()`
   * freezes everything standing because a sharpening genuinely is taken in
   * light of everything known; an amendment is taken on one diagnosis, and
   * recording every finding on the record as its basis would manufacture a
   * rationale the researcher never had. See PJ-008 row AA — the same edge now
   * carries both senses, deliberately and with the boundary written down.
   *
   * `SUPERSEDES` chains this amendment to the previous one on the same design,
   * found rather than supplied: an ordering that depends on the caller
   * remembering to pass the right handle is not an ordering.
   */
  async amendDesign(input: {
    criterion: CriterionRef;
    nowRequires: string;
    because: string;
    citing: ConclusionRef;
  }): Promise<AmendmentReport> {
    const at = this.clock.now();

    // Everything validated before anything is written -- a rejected amendment
    // must not leave a decision recording a change that never happened.
    const existing = await this.graph.query(
      `MATCH (c:Criterion {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ proposition: string }>() },
      { id: input.criterion.id },
    );
    const replaced = existing[0]?.c.proposition;
    if (!replaced) throw new Error(`no condition ${input.criterion.id} to amend`);

    const diagnosis = await this.findingFor(input.citing.analysis, input.citing.proposition);
    if (!diagnosis) {
      throw new Error(`analysis ${input.citing.analysis.id} concluded nothing about "${input.citing.proposition}"`);
    }

    const gates = await this.gatesGovernedBy(input.criterion.id);
    if (gates.length === 0) {
      throw new Error(`condition ${input.criterion.id} governs nothing; there is no locked design to amend`);
    }

    // Amending a setting that has already been amended forks the design, and
    // the fork is not readable: two conditions end up in force at once and
    // `designHistory()` can no longer say what the design requires. Rejected
    // at the write rather than thrown at the read -- state that cannot be read
    // back is worse than a command that refuses.
    const alreadyAmended = await this.graph.query(
      `MATCH (:Decision)-[:CHANGES]->(c:Criterion {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ natural_id: string }>() },
      { id: input.criterion.id },
    );
    if (alreadyAmended.length > 0) {
      throw new Error(`condition ${input.criterion.id} has already been amended; amend the one now in force`);
    }

    const prior = await this.latestAmendmentOn(gates);

    const replacement = await this.graph.createNode("Criterion", { proposition: input.nowRequires });
    for (const gate of gates) await this.graph.createEdge(replacement.natural_id, "GOVERNS", gate);

    const decision = await this.graph.createNode("Decision", {
      reason: input.because,
      invalidation_check: "evidence that the amended setting was not the constraint after all",
    });
    await this.graph.createEdge(decision.natural_id, "CHANGES", input.criterion.id);
    await this.graph.createEdge(decision.natural_id, "BASED_ON", diagnosis);
    if (prior) await this.graph.createEdge(decision.natural_id, "SUPERSEDES", prior);

    const rerun = await this.workGatedBy(gates);
    const confirmatoryAffected = await this.confirmatoryResultsBehind(gates);

    this.emit("amendDesign", decision.natural_id, {
      criterion: input.criterion.id,
      replaced,
      nowRequires: input.nowRequires,
      supersedes: prior ?? null,
    });

    return {
      at,
      amendment: decision.natural_id,
      replaced,
      nowRequires: input.nowRequires,
      rerun,
      confirmatoryAffected,
      // Derived, never declared. An amendment is scientific exactly when
      // something the confirmatory boundary rests on is in its blast radius --
      // which is the difference between repairing a solver and moving the
      // goalposts, and is not a thing the person amending gets to assert.
      nature: confirmatoryAffected.length > 0 ? "scientific" : "mechanical",
    };
  }

  /**
   * A locked design and everything that has happened to it, oldest first.
   *
   * The order comes from the supersession chain alone — no decision carries a
   * timestamp, nothing is read from the event log, and natural-id allocation
   * order is never consulted. What that does *not* order is two amendments to
   * different designs; see PJ-008 row Z.
   */
  async designHistory(gate: GateRef): Promise<DesignHistory> {
    const conditions = await this.graph.query(
      `MATCH (c:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id})
       OPTIONAL MATCH (d:Decision)-[:CHANGES]->(c)
       RETURN c, d`,
      {
        c: vertexProps<{ natural_id: string; proposition: string }>(),
        d: optional(vertexProps<{ natural_id: string }>()),
      },
      { id: gate.id },
    );
    if (conditions.length === 0) throw new Error(`gate ${gate.id} is governed by no condition`);

    const changedBy = new Map<string, string>(); // decision -> criterion it replaced
    const propositionOf = new Map<string, string>();
    const current: string[] = [];
    for (const row of conditions) {
      propositionOf.set(row.c.natural_id, row.c.proposition);
      if (row.d) changedBy.set(row.d.natural_id, row.c.natural_id);
      else current.push(row.c.natural_id);
    }

    // A design history needs one condition in force. A gate governed by
    // several unamended conditions is a different shape -- see S-3 -- and
    // guessing which one is "the design" would be a confidently wrong answer.
    const inForce = [...new Set(current)];
    if (inForce.length !== 1) {
      throw new Error(`gate ${gate.id} has ${inForce.length} conditions in force; a design history needs exactly one`);
    }

    const chain = await this.amendmentChain(gate.id);
    const rerun = await this.workGatedBy([gate.id]);
    const confirmatory = await this.confirmatoryResultsBehind([gate.id]);
    const nature = confirmatory.length > 0 ? ("scientific" as const) : ("mechanical" as const);

    const amendments: AmendmentRecord[] = chain.map((step, i) => {
      const wasCriterion = changedBy.get(step.decision);
      const nextCriterion = i + 1 < chain.length ? changedBy.get(chain[i + 1]!.decision) : inForce[0];
      return {
        amendment: step.decision,
        replaced: (wasCriterion && propositionOf.get(wasCriterion)) ?? "",
        nowRequires: (nextCriterion && propositionOf.get(nextCriterion)) ?? "",
        reason: step.reason,
        citing: step.citing,
        rerun,
        nature,
      };
    });

    const firstReplaced = amendments[0]?.replaced;
    return {
      gate: gate.id,
      originally: firstReplaced ?? propositionOf.get(inForce[0]!)!,
      nowRequires: propositionOf.get(inForce[0]!)!,
      criterion: { kind: "criterion", id: inForce[0]! },
      amendments,
    };
  }

  /** Amendments to one design, ordered oldest-first by following supersession back to its root. */
  private async amendmentChain(gateId: string): Promise<Array<{ decision: string; reason: string; citing: string[] }>> {
    const rows = await this.graph.query(
      `MATCH (d:Decision)-[:CHANGES]->(:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id})
       OPTIONAL MATCH (d)-[:SUPERSEDES]->(older:Decision)
       OPTIONAL MATCH (d)-[:BASED_ON]->(e:Evidence)
       RETURN d, older, e`,
      {
        d: vertexProps<{ natural_id: string; reason: string }>(),
        older: optional(vertexProps<{ natural_id: string }>()),
        e: optional(vertexProps<{ statement: string }>()),
      },
      { id: gateId },
    );

    const nodes = new Map<string, { reason: string; older: string | null; citing: Set<string> }>();
    for (const row of rows) {
      const node = nodes.get(row.d.natural_id) ?? { reason: row.d.reason, older: null, citing: new Set<string>() };
      if (row.older) node.older = row.older.natural_id;
      if (row.e) node.citing.add(row.e.statement);
      nodes.set(row.d.natural_id, node);
    }

    const followedBy = new Map<string, string>();
    let root: string | undefined;
    for (const [id, node] of nodes) {
      if (node.older === null) root = id;
      else followedBy.set(node.older, id);
    }

    const ordered: Array<{ decision: string; reason: string; citing: string[] }> = [];
    let cursor = root;
    while (cursor) {
      const node = nodes.get(cursor)!;
      ordered.push({ decision: cursor, reason: node.reason, citing: [...node.citing].sort() });
      cursor = followedBy.get(cursor);
    }

    // Every amendment must appear. A second chain root, or a break partway,
    // would otherwise drop amendments out of the history with no error at all
    // -- and an audit trail that quietly omits an entry is worse than one that
    // refuses to render.
    if (ordered.length !== nodes.size) {
      throw new Error(
        `gate ${gateId} has ${nodes.size} amendments but only ${ordered.length} form a chain; its history is not a single line`,
      );
    }
    return ordered;
  }

  private async gatesGovernedBy(criterionId: string): Promise<string[]> {
    const rows = await this.graph.query(
      `MATCH (:Criterion {natural_id: $id})-[:GOVERNS]->(g:Gate) RETURN g`,
      { g: vertexProps<{ natural_id: string }>() },
      { id: criterionId },
    );
    return [...new Set(rows.map((r) => r.g.natural_id))];
  }

  /** The most recent amendment to this design — the one nothing has superseded yet. */
  private async latestAmendmentOn(gates: string[]): Promise<string | undefined> {
    for (const gate of gates) {
      const rows = await this.graph.query(
        `MATCH (d:Decision)-[:CHANGES]->(:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id})
         OPTIONAL MATCH (newer:Decision)-[:SUPERSEDES]->(d)
         RETURN d, newer`,
        {
          d: vertexProps<{ natural_id: string }>(),
          newer: optional(vertexProps<{ natural_id: string }>()),
        },
        { id: gate },
      );
      const superseded = new Set(rows.filter((r) => r.newer).map((r) => r.d.natural_id));
      const latest = rows.map((r) => r.d.natural_id).find((d) => !superseded.has(d));
      if (latest) return latest;
    }
    return undefined;
  }

  /** Work these gates protect, and which therefore has to be run again when their condition changes. */
  private async workGatedBy(gates: string[]): Promise<string[]> {
    const objectives = new Set<string>();
    for (const gate of gates) {
      const rows = await this.graph.query(
        `MATCH (:Gate {natural_id: $id})-[:GATES]->(t:Task) RETURN t`,
        { t: vertexProps<{ objective: string }>() },
        { id: gate },
      );
      for (const row of rows) objectives.add(row.t.objective);
    }
    return [...objectives].sort();
  }

  /**
   * Confirmatory results standing behind these gates.
   *
   * Reaches the *results*, not just the work: gate -> work -> the unit that
   * carried it out -> what that unit concluded. Without the last two hops this
   * could only report "no confirmatory result affected" by virtue of seeing no
   * results at all, which is the same answer a genuinely clean amendment
   * gives — see S-4 on absence of evidence reading as a negative.
   */
  private async confirmatoryResultsBehind(gates: string[]): Promise<string[]> {
    const affected = new Set<string>();
    for (const gate of gates) {
      for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
        const rows = await this.graph.query(
          `MATCH (:Gate {natural_id: $id})-[:GATES]->(:Task)-[:IMPLEMENTS]->(u:EvidenceUnit)
           MATCH (u)-[:PRODUCES]->(e:Evidence)-[:${bearing}]->(c:Claim)
           RETURN c`,
          { c: vertexProps<{ name: string; kind?: string }>() },
          { id: gate },
        );
        for (const row of rows) if (row.c.kind === "confirmatory") affected.add(row.c.name);
      }
    }
    return [...affected].sort();
  }

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
       OPTIONAL MATCH (ev)-[:BASED_ON]->(basis:Evidence)
       OPTIONAL MATCH (basis)-[:RECORDED_IN]->(basisout:Artefact)
       RETURN c, ev, basis, basisout`,
      {
        c: vertexProps<{ natural_id: string; proposition: string }>(),
        ev: optional(
          vertexProps<{ natural_id: string; value: string; outcome: "pass" | "fail"; evaluated_at: string }>(),
        ),
        basis: optional(vertexProps<{ statement: string }>()),
        basisout: optional(vertexProps<{ invalidated?: boolean }>()),
      },
      { id: gate.id },
    );

    const checks = this.checksFrom(rows);
    // Flattened in the same order the checks were assembled in.
    const evaluations = checks.flatMap((c) => c.evaluations);
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

  /**
   * Groups (criterion, evaluation, basis) rows into itemised checks.
   *
   * Shared by the two jobs a criterion does, which S-3 fused and S-3b took
   * apart: gating work (`gateStatus`) and qualifying a finding
   * (`whySupported`). The traversals that reach the criteria differ; how a
   * check is reported must not, or the same condition would read one way
   * through a gate and another through the finding it qualifies.
   */
  private checksFrom(
    rows: Array<{
      c: { natural_id: string; proposition: string };
      ev: { natural_id: string; value: string; outcome: "pass" | "fail"; evaluated_at: string } | null;
      basis: { statement: string } | null;
      /**
       * The artefact the cited finding was recorded in, carrying whether that
       * analysis has since been replaced.
       *
       * Lower-case deliberately, and enforced: `basisOut` here returns present
       * and NULL for every row, silently, because the AS clause AGE requires
       * is unquoted SQL and Postgres folds it. See `buildAsClause`.
       */
      basisout: { invalidated?: boolean } | null;
    }>,
  ): CheckStatus[] {
      // Keyed by natural id, not by proposition text. Two criteria worded
      // identically are two criteria; whether they SHOULD be one is an identity
      // question, and a read-side query must not settle it by string equality.
      // `standing` counts the cited findings that have NOT been withdrawn. It
      // is kept alongside `basis` rather than derived from it because `basis`
      // is display text, and two withdrawn findings can share a sentence.
      type TimedEvaluation = EvaluationRecord & { id: string; cited: number; standing: number };
      const byCriterion = new Map<string, { proposition: string; evaluations: TimedEvaluation[] }>();
      for (const row of rows) {
        const id = row.c.natural_id;
        const entry = byCriterion.get(id) ?? { proposition: row.c.proposition, evaluations: [] };
        if (row.ev) {
          // One row per (evaluation, basis) pair, so an evaluation citing several
          // findings arrives more than once. Accumulate rather than push.
          const seen = entry.evaluations.find((e) => e.id === row.ev!.natural_id);
          const record = seen ?? {
            id: row.ev.natural_id,
            value: row.ev.value,
            outcome: row.ev.outcome,
            at: row.ev.evaluated_at,
            basis: [] as string[],
            cited: 0,
            standing: 0,
          };
          if (row.basis) {
            if (!record.basis.includes(row.basis.statement)) record.basis.push(row.basis.statement);
            record.cited += 1;
            if (!row.basisout?.invalidated) record.standing += 1;
          }
          if (!seen) entry.evaluations.push(record);
        }
        byCriterion.set(id, entry);
      }

      /**
       * A verdict is withdrawn when everything it was reached against has
       * been. A verdict that cited nothing cannot be withdrawn at all — there
       * is nothing to retract — which is what keeps S-8's asserted-versus-
       * measured distinction (row W) from becoming a loophole.
       */
      const isWithdrawn = (e: TimedEvaluation): boolean => e.cited > 0 && e.standing === 0;

      const strip = (e: TimedEvaluation): EvaluationRecord => ({
        value: e.value,
        outcome: e.outcome,
        at: e.at,
        basis: [...e.basis].sort(),
        // Present only when true, so a record that stands is byte-identical to
        // what it was before this field existed.
        ...(isWithdrawn(e) ? { withdrawn: true as const } : {}),
      });

      const checks: CheckStatus[] = [];
      for (const [id, entry] of byCriterion) {
        // Cypher imposes no ordering, so sort explicitly: by time, then by
        // identity. Without this, which evaluation gets reported as "the" value
        // of a check is not a stable contract between runs.
        const ordered = entry.evaluations.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

        // A failure sticks -- among verdicts that still stand. One failing
        // evaluation is decisive even if a later run passed, so re-running
        // until green is not evidence (S-3, and the case that earned this).
        //
        // S-3c narrowed it, and only here: a verdict whose entire basis has
        // been reviewed and withdrawn is not a failure that stands, it is a
        // failure that was retracted. Before this the two were the same state,
        // so a check found to be defective, corrected and re-run went on
        // disqualifying the finding and blocking the work for ever -- the same
        // answer as re-rolling the dice, which is the one thing S-3 set out to
        // prevent. Ledger row X.
        //
        // What did NOT change: the withdrawn verdict stays in `evaluations`,
        // marked. Erasing it would leave no record of why the finding was ever
        // in doubt, and re-running a check that nobody faulted still cannot
        // clear it, because nothing withdraws it.
        const standing = ordered.filter((e) => !isWithdrawn(e));
        const decisive = standing.find((e) => e.outcome === "fail") ?? standing[0];
        checks.push({
          criterion: id,
          proposition: entry.proposition,
          state: decisive === undefined ? "never-run" : decisive.outcome === "fail" ? "failed" : "passed",
          evaluations: ordered.map(strip),
          ...(decisive ? { decidedBy: strip(decisive) } : {}),
        });
      }

    return checks;
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
      replacement,
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

  /**
   * Narrows an interpretation without touching anything it was inferred from.
   *
   * The computations, artefacts, observations and findings all stay exactly as
   * they were — this verb exists precisely because `replaceAnalysis` cannot
   * express that, its whole mechanism being invalidation of the output. Here
   * the numbers were right and only the sentence about them was wrong.
   */
  async reinterpret(input: {
    /**
     * Which claim. A bare proposition while the sentence is asserted once;
     * naming the analysis that concluded it when it is not — S-5, where
     * withdrawing by wording alone retracted an unrelated line of work.
     */
    of: ClaimSubject;
    as: string;
    because: string;
  }): Promise<ReinterpretationReport> {
    const at = this.clock.now();

    const scope = await this.scopeFor(input.of);
    const claims = await this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       ${this.withinScope(scope)}
       RETURN c`,
      { c: vertexProps<{ natural_id: string }>() },
      { name: scope.proposition, ...(scope.enquiry ? { enquiry: scope.enquiry } : {}) },
    );
    if (claims.length === 0) throw new Error(`nothing on the record claims "${scope.proposition}"`);

    const review = await this.graph.createNode("Review", { verdict: input.because });
    const narrower = await this.graph.createNode("Claim", { name: input.as, kind: "exploratory" });
    // The review records that someone objected; the decision records that the
    // objection was acted on. Reviews also confirm, so a review alone cannot
    // mean "withdrawn" without reading its prose.
    const decision = await this.graph.createNode("Decision", {
      reason: input.because,
      invalidation_check: "evidence that the original reading was right after all",
    });
    await this.graph.createEdge(decision.natural_id, "MOTIVATES", narrower.natural_id);

    const carried = new Set<string>();
    for (const id of new Set(claims.map((c) => c.c.natural_id))) {
      const claim = { c: { natural_id: id } };
      await this.graph.createEdge(review.natural_id, "EVALUATES", claim.c.natural_id);
      await this.graph.createEdge(decision.natural_id, "CHANGES", claim.c.natural_id);
      const evidence = await this.graph.query(
        `MATCH (e:Evidence)-[:SUPPORTS]->(:Claim {natural_id: $id}) RETURN e`,
        { e: vertexProps<{ natural_id: string; statement: string }>() },
        { id: claim.c.natural_id },
      );
      for (const row of evidence) {
        await this.graph.createEdge(row.e.natural_id, "SUPPORTS", narrower.natural_id);
        carried.add(row.e.statement);
      }
    }

    const restingOnTheOldReading = await this.decidedOnTheStrengthOf(scope);

    this.emit("reinterpret", narrower.natural_id, { previously: scope.proposition, because: input.because });

    return {
      at,
      previously: scope.proposition,
      nowClaims: input.as,
      evidenceStanding: [...carried].sort(),
      restingOnTheOldReading,
      requiresRecomputation: false,
    };
  }

  /**
   * An interpretation and every narrowing behind it, oldest first.
   *
   * The chain walks claim-to-claim through the decisions that made it: each
   * revision `CHANGES` the reading it withdrew and `MOTIVATES` the one that
   * replaced it. No timestamps, nothing from the event log, and — unlike
   * `designHistory` — no `SUPERSEDES` edge, because with both halves of each
   * step recorded the order is already implied and a supersession edge would
   * be a writer with no reader.
   */
  async interpretationHistory(proposition: string): Promise<InterpretationHistory> {
    const steps: Revision[] = [];
    let current = proposition;

    // Walk backwards from the current reading. Bounded by the number of
    // revisions actually recorded, so a cycle cannot spin.
    const seen = new Set<string>([current]);
    for (;;) {
      const rows = await this.graph.query(
        `MATCH (d:Decision)-[:MOTIVATES]->(:Claim {name: $name})
         MATCH (d)-[:CHANGES]->(was:Claim)
         RETURN d, was`,
        {
          d: vertexProps<{ natural_id: string; reason: string }>(),
          was: vertexProps<{ name: string }>(),
        },
        { name: current },
      );
      // One line only. Two decisions narrowing different readings to the same
      // sentence would otherwise send the walk down whichever row came back
      // first -- the arbitrary-rows[0] shape S-1 turned into a wrong answer.
      // Several *rows* per decision are normal and not a fork: one decision
      // withdraws every node asserting the sentence it replaced.
      const decisions = new Set(rows.map((r) => r.d.natural_id));
      const replaced = new Set(rows.map((r) => r.was.name));
      if (decisions.size > 1 || replaced.size > 1) {
        throw new Error(`interpretation history for "${proposition}" is not a single line at "${current}"`);
      }
      const step = rows[0];
      if (!step) break;
      if (seen.has(step.was.name)) throw new Error(`interpretation history for "${proposition}" loops at "${step.was.name}"`);
      seen.add(step.was.name);

      steps.unshift({
        revision: step.d.natural_id,
        previously: step.was.name,
        nowClaims: current,
        reason: step.d.reason,
        restingOnTheOldReading: await this.decidedOnTheStrengthOf({ proposition: step.was.name }),
      });
      current = step.was.name;
    }

    return {
      originally: steps[0]?.previously ?? proposition,
      nowClaims: proposition,
      revisions: steps,
    };
  }

  /** Whether the record has stopped asserting a proposition, and what replaced it. */
  private async withdrawalOf(scope: { proposition: string; enquiry?: string }): Promise<{ withdrawn: boolean; replacedBy?: string }> {
    const rows = await this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       ${this.withinScope(scope)}
       OPTIONAL MATCH (d:Decision)-[:CHANGES]->(c)
       OPTIONAL MATCH (d)-[:MOTIVATES]->(now:Claim)
       RETURN c, d, now`,
      {
        c: vertexProps<{ natural_id: string }>(),
        d: optional(vertexProps<{ natural_id: string }>()),
        now: optional(vertexProps<{ name: string }>()),
      },
      { name: scope.proposition, ...(scope.enquiry ? { enquiry: scope.enquiry } : {}) },
    );
    if (rows.length === 0) return { withdrawn: false };

    // Every node asserting this proposition must have been withdrawn. One left
    // standing means the record still claims it -- which is exactly the
    // duplicate-claim case S-12 was built to catch.
    const standing = new Set(rows.filter((r) => !r.d).map((r) => r.c.natural_id));
    if (standing.size > 0) return { withdrawn: false };

    const replacedBy = rows.find((r) => r.now)?.now?.name;
    return { withdrawn: true, ...(replacedBy ? { replacedBy } : {}) };
  }

  /** Questions closed on the strength of a proposition — what a reinterpretation puts at risk. */
  private async decidedOnTheStrengthOf(scope: { proposition: string; enquiry?: string }): Promise<string[]> {
    const asked = new Set<string>();
    // Both bearings: a question can be settled "no" on a finding that
    // challenges the proposition, and that closure rests on this reading just
    // as much as a supporting one does.
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (d:Decision)-[:BASED_ON]->(e:Evidence)-[:${bearing}]->(:Claim {name: $name})
         MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
         ${this.withinScope(scope)}
         MATCH (d)-[:RESOLVES]->(q:Question)
         RETURN q`,
        { q: vertexProps<{ name: string }>() },
        { name: scope.proposition, ...(scope.enquiry ? { enquiry: scope.enquiry } : {}) },
      );
      for (const row of rows) asked.add(row.q.name);
    }
    return [...asked].sort();
  }

  /**
   * Works out which claim a caller meant.
   *
   * Proposition text identifies a claim only while a sentence is asserted in
   * one line of enquiry. S-5 is the case where it is asserted in two — the
   * same words about different endpoints — and there text identifies nothing.
   * Rather than picking one, this refuses and says how many there are. The
   * wrong answer available here is not "no result": before this existed,
   * `whySupported()` merged both into a single claim that was simultaneously
   * supported and challenged, and `reinterpret()` withdrew an unrelated line
   * of work's claim with no decision saying so.
   *
   * Scope is the line of enquiry, reached by traversal. Nothing is stored on
   * the claim — see PJ-008 row C.
   */
  private async scopeFor(subject: ClaimSubject): Promise<{ proposition: string; enquiry?: string }> {
    if (typeof subject !== "string") {
      // A citation has to be one the cited analysis actually made. Without
      // this, naming a proposition it never concluded still resolves to its
      // line of enquiry, and the answer comes back about whatever *other*
      // analysis in that scope said -- so `reinterpret()` would withdraw a
      // claim the cited analysis never asserted. Same check `closeEnquiry()`
      // and `amendDesign()` already make of their citations.
      const concluded = await this.findingFor(subject.analysis, subject.proposition);
      if (!concluded) {
        throw new Error(`analysis ${subject.analysis.id} concluded nothing about "${subject.proposition}"`);
      }
      const enquiry = await this.enquiryAddressedBy(subject.analysis);
      if (!enquiry) throw new Error(`analysis ${subject.analysis.id} addresses no line of enquiry`);
      return { proposition: subject.proposition, enquiry };
    }

    const scopes = await this.enquiriesClaiming(subject);
    if (scopes.length > 1) {
      throw new Error(`"${subject}" is claimed in ${scopes.length} lines of enquiry; name which, by the analysis that concluded it`);
    }
    return { proposition: subject };
  }

  /** Lines of enquiry in which some claim of this wording is asserted. */
  private async enquiriesClaiming(proposition: string): Promise<string[]> {
    const found = new Set<string>();
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (:Claim {name: $name})<-[:${bearing}]-(e:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
         MATCH (u)-[:ADDRESSES]->(loe:LineOfEnquiry)
         RETURN loe`,
        { loe: vertexProps<{ natural_id: string }>() },
        { name: proposition },
      );
      for (const row of rows) found.add(row.loe.natural_id);
    }
    return [...found];
  }

  private async enquiryAddressedBy(analysis: AnalysisRef): Promise<string | undefined> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:ADDRESSES]->(loe:LineOfEnquiry) RETURN loe`,
      { loe: vertexProps<{ natural_id: string }>() },
      { id: analysis.id },
    );
    return rows[0]?.loe.natural_id;
  }

  /**
   * Whether two findings actually conflict.
   *
   * Answered from what each claim is attached to — the question it answers and
   * the way its evidence bears — never from comparing the two sentences. In
   * S-5 the sentences are identical and the answer is "no".
   */
  async doTheseConflict(a: ConclusionRef, b: ConclusionRef): Promise<ConflictVerdict> {
    const sides = [await this.sideOf(a), await this.sideOf(b)];
    const [left, right] = sides;

    const sameScope = left!.enquiry === right!.enquiry;
    if (!sameScope) {
      // Support for equivalence on one endpoint says nothing about another.
      // Identical wording does not make them one claim.
      return {
        conflict: false,
        relation: "dissociation",
        differsBy: "scope",
        sides: sides.map(({ enquiry: _enquiry, ...side }) => side),
      };
    }

    const opposed =
      (left!.supportedBy.length > 0 && right!.challengedBy.length > 0) ||
      (left!.challengedBy.length > 0 && right!.supportedBy.length > 0);

    return {
      conflict: opposed,
      relation: opposed ? "contradiction" : "corroboration",
      differsBy: null,
      sides: sides.map(({ enquiry: _enquiry, ...side }) => side),
    };
  }

  private async sideOf(conclusion: ConclusionRef): Promise<ConflictSide & { enquiry: string }> {
    const resolved = await this.scopeFor(conclusion);
    const enquiry = resolved.enquiry!;

    const asked = await this.graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $id}) RETURN q`,
      { q: vertexProps<{ name: string }>() },
      { id: enquiry },
    );

    const scope = resolved;
    const supportedBy = (await this.findingsBearing(scope, "SUPPORTS")).map((r) => r.e.statement);
    const challengedBy = (await this.findingsBearing(scope, "CHALLENGES")).map((r) => r.e.statement);

    return {
      proposition: conclusion.proposition,
      asks: asked[0]?.q.name ?? "",
      supportedBy: [...new Set(supportedBy)].sort(),
      challengedBy: [...new Set(challengedBy)].sort(),
      enquiry,
    };
  }

  /** "Why does this conclusion count as supported?" and "what did the superseded inference claim?" */
  async whySupported(subject: ClaimSubject): Promise<SupportExplanation> {
    const scope = await this.scopeFor(subject);
    const proposition = scope.proposition;
    // Both bearings, each partitioned by whether its analysis output was
    // later invalidated. A withdrawn challenge is as historical as a
    // withdrawn support -- before this, challenging findings counted as
    // current forever.
    const forRows = await this.findingsBearing(scope, "SUPPORTS");
    const againstRows = await this.findingsBearing(scope, "CHALLENGES");

    // Findings that re-checked another finding rather than establishing the
    // proposition themselves. Keyed by identity, never by wording -- two runs
    // reaching the same conclusion say the same sentence by construction.
    const reverifying = new Set(
      (
        await this.graph.query(
          `MATCH (e:Evidence)-[:REVERIFIES]->(:Evidence) RETURN e`,
          { e: vertexProps<{ natural_id: string }>() },
        )
      ).map((r) => r.e.natural_id),
    );

    const support: SupportExplanation["support"] = [];
    const reverifiedBy: string[] = [];
    const against: SupportExplanation["against"] = [];
    const superseded: SupportExplanation["superseded"] = [];
    for (const { rows, bearing, live } of [
      { rows: forRows, bearing: "supports" as const, live: support },
      { rows: againstRows, bearing: "challenges" as const, live: against },
    ]) {
      for (const row of rows) {
        const entry = { finding: row.e.statement, via: row.comp.kind };
        if (row.a?.invalidated) {
          superseded.push({ ...entry, bearing, reason: row.r?.verdict ?? "its analysis was replaced" });
        } else if (bearing === "supports" && reverifying.has(row.e.natural_id)) {
          // A re-verification is not a second independent finding. Counting it
          // as one reported a proposition established once as corroborated
          // twice -- S-10, and the reason `REVERIFIES` exists.
          if (!reverifiedBy.includes(row.comp.kind)) reverifiedBy.push(row.comp.kind);
        } else {
          live.push(entry);
        }
      }
    }

    // What the still-current analyses actually consumed -- one hop from the
    // computation, not a detour through the enquiry. Only currently-standing
    // findings count: a superseded analysis's inputs are not what the claim
    // rests on now.
    const resting = await this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(e:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       ${this.withinScope(scope)}
       MATCH (u)-[:USES]->(comp:Computation)
       MATCH (comp)-[:CONSUMES]->(a:Artefact)
       MATCH (e)-[:RECORDED_IN]->(out:Artefact)
       WHERE out.invalidated IS NULL OR out.invalidated = false
       RETURN a`,
      { a: vertexProps<ArtefactProps>() },
      { name: proposition, ...(scope.enquiry ? { enquiry: scope.enquiry } : {}) },
    );

    // The standard the finding was held to, if it was held to one. S-3b: the
    // criteria a researcher agreed before the run are what "does this stand?"
    // is answered against, and before `QUALIFIES` there was no path from a
    // claim to them at all -- so a finding whose own prespecified checks had
    // failed reported `supported: true`. See ledger row V.
    //
    // Same invalidation filter as `restingOn` above: a replaced analysis's
    // checks are as historical as its findings, and applying one filter and
    // not the other would make two fields of one answer disagree. Load-bearing,
    // not tidy -- see the superseded-analysis test in S-3b.
    //
    // Boundary: only the SUPPORTING analyses' standards are read. An analysis
    // recorded with `heldTo` whose findings CHALLENGE the proposition still
    // reads as a live challenge even if its own checks failed, so `challenged`
    // is not qualified the way `supported` now is. Nothing in the corpus holds
    // a challenging analysis to a prespecified standard; the scenario that
    // would settle it is a null result whose robustness checks disagree.
    const standardRows = await this.graph.query(
      `MATCH (:Claim {name: $name})<-[:SUPPORTS]-(e:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       ${this.withinScope(scope)}
       MATCH (e)-[:RECORDED_IN]->(out:Artefact)
       WHERE out.invalidated IS NULL OR out.invalidated = false
       MATCH (crit:Criterion)-[:QUALIFIES]->(u)
       OPTIONAL MATCH (crit)-[:EVALUATED_AS]->(ev:CriterionEvaluation)
       OPTIONAL MATCH (ev)-[:BASED_ON]->(basis:Evidence)
       OPTIONAL MATCH (basis)-[:RECORDED_IN]->(basisout:Artefact)
       RETURN crit AS c, ev, basis, basisout`,
      {
        c: vertexProps<{ natural_id: string; proposition: string }>(),
        ev: optional(
          vertexProps<{ natural_id: string; value: string; outcome: "pass" | "fail"; evaluated_at: string }>(),
        ),
        basis: optional(vertexProps<{ statement: string }>()),
        basisout: optional(vertexProps<{ invalidated?: boolean }>()),
      },
      { name: proposition, ...(scope.enquiry ? { enquiry: scope.enquiry } : {}) },
    );
    const standard = this.checksFrom(standardRows);
    // Never-run counts against, exactly as it does for a gate: a check nobody
    // performed has not been met. `gateStatus()` computes `unmet` the same way
    // and the two must agree, since in S-3 they are the same checks.
    const unmet = standard.filter((c) => c.state !== "passed").map((c) => c.proposition);

    // A withdrawn interpretation is not supported, however much evidence once
    // carried it. `support` stays populated deliberately: the findings are
    // fine and always were, and blanking them would say the numbers had gone
    // wrong -- which is the one thing S-12 exists to deny.
    const { withdrawn, replacedBy } = await this.withdrawalOf(scope);

    return {
      proposition,
      // Three ways to not be supported, and they are different states: no
      // evidence at all, the interpretation withdrawn, and -- since S-3b --
      // evidence that exists and fails the standard set for it. `support`
      // stays populated in the third case for the same reason it does in the
      // second: the numbers are fine, and blanking them would say otherwise.
      supported: support.length > 0 && !withdrawn && unmet.length === 0,
      support,
      reverifiedBy,
      standard,
      unmet,
      restingOn: [...new Set(resting.map((r) => r.a.logical_name))],
      superseded,
      challenged: against.length > 0,
      against,
      withdrawn,
      ...(replacedBy ? { replacedBy } : {}),
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
       OPTIONAL MATCH (e)-[:CHALLENGES]->(challenged:Claim)
       OPTIONAL MATCH (loe:LineOfEnquiry)-[:REQUIRES]->(e)
       RETURN claim, challenged, loe`,
      {
        claim: optional(vertexProps<ClaimProps>()),
        challenged: optional(vertexProps<ClaimProps>()),
        loe: optional(vertexProps<{ name: string }>()),
      },
      { name: artefactName },
    );
    return {
      // A claim whose refutation rested on this record is affected by
      // invalidating it, exactly as a supported one is.
      claims: [...new Set(rows.flatMap((r) => [r.claim?.name, r.challenged?.name].filter((n): n is string => !!n)))],
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
      // Either bearing: an analysis whose findings all CHALLENGE returned no
      // conclusions at all, so replacing one reported nothing as affected.
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(u:EvidenceUnit)-[:PRODUCES]->(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(sc:Claim)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(cc:Claim)
       RETURN e, sc, cc`,
      {
        e: vertexProps<EvidenceProps>(),
        sc: optional(vertexProps<ClaimProps>()),
        cc: optional(vertexProps<ClaimProps>()),
      },
      { id: analysis.id },
    );
    return rows.flatMap((r) => {
      const claim = r.sc ?? r.cc;
      return claim ? [{ proposition: claim.name, finding: r.e.statement }] : [];
    });
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

  private async assertCriterionQualifiesSomething(criterion: CriterionRef): Promise<void> {
    const rows = await this.graph.query(
      `MATCH (:Criterion {natural_id: $criterion})-[:QUALIFIES]->(:EvidenceUnit) RETURN 1`,
      { ok: scalar<number>() },
      { criterion: criterion.id },
    );
    if (rows.length === 0) {
      throw new Error(
        `criterion ${criterion.id} gates no work and qualifies no finding; name the gate it is being evaluated for`,
      );
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
