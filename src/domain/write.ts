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

import { optional, scalar, vertexProps } from "../db/cypher";
import type { ArtefactProps, ClaimProps, EvidenceProps, IndexedString, Prose } from "../db/domain";
import { labelForNaturalId } from "../db/domain";
import type {
  VerificationReport,
  AmendmentReport,
  AnalysisRef,
  CriterionRef,
  DecisionRef,
  EvidenceRef,
  InputRef,
  Ref,
  GateRef,
  UnitRef,
  ChangedConclusion,
  ClaimRef,
  ConcludedClaim,
  RecordedAnalysis,
  RecordedObservations,
  OpenedEnquiry,
  SharpenedQuestion,
  Posed,
  Pursued,
  RecordedReview,
  ClosedEnquiry,
  PlannedWork,
  StatedCriterion,
  DeclaredGate,
  EvaluatedCriterion,
  AcceptedAsUnresolved,
  Promoted,
  CitedFinding,
  Conclusion,
  EnquiryRef,
  ObservationsRef,
  QuestionRef,
  ReinterpretationReport,
  ReplacementReport,
  ReviewRef,
  UnaffectedRecord,
} from "./report";
import { ref } from "./report";
import type {
  AcceptAsUnresolvedCommand,
  AmendDesignCommand,
  CloseEnquiryCommand,
  DeclareGateCommand,
  EvaluateCriterionCommand,
  PlanWorkCommand,
  PromoteCommand,
  PursueCommand,
  ConcludeCommand,
  RecordAnalysisCommand,
  RecordObservationsCommand,
  RecordReviewCommand,
  ReinterpretCommand,
  ReplaceAnalysisCommand,
  ReverifyCommand,
  SharpenCommand,
} from "./commands";
import { SessionCore } from "./core";
import type { DomainEvent, Operation } from "./events";

/**
 * A conclusion **already on the record**, as read back from the graph.
 *
 * Deliberately not {@link Conclusion}, which is the *command* shape: a caller
 * recording conclusions holds no claim id yet, so widening the input to carry
 * one would demand a handle for a record that does not exist. Reading them
 * back is the other direction and the id is right there.
 */
interface RecordedConclusion {
  claim: ClaimRef;
  proposition: string;
  finding: string;
  evidence: EvidenceRef;
  bearing: "supports" | "challenges";
}

/**
 * The refusal a caller meets when they cite a claim nothing has concluded.
 *
 * **What a refusal may point a caller at** — the rule, with its evidence, is on
 * `ReadSurface` in `./read.ts`. In short: name the act, never a command (the two
 * surfaces disagree on four of five names), and name a verb only when both
 * surfaces spell it identically *and* its promise has been checked against the
 * code implementing it.
 *
 * **One spelling, because four is this repository's oldest defect shape.** The
 * text was hand-written at four call sites, which is written-once and forgotten
 * the second time — the same shape as the `SUPPORTS`/`CHALLENGES` traversal that
 * appeared six times and was corrected five. A message is not a traversal, but
 * the arithmetic is identical: the next person to improve this wording improves
 * one of four, and the record then refuses the same act in two different voices.
 *
 * It is the highest-frequency refusal in the domain — every verb that cites a
 * claim reaches it — so it is the one most worth having exactly once.
 *
 * Ordered fact, rule, implication, which is the order every rewritten refusal
 * under #164 uses: what the domain got, what it expected, what would satisfy it.
 */
const noFindingBearsOn = (claim: ClaimRef): string =>
  `no finding bears on claim ${claim}; a claim can be cited only once an analysis ` +
  `has concluded it and produced the evidence bearing on it`;

/**
 * The write verbs a research *move* needs — what a fragment depends on.
 *
 * **Narrower than `WriteSurface` on purpose.** A fragment composes a few of
 * these into one thing a researcher did; the class carries 28 members it never
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
 * `ResearchSession` be checked against it (see `./session.ts`): a delegating
 * property whose signature drifts then fails to compile **where the drift is**,
 * rather than three files away in whichever fragment happened to call it.
 */
export type ResearchWrites = Pick<
  WriteSurface,
  | "pose"
  | "pursue"
  | "openEnquiry"
  | "sharpen"
  | "recordObservations"
  | "recordAnalysis"
  | "conclude"
  | "recordReview"
  | "replaceAnalysis"
  | "reverify"
  | "reinterpret"
  | "closeEnquiry"
  | "acceptAsUnresolved"
  | "promote"
  | "planWork"
  | "stateCriterion"
  | "declareGate"
  | "evaluateCriterion"
  | "amendDesign"
