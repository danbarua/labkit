/**
 * The verbs that change the record.
 *
 * Every one of these emits, and `emit` lives here rather than in `SessionCore`
 * so that a read cannot reach it. That is the temporal seam PJ-009 §3 describes,
 * made structural: one event per research action, stamped from the injected
 * clock, at the single choke point below.
 *
 * Some verbs here run inside `graph.inTransaction()` — everything they write
 * commits together or none of it does. The `TenantGraph` is shared with the read
 * surface, so its re-entrancy depth is shared too, which is what a facade
 * composing both halves requires.
 *
 * **Which ones, and why it is not "the compound ones".** This header used to say
 * a *compound* verb is transactional, and that word already means something else
 * two paragraphs away in CLAUDE.md, where `openEnquiry` is the archetypal
 * composed verb — and `openEnquiry` is not transactional. Writing more than once
 * is not the test either. The rule (`039`, corrected in `041`):
 *
 *   **A partial state is acceptable exactly when every answer a reader can
 *   derive from it is true.**
 *
 * Unreachability is the trivial case — no readers, no answers, nothing to be
 * false. "Some other verb could legitimately have produced it" is *evidence*
 * and not a test: it is worth something when the reachable state carries no
 * claim about how it arose, and worthless when it does. That distinction is not
 * academic; it is the whole of `evaluateCriterion` below, where a shape that
 * another call produces legitimately is false when reached by interruption.
 *
 * Each verb is decided on its own by negative test, which is how the rule was
 * earned in the first place (PJ-020, S-3c) — not by a category anyone can read
 * off a signature. **Where the reachability edge sits in the write order is the
 * useful tell**: everything written after it is a claim about a record readers
 * can already see.
 *
 * Worked three ways, so the distinction is demonstrated rather than asserted:
 * `recordObservations` is transactional because a failure between the evidence
 * and its unit writes exactly the invariant the fix removed, indistinguishable
 * from real history. `sharpen` is **not**, because it writes its reachability
 * edge (`MOTIVATES`) last and its half-built decision is unreachable.
 * `evaluateCriterion` **is**, because it writes `EVALUATED_AS` second and a
 * verdict that lost its later `BASED_ON` can never be withdrawn — so the record
 * insists a `fail` still stands after its basis was retracted. All three have
 * negative tests in `tests/domain-session.test.ts`, and `sharpen`'s exists to
 * fail if a `NARROWS` reader ever stops requiring `MOTIVATES`.
 *
 * `closeEnquiry` **is**, for two independent reasons with different remedies —
 * an interrupted close plus a retry left two `RESOLVES` and erased the answer
 * (`043`), and a *deliberate* second close did the same with no interruption at
 * all, which a guard rather than a transaction fixes. One verb, two defects;
 * stopping at the first would have left the second. `pursue` is **not**, and is
 * the second clean result — reachability edge last again (`045`).
 *
 * **Every non-transactional verb here has now been examined by demonstration**
 * (`docs/consumer-contract/047`). Seven routes had an interruption window and
 * three were defects; `recordReview` and `declareGate` are clean, and
 * `stateCriterion` and `planWork` write one node and no edge, so they have no
 * partial state to have. Nothing here is *undecided* any more.
 *
 * Two of the clean verdicts rest on weaker ground than the rest and their tests
 * say so: `pursue` is safe because `whatDependsOn` requires an inbound `REQUIRES`
 * an orphan lacks — an accident of write order — and `declareGate` is safe
 * because nothing enumerates `Gate`, which is true today and one new reader away
 * from false. Both fail the day that changes.
 *
 * The write-order tell — everything after a reachability edge is a claim about a
 * record readers can already see — held across all seven and is **still a lead
 * rather than a rule**: the same reasoning got a verdict right and both its
 * mechanisms wrong in `042`.
 */

import type { TenantGraph } from "../db/graph";
import { optional, scalar, vertexProps } from "../db/cypher";
import type { ArtefactProps, ClaimProps, EvidenceProps } from "../db/domain";
import type {
  VerificationReport,
  TaskContract,
  ClaimSubject,
  AmendmentReport,
  AnalysisRef,
  CriterionRef,
  GateRef,
  WorkRef,
  ChangedConclusion,
  CitedFinding,
  Conclusion,
  ConclusionRef,
  EnquiryRef,
  ObservationsRef,
  QuestionRef,
  ReinterpretationReport,
  ReplacementReport,
  ReviewRef,
  UnaffectedRecord,
} from "./report";
import type {
  AcceptAsUnresolvedCommand,
  AmendDesignCommand,
  CloseEnquiryCommand,
  DeclareGateCommand,
  EvaluateCriterionCommand,
  PlanWorkCommand,
  PromoteCommand,
  PursueCommand,
  RecordAnalysisCommand,
  RecordObservationsCommand,
  RecordReviewCommand,
  ReinterpretCommand,
  ReplaceAnalysisCommand,
  ReverifyCommand,
  SharpenCommand,
} from "./commands";
import { SessionCore } from "./core";