>;

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
  async pose(question: Prose): Promise<Posed> {
    return this.graph.inTransaction(async () => {
      const asked = await this.posed(question);
      const events = await this.emit("pose", asked, { question });
      return { question: asked, events };
    });
  }

  /**
   * The write, without the event. Verbs that compose this one record the
   * action the caller actually took, not the steps it decomposed into — the
   * event stream is a record of research actions, and a researcher who opened
   * an enquiry did one thing, not three.
   */
  private async posed(question: Prose): Promise<QuestionRef> {
    const asked = await this.graph.createNode("Question", {
      name: question,
      posed_at: this.clock.now(),
    });
    return ref("question", asked.natural_id);
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
  async pursue(input: PursueCommand): Promise<Pursued> {
    return this.graph.inTransaction(async () => {
      const enquiry = await this.pursued(input);
      const events = await this.emit("pursue", enquiry, {
        question: input.question,
        approach: input.approach,
      });
      return { enquiry, events };
    });
  }

  /** The write, without the event — see `posed`. */
  private async pursued(input: PursueCommand): Promise<EnquiryRef> {
    const enquiry = await this.graph.createNode("LineOfEnquiry", {
      name: input.approach,
    });
    await this.graph.createEdge(input.question, "MOTIVATES", enquiry.natural_id);
    return ref("enquiry", enquiry.natural_id);
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
  async openEnquiry(question: Prose): Promise<OpenedEnquiry> {
    return this.graph.inTransaction(async () => {
      const asked = await this.posed(question);
      const enquiry = await this.pursued({
        question: asked,
        approach: question,
      });
      const events = await this.emit("openEnquiry", enquiry, { question, asked: asked });
      return { enquiry, question: asked, events };
    });
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
  async sharpen(input: SharpenCommand): Promise<SharpenedQuestion> {
    return this.graph.inTransaction(async () => {
      const original = await this.graph.query(
        `MATCH (q:Question {natural_id: $id}) RETURN q`,
        { q: vertexProps<{ name: string }>() },
        { id: input.from },
      );
      if (original.length === 0)
        throw new Error(
          `no question ${input.from} to sharpen; pose it first, or name a question already on the record`,
        );

      const decision = await this.graph.createNode("Decision", {
        decided_at: this.clock.now(),
        reason: input.because,
        invalidation_check: "evidence that the sharper question was the wrong one to ask",
      });
      await this.graph.createEdge(decision.natural_id, "NARROWS", input.from);

      for (const finding of await this.standingFindings()) {
        await this.graph.createEdge(decision.natural_id, "BASED_ON", finding);
      }

      const sharper = await this.posed(input.into);
      await this.graph.createEdge(decision.natural_id, "MOTIVATES", sharper);
      const events = await this.emit("sharpen", sharper, {
        from: input.from,
        because: input.because,
        via: decision.natural_id,
      });
      return { question: sharper, decision: ref("decision", decision.natural_id), events };
    });
  }

  /** Every finding currently on the record — what "we knew at the time" means when an act is recorded. */
  private async standingFindings(): Promise<EvidenceRef[]> {
    const rows = await this.graph.query(
      `MATCH (:EvidenceUnit)-[:PRODUCES]->(e:Evidence)
       OPTIONAL MATCH (e)-[:RECORDED_IN]->(a:Artefact)
       RETURN e, a`,
      {
        e: vertexProps<{ natural_id: string }>(),
        a: optional(vertexProps<{ invalidated?: boolean }>()),
      },
    );
    return rows.filter((r) => !r.a?.invalidated).map((r) => ref("evidence", r.e.natural_id));
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
  async recordObservations(input: RecordObservationsCommand): Promise<RecordedObservations> {
    return this.graph.inTransaction(async () => {
      // Atomic, and this is the sharper half of row AD's fix. Before the unit
      // existed there was nothing an interrupted call could leave behind that the
      // model called impossible; now a failure between the evidence and the unit
      // would write *precisely* the invariant this verb was changed to stop --
      // durably, and looking exactly like the eighteen scenarios of records that
      // predate the fix. See TenantGraph.inTransaction.
      const { artefact } = await this.graph.inTransaction(async () => {
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
        await this.graph.createEdge(evidence.natural_id, "RECORDED_IN", artefact.natural_id);
        await this.graph.createEdge(unit.natural_id, "PRODUCES", evidence.natural_id);
        await this.graph.createEdge(unit.natural_id, "ADDRESSES", input.enquiry);
        // The enquiry requires these observations -- a statement about the
        // enquiry, not about any analysis. What a given analysis actually read is
        // CONSUMES, drawn in recordAnalysis(); this edge no longer stands in for
        // it. Kept alongside ADDRESSES rather than replaced by it: REQUIRES says
        // the enquiry depends on this evidence, ADDRESSES says this work was done
        // towards the enquiry, and `whatDependsOn()` reads the first.
        await this.graph.createEdge(input.enquiry, "REQUIRES", evidence.natural_id);
        return { artefact, evidence };
      });

      const events = await this.emit(
        "recordObservations",
        ref("observations", artefact.natural_id),
        { name: input.name },
      );
      return {
        observations: ref("observations", artefact.natural_id),
        events,
      };
    });
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
  async recordAnalysis(input: RecordAnalysisCommand): Promise<RecordedAnalysis> {
    return this.graph.inTransaction(async () => {
      const { analysis } = await this.graph.inTransaction(() => this.recorded(input));
      // The analysis is its own act, and each conclusion is another. **N+1
      // events, and that is the truthful count**: concluding four things is
      // four things a researcher did, and this must record them the same way
      // the CLI does when a person makes the same four calls. An analysis with
      // no conclusions yet emits exactly one and is a real, honest state --
      // `enquiry` prints "has produced nothing yet" and `known` buckets it as
      // worked-on-no-answer.
      const events = await this.emit("recordAnalysis", analysis, {
        enquiry: input.enquiry,
        method: input.method,
      });
      const claims: ConcludedClaim[] = [];
      for (const conclusion of input.concludes) {
        const concluded = await this.conclude({
          analysis,
          proposition: conclusion.proposition,
          finding: conclusion.finding,
          ...(conclusion.bearing === undefined ? {} : { bearing: conclusion.bearing }),
          ...(conclusion.standing === undefined ? {} : { standing: conclusion.standing }),
        });
        claims.push(...concluded.claims);
        events.push(...concluded.events);
      }
      return { analysis, claims, events };
    });
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
  private async recorded(
    input: Omit<RecordAnalysisCommand, "concludes">,
  ): Promise<{ analysis: AnalysisRef }> {
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

    await this.graph.createEdge(unit.natural_id, "USES", computation.natural_id);
    await this.graph.createEdge(unit.natural_id, "ADDRESSES", input.enquiry);
    if (input.implementing)
      await this.graph.createEdge(input.implementing, "IMPLEMENTS", unit.natural_id);
    for (const criterion of input.heldTo ?? []) {
      await this.graph.createEdge(criterion, "QUALIFIES", unit.natural_id);
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
    await this.graph.createEdge(computation.natural_id, "PRODUCES", output.natural_id);
    // Every position at which each artefact was read, collected before writing.
    //
    // `positions` and not `position`, and one edge per distinct artefact rather
    // than one per occurrence: `createEdge` treats `(from, label, to)` as
    // identity and a repeat as a no-op, backed by a real
    // `UNIQUE (start_id, end_id)` index -- so `from: [A, B, A]` cannot be three
    // edges, and writing it as two silently dropped the second A (S-10e).
    //
    // The caller said the run read three things. Storing two is losing what the
    // caller said, in the store whose job is not to. Refusing `[A, A]` was the
    // other available answer and is worse: a null test compares a series against
    // itself, which is an ordinary thing to record, and declining it would be
    // LabKit deciding a legitimate run is not recordable -- exactly what S-10d
    // took out.
    const positionsFor = new Map<ObservationsRef, number[]>();
    for (const [position, source] of input.from.entries()) {
      // An analysis is named by its computation; what it *read* is that
      // computation's output artefact, which is what CONSUMES points at.
      // Which kind of input this is, from the id's own prefix. It was
      // `source.kind === "analysis"` while a handle was an object; the prefix
      // was already the authority even then -- `createEdge` has never consulted
      // `kind` -- so this reads the same fact from the one place carrying it.
      const artefact =
        labelForNaturalId(source) === "Computation"
          ? await this.outputArtefactOf(source as AnalysisRef)
          : (source as ObservationsRef);
      const seen = positionsFor.get(artefact);
      if (seen) seen.push(position);
      else positionsFor.set(artefact, [position]);
    }
    for (const [artefact, positions] of positionsFor) {
      // No verdict rests on any of this: `reproductionOf` reports both runs'
      // lists in order and adjudicates nothing (S-10d).
      await this.graph.createEdge(computation.natural_id, "CONSUMES", artefact, {
        positions,
      });
    }

    return { analysis: ref("analysis", computation.natural_id) };
  }

  /**
   * Assert one thing an analysis found. **The primitive the compound verbs are
   * built from.**
   *
   * A conclusion is a research act of its own: a run draws its findings one at a
   * time, and each is recorded when it is reached.
   *
   * ## `replacing` supersedes exactly one finding, and needs no new edge
   *
   * `Decision -[:CHANGES]-> Claim` already means *this decision changed which
   * claim stands*, and `MOTIVATES` already names what replaced it —
   * `withdrawalOf()` reads precisely that pair. So a partial replacement is
   * expressible with the edges the model has.
   *
   * **That is one reading, not two**, and the distinction matters because
   * `PROMOTES` was split out of `CHANGES` for being a second one. `reinterpret`
   * writes `CHANGES` for *this reading was narrowed* and this writes it for
   * *this finding was superseded*; both are a decision withdrawing a claim and
   * naming its successor, and every reader — `withdrawalOf`, `whySupported` —
   * wants the same answer from both: that claim no longer stands, this one does.
   * `PROMOTES` was different in kind: it asserts a claim *more strongly*, so
   * reading it as `CHANGES` made promotion retract what it promoted.
   *
   * `REVERIFIES` is the edge that looks right here and is not. It means
   * *re-verified* — the same proposition checked again — where this means
   * *superseded*. Using it would be the one-edge-two-readings shape above.
   *
   * ## What is not written
   *
   * **The output artefact's `invalidated` flag is untouched.** A flag over the
   * whole artefact would summarise the standing of every finding it carries.
   * Standing is per finding, and `whySupported` computes it.
   */
  async conclude(input: ConcludeCommand): Promise<RecordedAnalysis> {
    return this.concludeOne(input);
  }

  /**
   * `conclude`, plus the review a composition can supply. **The compounds call
   * this one.**
   *
   * `because` is not on {@link ConcludeCommand} and this is not plumbing: a
   * researcher concluding one thing at a terminal is not holding a review
   * handle, and `replaceAnalysis` is the act that says a review caused the
   * supersession. Keeping it off the command is what stops the CLI and MCP
   * asking for a value neither of their callers has.
   */
  private async concludeOne(
    input: ConcludeCommand,
    because?: ReviewRef,
  ): Promise<RecordedAnalysis> {
    return this.graph.inTransaction(async () =>
      // **Its own mint scope, so a composition calling this keeps its own.**
      // `emit` drains what has been minted since the last event, and without a
      // scope that meant everything the enclosing verb had minted too — the
      // parent's edges carried off into the child's event. See
      // `TenantGraph.inMintScope`, which also records why suppressing the inner
      // event was the wrong fix.
      this.graph.inMintScope(async () => {
        const concluded = await this.concluding(input, because);
        const events = await this.emit("conclude", input.analysis, {
          conclusions: this.conclusionEvents([concluded]),
          ...(input.replacing === undefined ? {} : { replacing: input.replacing }),
        });
        return { analysis: input.analysis, claims: [concluded], events };
      }),
    );
  }

  /**
   * `conclude`'s work, without the event. **The compounds call this one.**
   *
   * `emit` DRAINS the ids and edges `TenantGraph` has minted since the last
   * event, which is what lets an act report what it brought into existence
   * without listing it. A nested emit therefore does not merely add an event —
   * it takes the parent's edges away. `recordAnalysis`'s event lost `PRODUCES`,
   * `RECORDED_IN` and `SUPPORTS` to the `conclude` events underneath it, and
   * `tests/event-store.test.ts` is what noticed.
   *
   * So the split is not tidiness. **A verb that composes others records one
   * event, not one per step** — `openEnquiry` is `pose` + `pursue` and emits
   * only `openEnquiry`, and this is that rule at a second call site. The event
   * stream is a record of research actions; five events for one call describes
   * the implementation.
   *
   * That does not contradict `conclude`'s own doc above. A researcher who
   * concludes four things in four calls did four things, and gets four events.
   * One who calls a compound made one call and gets one, with every conclusion
   * in its payload — the same distinction `pose` and `openEnquiry` already make.
   */
  private async concluding(
    input: ConcludeCommand,
    /**
     * The review this supersession rested on, when a compound had one.
     *
     * Not on `ConcludeCommand`, and that is a claim about the domain rather
     * than about plumbing: a researcher concluding one thing at a terminal is
     * not holding a review handle, and `replaceAnalysis` is the act that says
     * a review caused this. Row O's question is asked of a finding, so the
     * edge lands on the per-finding decision — see EDGE_SCHEMA.INVALIDATED_BY.
     */
    because?: ReviewRef,
  ): Promise<Required<ConcludedClaim>> {
    return this.graph.inTransaction(async () => {
      const at = this.clock.now();
      {
        const unit = await this.unitOf(input.analysis);
        const output = await this.outputArtefactOf(input.analysis);

        // Superseded analyses take no new conclusions. Adding one would put a
        // fresh finding on a record the caller has already declared spent, and
        // nothing downstream distinguishes it from a live one.
        const [artefact] = await this.graph.query(
          `MATCH (a:Artefact {natural_id: $id}) RETURN a`,
          { a: vertexProps<ArtefactProps>() },
          { id: output },
        );
        if (artefact?.a.invalidated)
          throw new Error(
            `analysis ${input.analysis} has been superseded and takes no further conclusions; ` +
              `record this on the analysis that replaced it`,
          );

        // What is being superseded, if anything — matched on whichever handle
        // the caller held; both come back from the act that recorded it.
        let superseded: RecordedConclusion | undefined;
        if (input.replacing !== undefined) {
          // **Scoped to the analysis this one revises, not to this one.** A
          // replacement supersedes findings of the analysis it replaced, so the
          // handle the caller holds belongs to the OLD analysis. The lineage
          // decision is what makes that reachable:
          // `new <-MOTIVATES- Decision -CHANGES-> old`.
          const revised = await this.revisedBy(input.analysis);
          if (revised === undefined)
            throw new Error(
              `analysis ${input.analysis} replaces nothing, so ${input.replacing} is not its ` +
                `to supersede; record a replacement first, or conclude without --replacing`,
            );
          const already = await this.conclusionsOf(revised);
          superseded = already.find(
            (c) => c.claim === input.replacing || c.evidence === input.replacing,
          );
          if (!superseded) {
            const named = already.length
              ? already.map((c) => `${c.claim} "${c.proposition}"`).join(", ")
              : "nothing at all";
            throw new Error(
              `analysis ${revised} did not conclude ${input.replacing}, so there is nothing ` +
                `here to supersede; it concluded: ${named}`,
            );
          }

          // **A finding falls once.** Naming `replacing` exempts this call from
          // the withdrawn-proposition guard below -- the act that supersedes a
          // finding is exactly the act allowed to restate it -- and without
          // this that exemption reached a finding somebody else had already
          // withdrawn. Two decisions would then stand instead of one claim,
          // each naming a different successor, and no reader can say which
          // holds: `withdrawalOf` picks whichever row it happens to see first.
          //
          // The refusal names the claim, not the wording.
          const gone = await this.supersessionOf(superseded.claim);
          if (gone)
            throw new Error(
              `${superseded.claim} has already been superseded (${gone}), and a finding is ` +
                `superseded once; supersede the finding that stands in its place, or record ` +
                `this conclusion without naming one`,
            );
        }

        // Inherited from what is being superseded, overridden when given. A
        // replacement restates the same proposition by default -- that is what
        // makes it a replacement rather than a new finding.
        const proposition = input.proposition ?? superseded?.proposition;
        if (proposition === undefined)
          throw new Error(
            `conclude needs the proposition this finding bears on and none was given; ` +
              `pass it, or pass the claim or finding being superseded so it can be inherited`,
          );
        const bearing = input.bearing ?? superseded?.bearing ?? "supports";

        // The same guard `recordAnalysis` applied per conclusion, now applied
        // where a conclusion is actually made. A withdrawn proposition cannot
        // be re-asserted as a side effect -- except by the act that supersedes
        // it, which is what `replacing` says.
        if (superseded === undefined) {
          const enquiry = await this.enquiryOf(input.analysis);
          const { withdrawn, replacedBy } = await this.withdrawalOf({
            proposition,
            ...(enquiry === undefined ? {} : { enquiry }),
          });
          if (withdrawn)
            throw new Error(
              `"${proposition}" was withdrawn${replacedBy ? ` in favour of "${replacedBy}"` : ""}; ` +
                `it cannot be re-asserted by recording another analysis`,
            );
        }

        const evidence = await this.graph.createNode("Evidence", { statement: input.finding });
        const claim = await this.graph.createNode("Claim", {
          name: proposition,
          kind: input.standing ?? "exploratory",
        });
        await this.graph.createEdge(unit, "PRODUCES", evidence.natural_id, undefined, true);
        await this.graph.createEdge(evidence.natural_id, "RECORDED_IN", output, undefined, true);
        await this.graph.createEdge(
          evidence.natural_id,
          bearing === "challenges" ? "CHALLENGES" : "SUPPORTS",
          claim.natural_id,
          undefined,
          true,
        );

        // Per-finding supersession, on the edges the model already has.
        if (superseded) {
          const decision = await this.graph.createNode("Decision", {
            decided_at: at,
            reason: `superseded by "${input.finding}"`,
            invalidation_check: "evidence that the superseded finding was right after all",
          });
          await this.graph.createEdge(decision.natural_id, "SUPERSEDES", superseded.claim);
          await this.graph.createEdge(decision.natural_id, "MOTIVATES", claim.natural_id);
          if (because !== undefined)
            await this.graph.createEdge(decision.natural_id, "INVALIDATED_BY", because);
        }

        return {
          claim: ref("claim", claim.natural_id),
          asserts: proposition,
          finding: ref("evidence", evidence.natural_id),
        };
      }
    });
  }

  /**
   * The analysis this one is a revision of, by way of the lineage decision.
   *
   * `new <-MOTIVATES- Decision -CHANGES-> old`. Lineage only: that this
   * analysis revises that one, never that the old one's findings fell. See the
   * `Computation` pair on `EDGE_SCHEMA.CHANGES`.
   */
  private async revisedBy(analysis: AnalysisRef): Promise<AnalysisRef | undefined> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:MOTIVATES]-(:Decision)-[:SUPERSEDES]->(old:Computation)
       RETURN old`,
      { old: vertexProps<{ natural_id: string }>() },
      { id: analysis },
    );
    const found = rows[0];
    return found ? ref("analysis", found.old.natural_id) : undefined;
  }

  /** The enquiry an analysis was recorded under, for the withdrawal guard's scope. */
  private async enquiryOf(analysis: AnalysisRef): Promise<EnquiryRef | undefined> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:ADDRESSES]->(l:LineOfEnquiry)
       RETURN l`,
      { l: vertexProps<{ natural_id: string }>() },
      { id: analysis },
    );
    const found = rows[0];
    return found ? ref("enquiry", found.l.natural_id) : undefined;
  }

  /** `{claim, finding, proposition}` per conclusion — the event's own record of the pairing, independent of the typed report. */
  private conclusionEvents(claims: ConcludedClaim[]): Record<string, unknown>[] {
    return claims.map((c) => ({ claim: c.claim, finding: c.finding, proposition: c.asserts }));
  }

  /**
   * Records a reviewer's finding about an analysis.
   *
   * The review attaches to the inferential activity (the evidence unit), not
   * to the execution that ran it — what gets criticized in S-11 is the
   * method, and nothing ran incorrectly. See EDGE_SCHEMA.EVALUATES.
   */
  async recordReview(input: RecordReviewCommand): Promise<RecordedReview> {
    return this.graph.inTransaction(async () => {
      const review = await this.graph.createNode("Review", {
        verdict: input.verdict,
      });
      await this.graph.createEdge(
        review.natural_id,
        "EVALUATES",
        await this.unitOf(input.of).then((u) => u),
      );
      const events = await this.emit("recordReview", ref("review", review.natural_id), {
        of: input.of,
        verdict: input.verdict,
      });
      return { review: ref("review", review.natural_id), events };
    });
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
  async closeEnquiry(input: CloseEnquiryCommand): Promise<ClosedEnquiry> {
    return this.graph.inTransaction(async () => {
      // Everything is validated before anything is written. A rejected close
      // must leave no Decision behind, and an analysis from some other enquiry
      // must not become the stated basis for resolving this question.
      const question = await this.questionBehind(input.enquiry);
      if (!question)
        throw new Error(
          `enquiry ${input.enquiry} has no motivating question to resolve; closure attaches to the question an enquiry pursues, so pursue one before closing`,
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
          `enquiry ${input.enquiry} is already closed by decision ` +
            `${alreadyResolved[0]!.d.natural_id} (${alreadyResolved[0]!.d.reason}); ` +
            `closing it again would leave two decisions resolving one question`,
        );
      }

      let answerBearing: EvidenceRef | undefined;
      let answeredProposition: string | undefined;
      if (input.answeredBy) {
        // The claim identifies itself; what still has to be checked is that it
        // belongs to THIS enquiry. One hop from the claim rather than a search
        // for a proposition.
        // BOTH bearings. A question answered "no" is answered on a finding that
        // CHALLENGES its proposition -- S-4's whole case -- and checking only
        // SUPPORTS rejected exactly the closure the scenario exists for.
        const addresses: unknown[] = [];
        for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
          addresses.push(
            ...(await this.graph.query(
              `MATCH (:Claim {natural_id: $claim})<-[:${bearing}]-(:Evidence)<-[:PRODUCES]-(:EvidenceUnit)-[:ADDRESSES]->(:LineOfEnquiry {natural_id: $enquiry})
               RETURN 1`,
              { ok: scalar<number>() },
              { claim: input.answeredBy, enquiry: input.enquiry },
            )),
          );
        }
        if (addresses.length === 0) {
          throw new Error(
            `claim ${input.answeredBy} does not belong to enquiry ${input.enquiry}; it cannot answer its question — cite a claim this enquiry concluded, or close the enquiry that concluded this one`,
          );
        }
        const found = await this.findingOn(input.answeredBy);
        if (!found) throw new Error(noFindingBearsOn(input.answeredBy));
        answerBearing = found.evidence;
        answeredProposition = found.asserts;
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
      const decision = await this.graph.inTransaction(async () => {
        const decision = await this.graph.createNode("Decision", {
          decided_at: this.clock.now(),
          reason: answeredProposition
            ? `answered on "${answeredProposition}"`
            : "closed without a cited result",
          invalidation_check: "new evidence bearing on the question",
        });
        await this.graph.createEdge(decision.natural_id, "RESOLVES", question);
        if (answerBearing)
          await this.graph.createEdge(decision.natural_id, "BASED_ON", answerBearing);
        return decision;
      });

      const events = await this.emit("closeEnquiry", input.enquiry, {
        answeredBy: input.answeredBy ?? null,
        proposition: answeredProposition ?? null,
      });
      return { decision: ref("decision", decision.natural_id), events };
    });
  }

  private async questionBehind(enquiry: EnquiryRef): Promise<QuestionRef | undefined> {
    const rows = await this.graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $id}) RETURN q`,
      { q: vertexProps<{ natural_id: string }>() },
      { id: enquiry },
    );
    const q = rows[0]?.q.natural_id;
    return q ? ref("question", q) : undefined;
  }

  // -------------------------------------------------------------------------
  // Gating
  // -------------------------------------------------------------------------

  /** Records a piece of work whose start a gate may protect. */
  async planWork(input: PlanWorkCommand): Promise<PlannedWork> {
    return this.graph.inTransaction(async () => {
      const task = await this.graph.createNode("Task", {
        objective: input.objective,
        mayRead: input.mayRead ?? [],
        outputs: "",
        acceptance: input.acceptance,
      });
      if (input.addressing)
        await this.graph.createEdge(task.natural_id, "ADDRESSES", input.addressing);
      const events = await this.emit("planWork", ref("work", task.natural_id), {
        objective: input.objective,
      });
      return { work: ref("work", task.natural_id), events };
    });
  }

  /** States a condition that must hold. Stating it is not evaluating it. */
  async stateCriterion(proposition: Prose): Promise<StatedCriterion> {
    return this.graph.inTransaction(async () => {
      const criterion = await this.graph.createNode("Criterion", {
        proposition,
      });
      const events = await this.emit("stateCriterion", ref("criterion", criterion.natural_id), {
        proposition,
      });
      return { criterion: ref("criterion", criterion.natural_id), events };
    });
  }

  /**
   * Declares a gate: a consequence attached to a criterion, protecting some
   * work. Declaring a gate must not make it satisfied — that is the entire
   * subject of S-17.
   */
  async declareGate(input: DeclareGateCommand): Promise<DeclaredGate> {
    return this.graph.inTransaction(async () => {
      if (input.governedBy.length === 0)
        throw new Error(
          "a gate needs at least one criterion to govern it: a gate enforces a condition, and one " +
            "governed by nothing could never be satisfied or blocked — name them in governedBy",
        );
      // And a gate protecting nothing is not a gate either. Before S-3b there
      // was no way to record a check that qualifies a finding without minting
      // one: `gateStatus()` then answered "what is blocked?" with `blocked` and
      // an empty `gating` list -- a control-plane object asserting a consequence
      // for work that does not exist. `recordAnalysis({ heldTo })` is how a
      // standard with nothing downstream is recorded now.
      if (input.protecting.length === 0)
        throw new Error(
          "a gate needs at least one piece of work to protect: a gate attaches a consequence to " +
            "work, and one protecting nothing asserts a consequence for work that does not exist " +
            "— name it in protecting, or hold the analysis to the criterion instead if nothing " +
            "downstream depends on it",
        );
      const gate = await this.graph.createNode("Gate", {
        consequence: input.consequence,
      });
      for (const criterion of input.governedBy) {
        await this.graph.createEdge(criterion, "GOVERNS", gate.natural_id);
      }
      for (const work of input.protecting) {
        await this.graph.createEdge(gate.natural_id, "GATES", work);
      }
      const events = await this.emit("declareGate", ref("gate", gate.natural_id), {
        governedBy: input.governedBy.map((c) => c),
        protecting: input.protecting.map((w) => w),
      });
      return { gate: ref("gate", gate.natural_id), events };
    });
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
  async evaluateCriterion(input: EvaluateCriterionCommand): Promise<EvaluatedCriterion> {
    return this.graph.inTransaction(async () => {
      if (input.gate) await this.assertCriterionGovernsGate(input.criterion, input.gate);
      // Same invariant class as `assertCriterionGovernsGate`, for the other job
      // a criterion can do: an evaluation that neither triggers a gate nor bears
      // on a finding held to it is durable nonsense no reader would ever surface.
      else await this.assertCriterionQualifiesSomething(input.criterion);
      let basis: EvidenceRef | undefined;
      if (input.citing) {
        const found = await this.findingOn(input.citing);
        if (!found) throw new Error(noFindingBearsOn(input.citing));
        basis = found.evidence;
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
        await this.graph.createEdge(input.criterion, "EVALUATED_AS", ev.natural_id);
        if (input.gate) await this.graph.createEdge(ev.natural_id, "TRIGGERS", input.gate);
        // What the verdict was reached against. `BASED_ON: CriterionEvaluation ->
        // Evidence` was declared in PJ-004 and never written until S-8; without
        // it, a condition established by measurement and one asserted by an agent
        // returned identical records. See PJ-008 row W.
        if (basis) await this.graph.createEdge(ev.natural_id, "BASED_ON", basis);
        return ev;
      });
      const events = await this.emit(
        "evaluateCriterion",
        ref("evaluation", evaluation.natural_id),
        {
          criterion: input.criterion,
          ...(input.gate ? { gate: input.gate } : {}),
          outcome: input.outcome,
        },
      );
      return { evaluation: ref("evaluation", evaluation.natural_id), events };
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
    return this.graph.inTransaction(async () => {
      const at = this.clock.now();
      // Atomic: without the second write the durable state is precisely S-10's
      // demonstrated wrong answer -- a second independent support standing where
      // a re-verification was meant. See TenantGraph.inTransaction.
      const verification = await this.graph.inTransaction(async () => {
        const original = await this.findingFor(input.historical, input.concludes.proposition);
        if (!original) {
          throw new Error(
            `analysis ${input.historical} concluded nothing about "${input.concludes.proposition}"; there is nothing to re-verify`,
          );
        }
        const { analysis } = await this.recorded({
          enquiry: input.enquiry,
          method: input.method,
          from: input.under,
        });
        return { analysis, original };
      });

      // The conclusion first, then the edge, then the emit: `emit` drains what
      // has been minted since the last event, so anything written after it
      // lands in the next act's event instead of this one.
      const concluded = await this.concluding({
        analysis: verification.analysis,
        proposition: input.concludes.proposition,
        finding: input.concludes.finding,
        ...(input.concludes.bearing === undefined ? {} : { bearing: input.concludes.bearing }),
        ...(input.concludes.standing === undefined ? {} : { standing: input.concludes.standing }),
      });

      // `REVERIFIES` is evidence-to-evidence and says the same proposition was
      // checked again -- deliberately NOT the supersession `conclude
      // --replacing` writes, which says a finding was replaced. Two different
      // claims about two different acts; see `conclude`'s header.
      await this.graph.createEdge(concluded.finding, "REVERIFIES", verification.original);

      const events = await this.emit("reverify", verification.analysis, {
        of: input.historical,
        proposition: input.concludes.proposition,
        conclusions: this.conclusionEvents([concluded]),
      });

      return {
        at,
        verification: verification.analysis,
        of: input.historical,
        claims: [concluded],
        events,
      };
    });
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
  async acceptAsUnresolved(input: AcceptAsUnresolvedCommand): Promise<AcceptedAsUnresolved> {
    return this.graph.inTransaction(async () => {
      const at = this.clock.now();
      const decision = await this.graph.inTransaction(async () => {
        const question = await this.questionBehind(input.enquiry);
        if (!question)
          throw new Error(
            `enquiry ${input.enquiry} pursues no question; an enquiry is opened against a question, and accepting it as unresolved leaves that question open on purpose`,
          );

        const found = await this.findingOn(input.inLightOf);
        if (!found) throw new Error(noFindingBearsOn(input.inLightOf));
        const basis = found.evidence;

        const decision = await this.graph.createNode("Decision", {
          decided_at: this.clock.now(),
          reason: input.because,
          invalidation_check: input.until,
        });
        await this.graph.createEdge(decision.natural_id, "DEFERS", question);
        // What was known when the call was made -- S-1's requirement, and the
        // reason `evidence` is answerable afterwards rather than only now.
        await this.graph.createEdge(decision.natural_id, "BASED_ON", basis);
        return decision;
      });

      const events = await this.emit("acceptAsUnresolved", input.enquiry, {
        because: input.because,
        until: input.until,
        at,
      });
      return { decision: ref("decision", decision.natural_id), events };
    });
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
  async promote(input: PromoteCommand): Promise<Promoted> {
    return this.graph.inTransaction(async () => {
      const decision = await this.graph.inTransaction(async () => {
        const claim = input.claim;
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
        return decision;
      });
      const events = await this.emit("promote", input.claim, {
        proposition: await this.assertedBy(input.claim),
      });
      return { decision: ref("decision", decision.natural_id), events };
    });
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
    return this.graph.inTransaction(async () => {
      const at = this.clock.now();

      // Everything validated before anything is written -- a rejected amendment
      // must not leave a decision recording a change that never happened.
      const existing = await this.graph.query(
        `MATCH (c:Criterion {natural_id: $id}) RETURN c`,
        { c: vertexProps<{ proposition: string }>() },
        { id: input.criterion },
      );
      const replaced = existing[0]?.c.proposition;
      if (!replaced)
        throw new Error(
          `no condition ${input.criterion} to amend; state the criterion first, or name one already on the record`,
        );

      const cited = await this.findingOn(input.citing);
      if (!cited) throw new Error(noFindingBearsOn(input.citing));
      const diagnosis = cited.evidence;

      const gates = await this.gatesGovernedBy(input.criterion);
      if (gates.length === 0) {
        throw new Error(
          `condition ${input.criterion} governs nothing; there is no locked design to amend`,
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
        { id: input.criterion },
      );
      if (alreadyAmended.length > 0) {
        throw new Error(
          `condition ${input.criterion} has already been amended; amend the one now in force`,
        );
      }

      const prior = await this.latestAmendmentOn(gates);

      // Atomic, for the same reason: interrupted after the replacement condition
      // governs the gate but before the original is retired, the gate is governed
      // by two conditions, one of which nobody agreed to. See
      // TenantGraph.inTransaction.
      const { replacement, decision } = await this.graph.inTransaction(async () => {
        const replacement = await this.graph.createNode("Criterion", {
          proposition: input.nowRequires,
        });
        for (const gate of gates)
          await this.graph.createEdge(replacement.natural_id, "GOVERNS", gate);

        const decision = await this.graph.createNode("Decision", {
          decided_at: this.clock.now(),
          reason: input.because,
          invalidation_check: "evidence that the amended setting was not the constraint after all",
        });
        await this.graph.createEdge(decision.natural_id, "CHANGES", input.criterion);
        await this.graph.createEdge(decision.natural_id, "BASED_ON", diagnosis);
        if (prior) await this.graph.createEdge(decision.natural_id, "SUPERSEDES", prior);
        return { replacement, decision };
      });

      const rerun = await this.workGatedBy(gates);
      const confirmatoryAffected = await this.confirmatoryResultsBehind(gates);

      const events = await this.emit("amendDesign", ref("decision", decision.natural_id), {
        criterion: input.criterion,
        replaced,
        nowRequires: input.nowRequires,
        supersedes: prior ?? null,
      });

      return {
        at,
        amendment: ref("decision", decision.natural_id),
        // `void replacement;` stood here: the amended criterion was created and
        // its handle thrown away, so the report named both conditions by wording
        // and a caller could reach neither.
        replaced: { criterion: input.criterion, requires: replaced ?? "" },
        nowRequires: {
          criterion: ref("criterion", replacement.natural_id),
          requires: input.nowRequires,
        },
        rerun,
        confirmatoryAffected,
        // Derived, never declared. An amendment is scientific exactly when
        // something the confirmatory boundary rests on is in its blast radius --
        // which is the difference between repairing a solver and moving the
        // goalposts, and is not a thing the person amending gets to assert.
        nature: confirmatoryAffected.length > 0 ? "scientific" : "mechanical",
        events,
      };
    });
  }

  private async gatesGovernedBy(criterion: CriterionRef): Promise<GateRef[]> {
    const rows = await this.graph.query(
      `MATCH (:Criterion {natural_id: $id})-[:GOVERNS]->(g:Gate) RETURN g`,
      { g: vertexProps<{ natural_id: string }>() },
      { id: criterion },
    );
    return [...new Set(rows.map((r) => r.g.natural_id))].map((id) => ref("gate", id));
  }

  /** The most recent amendment to this design — the one nothing has superseded yet. */
  private async latestAmendmentOn(gates: GateRef[]): Promise<DecisionRef | undefined> {
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
      if (latest) return ref("decision", latest);
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
    return this.graph.inTransaction(async () => {
      const at = this.clock.now();
      // Atomic, and this is the one that made transactions necessary rather than
      // tidy. Invalidating the superseded output is not an isolated write: since
      // S-3c it withdraws the criterion evaluations that cited it, so a failure
      // between the halves leaves an earlier failure no longer deciding its check
      // and no corrected check in existence. External review named it the
      // blocking finding; S-3c carries the negative test. See
      // TenantGraph.inTransaction.
      const {
        before,
        analysis: replacement,
        output: supersededOutput,
      } = await this.graph.inTransaction(async () => {
        await this.assertReviewOf(input.because, input.supersedes);
        const before = await this.conclusionsOf(input.supersedes);

        // **The superseded output is NOT invalidated.** A flag on the artefact
        // would summarise the standing of every finding it carries, and
        // standing is per finding: each `conclude --replacing` supersedes
        // exactly one, and coverage is which calls the caller made.
        const output = await this.outputArtefactOf(input.supersedes);
        // Which review this rested on, recorded rather than validated and
        // discarded (row O). `because` was checked against the analysis and then
        // written nowhere, so a reader asking why the finding no longer stands
        // got the verdict of an arbitrary review of the same unit -- and with a
        // critical review and a confirming one on one analysis, reported the
        // approval as the reason for the retraction. See
        // EDGE_SCHEMA.INVALIDATED_BY.
        await this.graph.createEdge(output, "INVALIDATED_BY", input.because);

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
        const { analysis } = await this.recorded({
          enquiry: input.enquiry,
          method: input.method,
          from: input.from,
        });

        // **The lineage link, and `replace` mints a Decision like every other
        // revision.** `reinterpret`'s shape, lifted one grain: the review
        // records that someone objected, the decision records that the
        // objection was acted on.
        //
        // It says *this analysis is a revision of that one* and nothing about
        // whether the old analysis's findings still stand -- see the
        // `Computation` pair on `EDGE_SCHEMA.CHANGES`, which carries the whole
        // discipline. Retraction is one grain lower, per finding.
        const lineage = await this.graph.createNode("Decision", {
          decided_at: at,
          reason: `superseded by a re-run: ${input.method}`,
          invalidation_check: "evidence that the superseded analysis was sound after all",
        });
        await this.graph.createEdge(lineage.natural_id, "SUPERSEDES", input.supersedes);
        await this.graph.createEdge(lineage.natural_id, "MOTIVATES", analysis);

        return { before, analysis, output };
      });

      // Both sides carry a handle. After a replacement two records assert each
      // sentence -- the withdrawn one and the fresh one -- so a report naming
      // only the wording leaves a reader unable to say which it means. `was`
      // comes from the superseded analysis, `claim` from the replacement, and
      // the replacement's claims are taken BY INDEX: `recorded()` mints one per
      // conclusion in order, so position is identity and a lookup keyed by the
      // sentence would collapse two conclusions phrased alike.
      //
      // The `before` match is by wording because it has to be -- the superseded
      // analysis's claims and the replacement's share no handle, and "the same
      // proposition, re-derived" is precisely what the caller asserts by passing
      // them.
      // Each conclusion names the finding it supersedes, so one the caller does
      // not restate is not superseded.
      //
      // **The pairing is resolved once and reused** by the report below. Two
      // derivations would key the emitted event's `replaced` list by
      // proposition while the SUPERSEDES edges follow the caller's
      // `replacing` -- and those disagree on any pair the wording cannot match.
      const claims: ConcludedClaim[] = [];
      const paired: (RecordedConclusion | undefined)[] = [];
      const replacementEvents: DomainEvent[] = [];
      for (const now of input.concludes) {
        // Explicit wins; the proposition match is the fallback the ordinary
        // re-run relies on. See `ReplacementConclusion.replacing`.
        //
        // **The fallback lives here and nowhere else.** `conclude` itself never
        // matches on text: a caller at the CLI or over MCP names the finding it
        // supersedes or supersedes nothing, because there the wording is the
        // agent's own and matching it would guess. This is a composition, where
        // the caller handed in a whole list to be paired.
        let was: RecordedConclusion | undefined;
        if (now.replacing === undefined) {
          // **Refuses rather than picks.** Two conclusions of one analysis may
          // assert the same sentence about different endpoints, so a wording
          // match can name two; taking the first is a coin toss recorded as a
          // fact.
          const candidates = before.filter((b) => b.proposition === now.proposition);
          if (candidates.length > 1)
            throw new Error(
              `analysis ${input.supersedes} concluded "${now.proposition}" more than once ` +
                `(${candidates.map((b) => b.claim).join(", ")}), so which one this replaces ` +
                `cannot be inferred from the wording; name it with 'replacing'`,
            );
          was = candidates[0];
        } else {
          was = before.find((b) => b.claim === now.replacing || b.evidence === now.replacing);
        }
        paired.push(was);
        const concluded = await this.concludeOne(
          {
            analysis: replacement,
            proposition: now.proposition,
            finding: now.finding,
            ...(was === undefined ? {} : { replacing: was.claim }),
            ...(now.bearing === undefined ? {} : { bearing: now.bearing }),
            ...(now.standing === undefined ? {} : { standing: now.standing }),
          },
          input.because,
        );
        claims.push(...concluded.claims);
        replacementEvents.push(...concluded.events);
      }

      const changed: ChangedConclusion[] = [];
      const unchanged: ConcludedClaim[] = [];
      for (const [i, now] of input.concludes.entries()) {
        const was = paired[i];
        const claim = claims[i]?.claim;
        if (!was || !claim) continue;
        if (was.finding === now.finding) unchanged.push({ claim, asserts: now.proposition });
        else
          changed.push({
            proposition: now.proposition,
            was: was.claim,
            before: was.finding,
            claim,
            after: now.finding,
          });
      }

      // The wording half. `what` was a naked id -- the inverse of the convention
      // every other pair follows, and unreadable without a second lookup.
      //
      // An analysis handle has to be dereferenced to its output artefact first:
      // the id is a `COMP_`, and looking THAT up as an artefact matches nothing
      // and silently fell back to printing the id. Same one hop `recorded()`
      // makes to write the CONSUMES edge.
      const inputNames = new Map<InputRef, IndexedString>();
      // **Which inputs this act retracted outright**, computed from what this
      // call did rather than queried: `before` is every conclusion the
      // superseded analysis drew and `paired` is the ones this call superseded,
      // so its output is retracted exactly when those agree. **Every, not
      // any** -- a partial replacement leaves standing findings in that
      // artefact, and it stays a live record.
      const supersededWhole =
        before.length > 0 && before.every((b) => paired.some((pr) => pr?.claim === b.claim));
      const retracted = new Set<InputRef>();
      // One query for every input, not one per input. `logical_name` is what an
      // Artefact carries; this read `.name` -- a property no Artefact has -- so it
      // set `undefined` and printed the id instead.
      const artefactFor = new Map<InputRef, ObservationsRef>();
      for (const o of input.from) {
        artefactFor.set(
          o,
          labelForNaturalId(o) === "Computation"
            ? await this.outputArtefactOf(o as AnalysisRef)
            : (o as ObservationsRef),
        );
      }
      const found = new Map(
        (
          await this.graph.query(
            `MATCH (a:Artefact) WHERE a.natural_id IN $ids RETURN a`,
            { a: vertexProps<ArtefactProps & { natural_id: string }>() },
            { ids: [...new Set(artefactFor.values())] },
          )
        ).map((r) => [r.a.natural_id, r.a] as const),
      );
      for (const [handle, artefact] of artefactFor) {
        const a = found.get(artefact);
        if (!a) continue;
        inputNames.set(handle, a.logical_name);
        if (supersededWhole && artefact === supersededOutput) retracted.add(handle);
      }

      // `why` is computed, not asserted. Two things had been wrong with the fixed
      // sentence: it said "observations" while `what` reports `kind: "analysis"`
      // for an analysis input, and for an input that IS the replaced analysis it
      // asserted the opposite of what the record says (S-11e).
      const unaffected: UnaffectedRecord[] = input.from.map((o) => ({
        what: o,
        ...(retracted.has(o) ? { invalidated: true as const } : {}),
        named: inputNames.get(o) ?? o,
        why: retracted.has(o)
          ? "produced by the replaced analysis and retracted by this replacement, which rests on it anyway"
          : "not produced by the replaced analysis, and the replacement rests on it",
      }));

      const affected = before.map((b) => ({
        claim: b.claim,
        asserts: b.proposition,
      }));
      const events = await this.emit("replaceAnalysis", replacement, {
        supersedes: input.supersedes,
        because: input.because,
        // Which findings this act replaced with which -- the sentence-level
        // pairing `changed` already computed, not a second lookup.
        replaced: changed.map((c) => ({
          proposition: c.proposition,
          was: c.was,
          before: c.before,
          claim: c.claim,
          after: c.after,
        })),
      });
      events.push(...replacementEvents);
      return {
        at,
        replacement,
        claims,
        affected,
        unaffected,
        changed,
        unchanged,
        events,
      };
    });
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
    return this.graph.inTransaction(async () => {
      const at = this.clock.now();

      // A reinterpretation narrows a READING, not one node. Two analyses in one
      // line of enquiry concluding the same sentence share a reading, and S-12
      // requires both to stop standing -- so the scope is still (proposition,
      // enquiry). What changed is that both now come FROM THE NAMED CLAIM
      // instead of being searched for, so nothing is guessed and the caller
      // cannot be surprised about which reading was narrowed.
      const scope = await this.scopeOf(input.of);
      const previously = scope.proposition;
      const claims = await this.graph.query(
        `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
         ${this.withinScope(scope)}
         RETURN c`,
        { c: vertexProps<{ natural_id: string }>() },
        {
          name: scope.proposition,
          ...this.scopeParams(scope),
        },
      );
      // Every record this act withdraws, by handle. The reading is one sentence
      // and the records asserting it are several -- reporting the sentence alone
      // left a caller unable to name which claims stopped standing, and reporting
      // one handle would have picked between them arbitrarily.
      const withdrawn: ConcludedClaim[] = [...new Set(claims.map((c) => c.c.natural_id))].map(
        (id) => ({ claim: ref("claim", id), asserts: previously }),
      );
      if (claims.length === 0)
        throw new Error(
          `no claim ${input.of} to reinterpret; a claim exists once an analysis concludes it`,
        );

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
          invalidation_check: "evidence that the original reading was right after all",
        });
        await this.graph.createEdge(decision.natural_id, "MOTIVATES", narrower.natural_id);

        // Keyed by id. The query below selects natural_id AND statement and only
        // the statement was kept, so two findings phrased alike merged -- in the
        // field whose whole job is showing the findings survived unchanged.
        const carried = new Map<EvidenceRef, CitedFinding>();
        const withdrawnIds = [...new Set(claims.map((c) => c.c.natural_id))];
        for (const id of withdrawnIds) {
          await this.graph.createEdge(review.natural_id, "EVALUATES", id);
          await this.graph.createEdge(decision.natural_id, "CHANGES", id);
        }
        // One query for every withdrawn claim's evidence, not one per claim.
        // Deduplicated by the Map below, as before: the query selects
        // `natural_id` AND `statement` and keying on the statement merged two
        // findings phrased alike -- in the field whose whole job is showing the
        // findings survived unchanged.
        const evidence = await this.graph.query(
          `MATCH (e:Evidence)-[:SUPPORTS]->(c:Claim) WHERE c.natural_id IN $ids RETURN e`,
          { e: vertexProps<{ natural_id: string; statement: string }>() },
          { ids: withdrawnIds },
        );
        for (const row of evidence) {
          await this.graph.createEdge(row.e.natural_id, "SUPPORTS", narrower.natural_id);
          const evidence = ref("evidence", row.e.natural_id);
          carried.set(evidence, { evidence, states: row.e.statement });
        }

        return { narrower, carried, review, decision };
      });

      const restingOnTheOldReading = await this.decidedOnTheStrengthOf(scope);

      const events = await this.emit("reinterpret", ref("claim", narrower.natural_id), {
        previously,
        because: input.because,
      });

      return {
        at,
        previously: withdrawn,
        // The narrower claim was minted here and its handle discarded -- the
        // eighth thing CLAUDE.md's "does the act record what it produced, or
        // only what it acted on?" has caught. A caller had to go back through
        // `claimsAsserting` to name what this very call had just created.
        nowClaims: {
          claim: ref("claim", narrower.natural_id),
          asserts: input.as,
        },
        evidenceStanding: [...carried.values()].sort((a, b) =>
          a.evidence.localeCompare(b.evidence),
        ),
        restingOnTheOldReading,
        requiresRecomputation: false,
        events,
      };
    });
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
   * today is always exactly one (CLAUDE.md: "a verb that composes others
   * records one event, not one per step"). The uniform shape is for the
   * caller: every write verb hands its own return value's `events` field
   * straight through from here, so a `--json` renderer or a future verb that
   * genuinely needs more than one event needs no new plumbing.
   */
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
      detail,
    });
    return [recorded];
  }
  /**
   * Why a claim no longer stands, or `undefined` if it does.
   *
   * **Both predicates, and AGE has no edge alternation** — `[:CHANGES|SUPERSEDES]`
   * is a syntax error, so this is two clauses. Naming one is silent: the row is
   * absent and the caller reads a withdrawn claim as standing.
   *
   * Claim grain, where `withdrawalOf` is proposition grain. The two answer
   * different questions and both are wanted: whether the record has stopped
   * asserting a sentence, and whether this particular finding has already
   * fallen.
   */
  private async supersessionOf(claim: ClaimRef): Promise<Prose | undefined> {
    const rows = await this.graph.query(
      `MATCH (c:Claim {natural_id: $id})
       OPTIONAL MATCH (narrowed:Decision)-[:CHANGES]->(c)
       OPTIONAL MATCH (replaced:Decision)-[:SUPERSEDES]->(c)
       RETURN narrowed, replaced`,
      {
        narrowed: optional(vertexProps<{ reason: string }>()),
        replaced: optional(vertexProps<{ reason: string }>()),
      },
      { id: claim },
    );
    return rows.map((r) => r.narrowed?.reason ?? r.replaced?.reason).find((r) => r !== undefined);
  }

  private async conclusionsOf(analysis: AnalysisRef): Promise<RecordedConclusion[]> {
    const rows = await this.graph.query(
      // Either bearing: an analysis whose findings all CHALLENGE returned no
      // conclusions at all, so replacing one reported nothing as affected.
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(u:EvidenceUnit)-[:PRODUCES]->(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(sc:Claim)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(cc:Claim)
       RETURN e, sc, cc`,
      {
        e: vertexProps<EvidenceProps & { natural_id: string }>(),
        sc: optional(vertexProps<ClaimProps & { natural_id: string }>()),
        cc: optional(vertexProps<ClaimProps & { natural_id: string }>()),
      },
      { id: analysis },
    );
    return rows.flatMap((r) => {
      const claim = r.sc ?? r.cc;
      return claim
        ? [
            {
              claim: ref("claim", claim.natural_id),
              proposition: claim.name,
              finding: r.e.statement,
              // The handle, beside the text. `conclude --replacing` takes
              // either a CLM_ or an EV_ and has to match on whichever it was
              // given; without this the evidence half was unaddressable.
              evidence: ref("evidence", r.e.natural_id),
              bearing: r.sc ? ("supports" as const) : ("challenges" as const),
            },
          ]
        : [];
    });
  }
  private async outputArtefactOf(analysis: AnalysisRef): Promise<ObservationsRef> {
    // One hop, via the computation's own PRODUCES -- the direct counterpart
    // to CONSUMES. This previously had to go out through the evidence unit.
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})-[:PRODUCES]->(a:Artefact)
       RETURN a`,
      { a: vertexProps<ArtefactProps & { natural_id: string }>() },
      { id: analysis },
    );
    const found = rows[0];
    if (!found)
      throw new Error(
        `analysis ${analysis} has no output record; every recorded analysis produces one, so this handle names something recorded another way`,
      );
    return ref("observations", found.a.natural_id);
  }

  private async assertCriterionGovernsGate(criterion: CriterionRef, gate: GateRef): Promise<void> {
    const rows = await this.graph.query(
      `MATCH (:Criterion {natural_id: $criterion})-[:GOVERNS]->(:Gate {natural_id: $gate}) RETURN 1`,
      { ok: scalar<number>() },
      { criterion: criterion, gate: gate },
    );
    if (rows.length === 0) {
      throw new Error(
        `criterion ${criterion} does not govern gate ${gate}; it cannot be evaluated for it`,
      );
    }
  }
  private async assertCriterionQualifiesSomething(criterion: CriterionRef): Promise<void> {
    const rows = await this.graph.query(
      `MATCH (:Criterion {natural_id: $criterion})-[:QUALIFIES]->(:EvidenceUnit) RETURN 1`,
      { ok: scalar<number>() },
      { criterion: criterion },
    );
    if (rows.length === 0) {
      throw new Error(
        `criterion ${criterion} gates no work and qualifies no finding; name the gate it is being evaluated for`,
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
  private async assertReviewOf(review: ReviewRef, analysis: AnalysisRef): Promise<void> {
    const rows = await this.graph.query(
      `MATCH (:Review {natural_id: $review})-[:EVALUATES]->(:EvidenceUnit)-[:USES]->(:Computation {natural_id: $analysis})
       RETURN 1`,
      { ok: scalar<number>() },
      { review: review, analysis: analysis },
    );
    if (rows.length === 0) {
      throw new Error(
        `review ${review} does not review analysis ${analysis}; it cannot justify replacing it`,
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
  private async unitOf(analysis: AnalysisRef): Promise<UnitRef> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(u:EvidenceUnit) RETURN u`,
      { u: vertexProps<{ natural_id: string }>() },
      { id: analysis },
    );
    const found = rows[0];
    if (!found)
      throw new Error(
        `analysis ${analysis} has no inferential unit; every recorded analysis has one, so this handle names something recorded another way`,
      );
    return ref("unit", found.u.natural_id);
  }
}