export class WriteSurface extends SessionCore {
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
    const asked = await this.graph.createNode("Question", { name: question, posed_at: this.clock.now() });
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
  async pursue(input: PursueCommand): Promise<EnquiryRef> {
    const enquiry = await this.pursued(input);
    this.emit("pursue", enquiry.id, {
      question: input.question.id,
      approach: input.approach,
    });
    return enquiry;
  }

  /** The write, without the event — see `posed`. */
  private async pursued(input: PursueCommand): Promise<EnquiryRef> {
    const enquiry = await this.graph.createNode("LineOfEnquiry", {
      name: input.approach,
    });
    await this.graph.createEdge(
      input.question.id,
      "MOTIVATES",
      enquiry.natural_id,
    );
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
  async sharpen(input: SharpenCommand): Promise<QuestionRef> {
    const original = await this.graph.query(
      `MATCH (q:Question {natural_id: $id}) RETURN q`,
      { q: vertexProps<{ name: string }>() },
      { id: input.from.id },
    );
    if (original.length === 0)
      throw new Error(`no question ${input.from.id} to sharpen`);

    const decision = await this.graph.createNode("Decision", {
      decided_at: this.clock.now(),
      reason: input.because,
      invalidation_check:
        "evidence that the sharper question was the wrong one to ask",
    });
    await this.graph.createEdge(decision.natural_id, "NARROWS", input.from.id);

    for (const finding of await this.standingFindings()) {
      await this.graph.createEdge(decision.natural_id, "BASED_ON", finding);
    }

    const sharper = await this.posed(input.into);
    await this.graph.createEdge(decision.natural_id, "MOTIVATES", sharper.id);
    this.emit("sharpen", sharper.id, {
      from: input.from.id,
      because: input.because,
      via: decision.natural_id,
    });
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
   * Records raw observations — the durable measurements an analysis later
   * interprets. Kept distinct from the conclusions drawn from them, which is
   * the entire premise of S-11: an inference can be wrong while the
   * observations it consumed remain fine.
   *
   * **Taking measurements is work, and this records it as such (row AD).** For
   * eighteen scenarios it created `Evidence` with no producing `EvidenceUnit`,
   * which PJ-001 defines as impossible. Three cold reviewers flagged it and
   * three scenarios were pointed at it without finding harm; S-9b found the
   * harm. `whatIsKnown()` decides whether anyone has looked at a question from
   * `EvidenceUnit -ADDRESSES-> LineOfEnquiry`, so a question pursued only
   * through observations reported itself `untested` — *"one nothing has ever
   * been run against"*. Populated, confident, and false.
   *
   * The unit `PRODUCES` the evidence and **not** the artefact, which is where
   * this differs from `recorded()`. There the artefact is an analysis *output*
   * the unit brought into existence; here the artefact **is** the observation
   * record, and the unit did not produce the measurement — it is the activity
   * of taking it. Wiring the second edge would claim the record was generated
   * by the act that describes it.
   *
   * No `Computation`, deliberately. LabKit did not run the instrument, and
   * minting one to make this shape match the analysis path would invent
   * execution state that never existed. It is also what keeps the blast radius
   * to one read: every other query that reaches a unit does so either through
   * `Evidence -SUPPORTS|CHALLENGES-> Claim`, which observation evidence has
   * neither of, or through a required `USES -> Computation`.
   */
  async recordObservations(input: RecordObservationsCommand): Promise<ObservationsRef> {
    // Atomic, and this is the sharper half of row AD's fix. Before the unit
    // existed there was nothing an interrupted call could leave behind that the
    // model called impossible; now a failure between the evidence and the unit
    // would write *precisely* the invariant this verb was changed to stop --
    // durably, and looking exactly like the eighteen scenarios of records that
    // predate the fix. See TenantGraph.inTransaction.
    const artefact = await this.graph.inTransaction(async () => {
      const artefact = await this.graph.createNode("Artefact", {
        kind: "observations",
        logical_name: input.name,
        ...(input.contentHash ? { content_hash: input.contentHash } : {}),
      });
      const evidence = await this.graph.createNode("Evidence", {
        statement: input.finding,
      });
      // `role` is recorded because the property is not optional, not because
      // anything reads it: `EvidenceUnitRole` has nine values, and until this
      // call one writer and no readers anywhere in `src/`. An "observation"
      // value was the obvious move and was declined -- adding vocabulary to a
      // union nothing consumes is the dead shape PJ-007 found in
      // `buildAsClause`, and the no-cull policy does not cover it: that policy
      // protects labels and edges, which are claims about the domain, and the
      // CQRS views were removed on exactly this distinction. `experiment` is
      // the nearest existing value for a measurement taken rather than
      // inferred, and it is a placeholder until something reads the field.
      const unit = await this.graph.createNode("EvidenceUnit", {
        role: "experiment",
      });
      await this.graph.createEdge(
        evidence.natural_id,
        "RECORDED_IN",
        artefact.natural_id,
      );
      await this.graph.createEdge(
        unit.natural_id,
        "PRODUCES",
        evidence.natural_id,
      );
      await this.graph.createEdge(
        unit.natural_id,
        "ADDRESSES",
        input.enquiry.id,
      );
      // The enquiry requires these observations -- a statement about the
      // enquiry, not about any analysis. What a given analysis actually read is
      // CONSUMES, drawn in recordAnalysis(); this edge no longer stands in for
      // it. Kept alongside ADDRESSES rather than replaced by it: REQUIRES says
      // the enquiry depends on this evidence, ADDRESSES says this work was done
      // towards the enquiry, and `whatDependsOn()` reads the first.
      await this.graph.createEdge(
        input.enquiry.id,
        "REQUIRES",
        evidence.natural_id,
      );
      return artefact;
    });

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
  async recordAnalysis(input: RecordAnalysisCommand): Promise<AnalysisRef> {
    const analysis = await this.graph.inTransaction(() => this.recorded(input));
    this.emit("recordAnalysis", analysis.id, {
      enquiry: input.enquiry.id,
      method: input.method,
      concludes: input.concludes.map((c) => c.proposition),
    });
    return analysis;
  }

  /**
   * The write half of `recordAnalysis`, without the event.
   *
   * Composed verbs call this. A researcher who re-verified a result did one
   * thing, and a log that also records the analysis underneath it describes the
   * implementation — the rule `openEnquiry` established (PJ-014), applied where
   * external review found it had lapsed: `reverify()` and `replaceAnalysis()`
   * were each emitting two events while their journals claimed one.
   */
  private async recorded(input: RecordAnalysisCommand): Promise<AnalysisRef> {
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
    const unit = await this.graph.createNode("EvidenceUnit", {
      role: "analysis",
    });
    const output = await this.graph.createNode("Artefact", {
      kind: "analysis-output",
      logical_name: `${input.method} output`,
    });

    await this.graph.createEdge(
      unit.natural_id,
      "USES",
      computation.natural_id,
    );
    await this.graph.createEdge(unit.natural_id, "ADDRESSES", input.enquiry.id);
    if (input.implementing)
      await this.graph.createEdge(
        input.implementing.id,
        "IMPLEMENTS",
        unit.natural_id,
      );
    for (const criterion of input.heldTo ?? []) {
      await this.graph.createEdge(criterion.id, "QUALIFIES", unit.natural_id);
    }
    // Both levels of provenance, deliberately: the evidence unit produced
    // this scientific output; the computation produced this concrete
    // execution output. Without the second, CONSUMES would be half a pair --
    // "what did this computation read" answerable in one hop while "what did
    // it produce" still needed a detour through the unit.
    //
    // The FIRST of the two is unwalked: nothing reads `EvidenceUnit -PRODUCES->
    // Artefact`. Every PRODUCES traversal in src/ ends at an Evidence except
    // `outputArtefactOf`, which starts at the Computation. Kept under the
    // no-cull policy -- an endpoint pair is a claim about the domain the same
    // way a label is -- and named here so it is a computable map rather than an
    // oversight. Found by review of row AD, when `recordObservations()`
    // deliberately did NOT write the matching edge; see consumer-contract/030.
    await this.graph.createEdge(unit.natural_id, "PRODUCES", output.natural_id);
    await this.graph.createEdge(
      computation.natural_id,
      "PRODUCES",
      output.natural_id,
    );
    for (const source of input.from) {
      // An analysis is named by its computation; what it *read* is that
      // computation's output artefact, which is what CONSUMES points at.
      const artefact =
        source.kind === "analysis" ? await this.outputArtefactOf(source) : source.id;
      await this.graph.createEdge(computation.natural_id, "CONSUMES", artefact);
    }

    for (const conclusion of input.concludes) {
      const evidence = await this.graph.createNode("Evidence", {
        statement: conclusion.finding,
      });
      const claim = await this.graph.createNode("Claim", {
        name: conclusion.proposition,
        kind: conclusion.standing ?? "exploratory",
      });
      await this.graph.createEdge(
        unit.natural_id,
        "PRODUCES",
        evidence.natural_id,
      );
      await this.graph.createEdge(
        evidence.natural_id,
        "RECORDED_IN",
        output.natural_id,
      );
      // A null result is a finding, not an absence of one -- it bears
      // against the proposition rather than failing to bear on it.
      const bearing =
        conclusion.bearing === "challenges" ? "CHALLENGES" : "SUPPORTS";
      await this.graph.createEdge(
        evidence.natural_id,
        bearing,
        claim.natural_id,
      );
    }

    return { kind: "analysis", id: computation.natural_id };
  }

  /**
   * Records a reviewer's finding about an analysis.
   *
   * The review attaches to the inferential activity (the evidence unit), not
   * to the execution that ran it — what gets criticized in S-11 is the
   * method, and nothing ran incorrectly. See EDGE_SCHEMA.EVALUATES.
   */
  async recordReview(input: RecordReviewCommand): Promise<ReviewRef> {
    const review = await this.graph.createNode("Review", {
      verdict: input.verdict,
    });
    await this.graph.createEdge(
      review.natural_id,
      "EVALUATES",
      await this.unitOf(input.of),
    );
    this.emit("recordReview", review.natural_id, {
      of: input.of.id,
      verdict: input.verdict,
    });
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
  async closeEnquiry(input: CloseEnquiryCommand): Promise<void> {
    // Everything is validated before anything is written. A rejected close
    // must leave no Decision behind, and an analysis from some other enquiry
    // must not become the stated basis for resolving this question.
    const question = await this.questionBehind(input.enquiry);
    if (!question)
      throw new Error(
        `enquiry ${input.enquiry.id} has no motivating question to resolve`,
      );

    // **Closing a closed question is refused, not recorded.** A second close
    // writes a second `RESOLVES`, and `enquiryStatus()` picks between them with
    // `.find()` over rows AGE returns in no defined order — so which close a
    // reader sees is arbitrary. Demonstrated through the public API with no
    // interruption at all: abandon an enquiry, later find a result and close it
    // citing the evidence, and the record still reports `abandoned`,
    // `answer: null`, `evidence: []`. The answer is erased, and `abandoned` is a
    // positive classification, so PJ-011 §5 does not excuse it.
    //
    // This is a *different route* to the wrong answer `043` found by
    // interruption, and it survives that fix untouched, because nothing here
    // fails halfway. Two clean calls are enough.
    //
    // **Refused rather than resolved in the reader**, and the choice is not
    // arbitrary: `closeEnquiry` is the only writer of `RESOLVES`, so with this
    // guard two resolving decisions cannot exist, and a reader-side tie-break
    // would be a branch nothing can reach — the `DEFERS` shape PJ-011 §6
    // describes, where an unreachable branch was not merely dead but wrong.
    //
    // The refusal has something real to refuse (S-5, S-10): a caller closing a
    // question that is already closed. Re-opening a settled question on new
    // evidence is a *different research act* and has no verb; when a scenario
    // needs one it gets built, rather than being smuggled in as a second close.
    const alreadyResolved = await this.graph.query(
      `MATCH (d:Decision)-[:RESOLVES]->(:Question {natural_id: $id}) RETURN d`,
      { d: vertexProps<{ natural_id: string; reason: string }>() },
      { id: question },
    );
    if (alreadyResolved.length > 0) {
      throw new Error(
        `enquiry ${input.enquiry.id} is already closed by decision ` +
          `${alreadyResolved[0]!.d.natural_id} (${alreadyResolved[0]!.d.reason}); ` +
          `closing it again would leave two decisions resolving one question`,
      );
    }

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
        throw new Error(
          `analysis ${analysis.id} does not address enquiry ${input.enquiry.id}; it cannot answer its question`,
        );
      }
      answerBearing = await this.findingFor(analysis, proposition);
      if (!answerBearing) {
        throw new Error(
          `analysis ${analysis.id} concluded nothing about "${proposition}"`,
        );
      }
    }

    // Transactional, demonstrated — `docs/consumer-contract/043`.
    //
    // `RESOLVES` is written before `BASED_ON`, so an interrupted close leaves a
    // resolving decision with nothing cited. That is *indistinguishable from a
    // deliberate close without a cited result*, which is a legitimate call — and
    // that shape-level similarity is exactly what made it look safe.
    //
    // What it is not safe from is the retry. The caller saw a throw and closes
    // again; two decisions then resolve one question, `enquiryStatus` picks
    // between them with `.find()` over unordered rows, and the orphan can win.
    // The question then reports `closure: "abandoned"`, `answer: null` for a
    // question that was answered "no" on cited evidence. The answer is not
    // inverted — it is erased, and PJ-011 §5 does not cover it, because
    // "abandoned" is a positive classification and not an empty result.
    await this.graph.inTransaction(async () => {
      const decision = await this.graph.createNode("Decision", {
        decided_at: this.clock.now(),
        reason: input.answeredBy
          ? `answered on "${input.answeredBy.proposition}"`
          : "closed without a cited result",
        invalidation_check: "new evidence bearing on the question",
      });
      await this.graph.createEdge(decision.natural_id, "RESOLVES", question);
      if (answerBearing)
        await this.graph.createEdge(decision.natural_id, "BASED_ON", answerBearing);
    });

    this.emit("closeEnquiry", input.enquiry.id, {
      answeredBy: input.answeredBy?.analysis.id ?? null,
      proposition: input.answeredBy?.proposition ?? null,
    });
  }

  private async questionBehind(
    enquiry: EnquiryRef,
  ): Promise<string | undefined> {
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
  async planWork(input: PlanWorkCommand): Promise<WorkRef> {
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
  async declareGate(input: DeclareGateCommand): Promise<GateRef> {
    if (input.governedBy.length === 0)
      throw new Error("a gate governed by no condition is not a gate");
    // And a gate protecting nothing is not a gate either. Before S-3b there
    // was no way to record a check that qualifies a finding without minting
    // one: `gateStatus()` then answered "what is blocked?" with `blocked` and
    // an empty `gating` list -- a control-plane object asserting a consequence
    // for work that does not exist. `recordAnalysis({ heldTo })` is how a
    // standard with nothing downstream is recorded now.
    if (input.protecting.length === 0)
      throw new Error("a gate protecting nothing is not a gate");
    const gate = await this.graph.createNode("Gate", {
      consequence: input.consequence,
    });
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
  async evaluateCriterion(input: EvaluateCriterionCommand): Promise<void> {
    if (input.gate)
      await this.assertCriterionGovernsGate(input.criterion, input.gate);
    // Same invariant class as `assertCriterionGovernsGate`, for the other job
    // a criterion can do: an evaluation that neither triggers a gate nor bears
    // on a finding held to it is durable nonsense no reader would ever surface.
    else await this.assertCriterionQualifiesSomething(input.criterion);
    let basis: string | undefined;
    if (input.citing) {
      basis = await this.findingFor(
        input.citing.analysis,
        input.citing.proposition,
      );
      if (!basis) {
        throw new Error(
          `analysis ${input.citing.analysis.id} concluded nothing about "${input.citing.proposition}"`,
        );
      }
    }
    const at = this.clock.now();
    // Transactional, demonstrated rather than assumed — `docs/consumer-contract/041`.
    //
    // The docstring above argues against exactly one durable state, and guards
    // it on the caller-error path only. Interruption is the other side of the
    // same operation, and it was open: `EVALUATED_AS` is written *second*, so
    // from that point the evaluation is reachable and the edges after it are
    // the ones that say what it means.
    //
    // The window that earned this is `BASED_ON`. A verdict that lost it reads
    // as reached against nothing — `basis: []`, an empty result, which PJ-011
    // §5 says is not a wrong answer. But `isWithdrawn` is
    // `cited > 0 && standing === 0`, so a verdict that cited nothing can never
    // be withdrawn. Retract the evidence it was actually reached against and
    // the gate stays **blocked** by a `fail` the record insists still stands.
    // That is a positively false answer, not an absence, and it is what
    // separates this verb from `sharpen` (`039`), whose partial states no
    // reader can reach.
    const evaluation = await this.graph.inTransaction(async () => {
      const ev = await this.graph.createNode("CriterionEvaluation", {
        value: input.value,
        outcome: input.outcome,
        evaluated_at: at,
      });
      await this.graph.createEdge(input.criterion.id, "EVALUATED_AS", ev.natural_id);
      if (input.gate)
        await this.graph.createEdge(ev.natural_id, "TRIGGERS", input.gate.id);
      // What the verdict was reached against. `BASED_ON: CriterionEvaluation ->
      // Evidence` was declared in PJ-004 and never written until S-8; without
      // it, a condition established by measurement and one asserted by an agent
      // returned identical records. See PJ-008 row W.
      if (basis) await this.graph.createEdge(ev.natural_id, "BASED_ON", basis);
      return ev;
    });
    this.emit("evaluateCriterion", evaluation.natural_id, {
      criterion: input.criterion.id,
      ...(input.gate ? { gate: input.gate.id } : {}),
      outcome: input.outcome,
    });
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
  async reverify(input: ReverifyCommand): Promise<VerificationReport> {
    const at = this.clock.now();
    // Atomic: without the second write the durable state is precisely S-10's
    // demonstrated wrong answer -- a second independent support standing where
    // a re-verification was meant. See TenantGraph.inTransaction.
    const verification = await this.graph.inTransaction(async () => {
      const original = await this.findingFor(
        input.historical,
        input.concludes.proposition,
      );
      if (!original) {
        throw new Error(
          `analysis ${input.historical.id} concluded nothing about "${input.concludes.proposition}"; there is nothing to re-verify`,
        );
      }
      const recorded = await this.recorded({
        enquiry: input.enquiry,
        method: input.method,
        from: input.under,
        concludes: [input.concludes],
      });
      const restated = await this.findingFor(
        recorded,
        input.concludes.proposition,
      );
      if (!restated)
        throw new Error(
          "unreachable: the analysis just recorded this conclusion",
        );
      await this.graph.createEdge(restated, "REVERIFIES", original);
      return recorded;
    });

    this.emit("reverify", verification.id, {
      of: input.historical.id,
      proposition: input.concludes.proposition,
    });
    return { at, verification, of: input.historical };
  }

  /**
   * Records that a question is being left open on purpose (S-14).
   *
   * Not closing it. `closeEnquiry()` with nothing cited reports the question
   * **abandoned** — nobody worked on it, no result behind it — which is a
   * confident misreading of a deliberate decision as neglect, and was the only
   * thing a researcher could do here before this verb existed.
   *
   * `until` is the condition that would reopen it, and it lands on the
   * decision's `invalidation_check`, which already meant exactly that: what
   * would make this decision wrong. The bullet it answers insists the condition
   * be about the world — new design, new data — rather than "run the analysis
   * again", and nothing here can enforce that; what the model guarantees is
   * that a condition was named at all, which is the difference between deciding
   * to stop and drifting to a halt.
   *
   * **No `Task` is created**, and none may be needed to make any of this
   * answerable. A to-do item nobody intends to action, minted so a survey can
   * report it, is the ceremony PJ-001 forbids and the failure mode §2 names.
   *
   * Writes `DEFERS`, which is its first writer since PJ-004 declared it —
   * CLAUDE.md's standing example of a reader with no writer, now walked.
   */
  async acceptAsUnresolved(input: AcceptAsUnresolvedCommand): Promise<void> {
    const at = this.clock.now();
    await this.graph.inTransaction(async () => {
      const question = await this.questionBehind(input.enquiry);
      if (!question) throw new Error(`enquiry ${input.enquiry.id} pursues no question`);

      const basis = await this.findingFor(input.inLightOf.analysis, input.inLightOf.proposition);
      if (!basis) {
        throw new Error(
          `analysis ${input.inLightOf.analysis.id} concluded nothing about "${input.inLightOf.proposition}"`,
        );
      }

      const decision = await this.graph.createNode("Decision", {
      decided_at: this.clock.now(),
        reason: input.because,
        invalidation_check: input.until,
      });
      await this.graph.createEdge(decision.natural_id, "DEFERS", question);
      // What was known when the call was made -- S-1's requirement, and the
      // reason `evidence` is answerable afterwards rather than only now.
      await this.graph.createEdge(decision.natural_id, "BASED_ON", basis);
    });

    this.emit("acceptAsUnresolved", input.enquiry.id, { because: input.because, until: input.until, at });
  }

  /**
   * Promotes an exploratory finding to confirmatory standing (S-18).
   *
   * Standing can be **conferred by an act** — the successor question rows G, K
   * and R left open — because story 18's premise requires it: scratch is
   * captured before anyone knows it matters, so the researcher recording it
   * does not yet have the information a birth declaration would encode.
   *
   * It does **not** replace declaring standing at creation
   * (`Conclusion.standing`, S-7), and the prediction that it would was half
   * refuted. Both paths are legitimate and the discriminator is whether the
   * standing was knowable in advance: a prespecified comparison declares it
   * *before* running, which is what prespecification is, and declaring it
   * afterwards would be the p-hacking the design lock exists to prevent. Work
   * that could not have declared it gets promoted instead, and pays for the
   * lateness with a recorded reason. A reader can tell the two apart:
   * `whySupported().promotedBecause` is present only for the second.
   *
   * Writes `PROMOTES`, not `CHANGES`. The prediction for this build said
   * `CHANGES` would serve, and it was refuted by demonstration — see
   * `EDGE_SCHEMA.PROMOTES`.
   *
   * Deliberately not a gate. S-17 established that declaring a gate does not
   * satisfy it, so a gate-conferred model would leave a claim behind an
   * unevaluated confirmatory gate reading exploratory, and S-7's amendment
   * check would miss a scientific change. Promotion is an act with a reason.
   */
  async promote(input: PromoteCommand): Promise<void> {
    await this.graph.inTransaction(async () => {
      const claim = await this.claimFor(input.claim);
      // `invalidation_check` is the verb's own sentence about what would make a
      // decision of *this class* wrong, as it is in `sharpen`, `closeEnquiry`,
      // `amendDesign` and `reinterpret`. S-14 is the one place the researcher
      // supplies it, because there naming the condition *is* the act. Taking an
      // `until:` here that no scenario reads would be the ceremony S-14 forbids.
      const decision = await this.graph.createNode("Decision", {
      decided_at: this.clock.now(),
        reason: input.because,
        invalidation_check: "evidence that the promoted result does not replicate",
      });
      await this.graph.createEdge(decision.natural_id, "PROMOTES", claim);
      await this.graph.query(
        `MATCH (c:Claim {natural_id: $id}) SET c.kind = 'confirmatory' RETURN c`,
        { c: vertexProps<ClaimProps>() },
        { id: claim },
      );
    });
    this.emit("promote", input.claim.analysis.id, { proposition: input.claim.proposition });
  }

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
  async amendDesign(input: AmendDesignCommand): Promise<AmendmentReport> {
    const at = this.clock.now();

    // Everything validated before anything is written -- a rejected amendment
    // must not leave a decision recording a change that never happened.
    const existing = await this.graph.query(
      `MATCH (c:Criterion {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ proposition: string }>() },
      { id: input.criterion.id },
    );
    const replaced = existing[0]?.c.proposition;
    if (!replaced)
      throw new Error(`no condition ${input.criterion.id} to amend`);

    const diagnosis = await this.findingFor(
      input.citing.analysis,
      input.citing.proposition,
    );
    if (!diagnosis) {
      throw new Error(
        `analysis ${input.citing.analysis.id} concluded nothing about "${input.citing.proposition}"`,
      );
    }

    const gates = await this.gatesGovernedBy(input.criterion.id);
    if (gates.length === 0) {
      throw new Error(
        `condition ${input.criterion.id} governs nothing; there is no locked design to amend`,
      );
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
      throw new Error(
        `condition ${input.criterion.id} has already been amended; amend the one now in force`,
      );
    }

    const prior = await this.latestAmendmentOn(gates);

    // Atomic, for the same reason: interrupted after the replacement condition
    // governs the gate but before the original is retired, the gate is governed
    // by two conditions, one of which nobody agreed to. See
    // TenantGraph.inTransaction.
    const { replacement, decision } = await this.graph.inTransaction(
      async () => {
        const replacement = await this.graph.createNode("Criterion", {
          proposition: input.nowRequires,
        });
        for (const gate of gates)
          await this.graph.createEdge(replacement.natural_id, "GOVERNS", gate);

        const decision = await this.graph.createNode("Decision", {
      decided_at: this.clock.now(),
          reason: input.because,
          invalidation_check:
            "evidence that the amended setting was not the constraint after all",
        });
        await this.graph.createEdge(
          decision.natural_id,
          "CHANGES",
          input.criterion.id,
        );
        await this.graph.createEdge(decision.natural_id, "BASED_ON", diagnosis);
        if (prior)
          await this.graph.createEdge(decision.natural_id, "SUPERSEDES", prior);
        return { replacement, decision };
      },
    );
    void replacement;

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

  private async gatesGovernedBy(criterionId: string): Promise<string[]> {
    const rows = await this.graph.query(
      `MATCH (:Criterion {natural_id: $id})-[:GOVERNS]->(g:Gate) RETURN g`,
      { g: vertexProps<{ natural_id: string }>() },
      { id: criterionId },
    );
    return [...new Set(rows.map((r) => r.g.natural_id))];
  }

  /** The most recent amendment to this design — the one nothing has superseded yet. */
  private async latestAmendmentOn(
    gates: string[],
  ): Promise<string | undefined> {
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
      const superseded = new Set(
        rows.filter((r) => r.newer).map((r) => r.d.natural_id),
      );
      const latest = rows
        .map((r) => r.d.natural_id)
        .find((d) => !superseded.has(d));
      if (latest) return latest;
    }
    return undefined;
  }

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
  async replaceAnalysis(input: ReplaceAnalysisCommand): Promise<ReplacementReport> {
    const at = this.clock.now();
    // Atomic, and this is the one that made transactions necessary rather than
    // tidy. Invalidating the superseded output is not an isolated write: since
    // S-3c it withdraws the criterion evaluations that cited it, so a failure
    // between the halves leaves an earlier failure no longer deciding its check
    // and no corrected check in existence. External review named it the
    // blocking finding; S-3c carries the negative test. See
    // TenantGraph.inTransaction.
    const { before, replacement } = await this.graph.inTransaction(async () => {
      await this.assertReviewOf(input.because, input.supersedes);
      const before = await this.conclusionsOf(input.supersedes);

      const output = await this.outputArtefactOf(input.supersedes);
      await this.graph.query(
        `MATCH (a:Artefact {natural_id: $id}) SET a.invalidated = true RETURN a`,
        { a: vertexProps<ArtefactProps>() },
        { id: output },
      );
      // Which review this rested on, recorded rather than validated and
      // discarded (row O). `because` was checked against the analysis and then
      // written nowhere, so a reader asking why the finding no longer stands
      // got the verdict of an arbitrary review of the same unit -- and with a
      // critical review and a confirming one on one analysis, reported the
      // approval as the reason for the retraction. See
      // EDGE_SCHEMA.INVALIDATED_BY.
      await this.graph.createEdge(output, "INVALIDATED_BY", input.because.id);

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
      const replacement = await this.recorded({
        enquiry: input.enquiry,
        method: input.method,
        from: input.from,
        concludes: input.concludes,
      });
      return { before, replacement };
    });

    const changed: ChangedConclusion[] = [];
    const unchanged: string[] = [];
    for (const now of input.concludes) {
      const was = before.find((b) => b.proposition === now.proposition);
      if (!was) continue;
      if (was.finding === now.finding) unchanged.push(now.proposition);
      else
        changed.push({
          proposition: now.proposition,
          before: was.finding,
          after: now.finding,
        });
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
  async reinterpret(input: ReinterpretCommand): Promise<ReinterpretationReport> {
    const at = this.clock.now();

    const scope = await this.scopeFor(input.of);
    const claims = await this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       ${this.withinScope(scope)}
       RETURN c`,
      { c: vertexProps<{ natural_id: string }>() },
      {
        name: scope.proposition,
        ...(scope.enquiry ? { enquiry: scope.enquiry } : {}),
      },
    );
    if (claims.length === 0)
      throw new Error(`nothing on the record claims "${scope.proposition}"`);

    // Atomic. Interrupted between withdrawing the original and carrying its
    // evidence across, this retracts a finding and puts nothing in its place.
    // Demonstrated in tests/domain-session.test.ts, which is where the harm is
    // reachable -- "does this roll back?" is not a researcher's question, so it
    // is not a scenario. See TenantGraph.inTransaction.
    const { narrower, carried } = await this.graph.inTransaction(async () => {
      const review = await this.graph.createNode("Review", {
        verdict: input.because,
      });
      const narrower = await this.graph.createNode("Claim", {
        name: input.as,
        kind: "exploratory",
      });
      // The review records that someone objected; the decision records that the
      // objection was acted on. Reviews also confirm, so a review alone cannot
      // mean "withdrawn" without reading its prose.
      const decision = await this.graph.createNode("Decision", {
      decided_at: this.clock.now(),
        reason: input.because,
        invalidation_check:
          "evidence that the original reading was right after all",
      });
      await this.graph.createEdge(
        decision.natural_id,
        "MOTIVATES",
        narrower.natural_id,
      );

      // Keyed by id. The query below selects natural_id AND statement and only
      // the statement was kept, so two findings phrased alike merged -- in the
      // field whose whole job is showing the findings survived unchanged.
      const carried = new Map<string, CitedFinding>();
      for (const id of new Set(claims.map((c) => c.c.natural_id))) {
        const claim = { c: { natural_id: id } };
        await this.graph.createEdge(
          review.natural_id,
          "EVALUATES",
          claim.c.natural_id,
        );
        await this.graph.createEdge(
          decision.natural_id,
          "CHANGES",
          claim.c.natural_id,
        );
        const evidence = await this.graph.query(
          `MATCH (e:Evidence)-[:SUPPORTS]->(:Claim {natural_id: $id}) RETURN e`,
          { e: vertexProps<{ natural_id: string; statement: string }>() },
          { id: claim.c.natural_id },
        );
        for (const row of evidence) {
          await this.graph.createEdge(
            row.e.natural_id,
            "SUPPORTS",
            narrower.natural_id,
          );
          carried.set(row.e.natural_id, { evidence: row.e.natural_id, states: row.e.statement });
        }
      }

      return { narrower, carried };
    });

    const restingOnTheOldReading = await this.decidedOnTheStrengthOf(scope);

    this.emit("reinterpret", narrower.natural_id, {
      previously: scope.proposition,
      because: input.because,
    });

    return {
      at,
      previously: scope.proposition,
      nowClaims: input.as,
      evidenceStanding: [...carried.values()].sort((a, b) => a.evidence.localeCompare(b.evidence)),
      restingOnTheOldReading,
      requiresRecomputation: false,
    };
  }

  private emit(
    operation: string,
    subject: string,
    detail?: Record<string, unknown>,
  ): void {
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

  private async assertCriterionGovernsGate(
    criterion: CriterionRef,
    gate: GateRef,
  ): Promise<void> {
    const rows = await this.graph.query(
      `MATCH (:Criterion {natural_id: $criterion})-[:GOVERNS]->(:Gate {natural_id: $gate}) RETURN 1`,
      { ok: scalar<number>() },
      { criterion: criterion.id, gate: gate.id },
    );
    if (rows.length === 0) {
      throw new Error(
        `criterion ${criterion.id} does not govern gate ${gate.id}; it cannot be evaluated for it`,
      );
    }
  }
  private async assertCriterionQualifiesSomething(
    criterion: CriterionRef,
  ): Promise<void> {
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
  /**
   * A replacement must be justified by a review OF the analysis being
   * replaced -- otherwise any review's verdict could retire any analysis,
   * and `whySupported()` would report a withdrawal reason that never
   * referred to the withdrawn work.
   *
   * This is why `Review -[:EVALUATES]-> EvidenceUnit` is not decorative: it
   * constrains a research action, not just an explanatory query.
   */
  private async assertReviewOf(
    review: ReviewRef,
    analysis: AnalysisRef,
  ): Promise<void> {
    const rows = await this.graph.query(
      `MATCH (:Review {natural_id: $review})-[:EVALUATES]->(:EvidenceUnit)-[:USES]->(:Computation {natural_id: $analysis})
       RETURN 1`,
      { ok: scalar<number>() },
      { review: review.id, analysis: analysis.id },
    );
    if (rows.length === 0) {
      throw new Error(
        `review ${review.id} does not review analysis ${analysis.id}; it cannot justify replacing it`,
      );
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
    if (!found)
      throw new Error(`analysis ${analysis.id} has no inferential unit`);
    return found.u.natural_id;
  }
}