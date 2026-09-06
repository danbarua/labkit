/** Measuring, analysing, concluding, reviewing. */

import { vertexProps } from "../../db/cypher";
import type { TenantGraph } from "../../db/graph";
import type {
  RecordedAnalysis,
  RecordedObservations,
  RecordedReview,
  Synthesised,
} from "../report";
import { ref } from "../report";
import type {
  ConcludeCommand,
  SynthesiseCommand,
  RecordAnalysisCommand,
  RecordObservationsCommand,
  RecordReviewCommand,
} from "../commands";
import type { ResearchSessionOptions } from "../core";
import type { Handle } from "./index";
import { asConcludedClaim, Shared } from "./shared";
import type { UnitOfWork } from "../projection";

export class Work extends Shared {
  constructor(
    graph: TenantGraph,
    options: ResearchSessionOptions,
    private readonly handle: Handle,
  ) {
    super(graph, options);
  }

  /**
   * Records raw observations — the durable measurements an analysis later
   * interprets. Kept distinct from the conclusions drawn from them: an
   * inference can be wrong while the observations it consumed remain fine.
   *
   * **Taking measurements is work, and this records it as such.** Without a
   * producing `EvidenceUnit` the `Evidence` has no producer at all, and
   * `whatIsKnown()` decides whether anyone has looked at a question from
   * `EvidenceUnit -ADDRESSES-> LineOfEnquiry` — so a question pursued only
   * through observations would report itself `untested`, meaning *nothing has
   * ever been run against it*. Populated, confident, and false.
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
    return this.handle("recordObservations", input, async (unitOfWork) => {
      const artefact = await unitOfWork.node("Artefact", {
        kind: "observations",
        logical_name: input.name,
        ...(input.contentHash ? { content_hash: input.contentHash } : {}),
      });
      const evidence = await unitOfWork.node("Evidence", { statement: input.finding });
      // A measurement taken, not an experiment run. Nothing reads the field
      // yet; what it says is true either way, and what a later reader finds
      // depends on what was written at this moment rather than on when the
      // reader arrived.
      const unit = await unitOfWork.node("EvidenceUnit", { role: "observation" });
      unitOfWork.edge(evidence, "RECORDED_IN", artefact);
      unitOfWork.edge(unit, "PRODUCES", evidence);
      unitOfWork.edge(unit, "ADDRESSES", input.enquiry);
      // The enquiry requires these observations -- a statement about the
      // enquiry, not about any analysis. What a given analysis actually read is
      // CONSUMES, drawn in recordAnalysis(); this edge no longer stands in for
      // it. REQUIRES says the enquiry depends on this evidence, ADDRESSES says
      // this work was done towards the enquiry, and `whatDependsOn()` reads the
      // first.
      unitOfWork.edge(input.enquiry, "REQUIRES", evidence);

      const observations = ref("observations", artefact);
      return {
        subject: observations,
        result: { observations },
      };
    });
  }

  /**
   * Records an analysis: a method applied to observations, yielding
   * conclusions. Creates the computation, the unit of work that ran it, the
   * artefact holding its output, and one finding + proposition per conclusion.
   *
   * `from` names the observations consumed, recorded as real execution lineage
   * (`CONSUMES`). A route back to inputs through the enquiry instead answers a
   * different question and produces a false inference in `whySupported()`. See
   * EDGE_SCHEMA.CONSUMES.
   */
  async recordAnalysis(input: RecordAnalysisCommand): Promise<RecordedAnalysis> {
    return this.handle("recordAnalysis", input, async (unitOfWork) => {
      const { analysis } = await this.recorded(input, unitOfWork);
      // An analysis with no conclusions yet emits exactly one event and is a
      // real state: `enquiry` prints "has produced nothing yet" and `known`
      // buckets it as worked-on-no-answer.
      return {
        subject: analysis,
        result: { analysis, claims: [] },
      };
    });
  }

  /**
   * Assert one thing an analysis found. **The primitive the compound verbs are
   * built from.**
   *
   * A conclusion is a research act of its own: a run draws its findings one at a
   * time, and each is recorded when it is reached.
   *
   * ## `replacing` names which finding this one stands in place of
   *
   * It does not supersede: by the time a successor's conclusions are recorded,
   * `keep` has already superseded everything it did not carry forward. This
   * says *which* superseded finding a new one replaces, so a reader does not
   * have to match on wording.
   *
   * The decision it mints writes `SUPERSEDES` to the old claim and `MOTIVATES`
   * to the new — not `CHANGES`, which means *the same evidence read
   * differently*. `REVERIFIES` is the other edge that looks right and is not:
   * it means the same proposition checked again.
   *
   * ## What is not written
   *
   * **Nothing is marked on the output artefact.** A flag over the whole
   * artefact would summarise the standing of every finding it carries.
   * Standing is per finding, and `whySupported` computes it. There was an
   * `Artefact.invalidated` property saying exactly that, unwritten by any verb
   * and read by three; it is gone.
   */
  async conclude(input: ConcludeCommand): Promise<RecordedAnalysis> {
    return this.concludeOne(input);
  }

  /**
   * Draws one finding across findings already on the record, running nothing.
   *
   * **No computation, no evidence unit, no evidence.** A synthesis takes
   * findings that exist and states what they say together; it measures
   * nothing, so there is nothing for `SUPPORTS` to come from. What the claim
   * rests on is the claims themselves, written as `RESTS_ON` at the moment the
   * act names them — `whySupported` reads them back.
   *
   * Recording it as an analysis was the alternative and it is worse: it mints
   * a `Computation` that never ran and `CONSUMES` edges to artefacts it never
   * read, which is a run the record would then report as reproducible.
   *
   * Under no line of enquiry, deliberately: the findings a synthesis draws
   * across need not share one. Bonsai's Stage 1D drew across four comparisons
   * recorded under two.
   */
  async synthesise(input: SynthesiseCommand): Promise<Synthesised> {
    return this.handle("synthesise", input, async (unitOfWork) => {
      if (input.restingOn.length === 0)
        throw new Error(
          "a synthesis needs at least one finding to rest on and was given none; " +
            "a claim that rests on nothing is one an analysis should conclude",
        );

      // Every cited claim, before anything is staged. A synthesis naming a
      // claim that does not exist would otherwise mint the claim and fail at
      // the edge, leaving a finding resting on less than it says.
      const found = await this.graph.query(
        `MATCH (c:Claim) WHERE c.natural_id IN $ids RETURN c`,
        { c: vertexProps<{ natural_id: string }>() },
        { ids: input.restingOn },
      );
      const present = new Set(found.map((r) => r.c.natural_id));
      const missing = input.restingOn.filter((c) => !present.has(c));
      if (missing.length > 0)
        throw new Error(
          `no claim ${missing.join(", ")} to rest on; a claim exists once an analysis has ` +
            `concluded it, and 'search' finds one by its wording`,
        );

      const claim = ref(
        "claim",
        await unitOfWork.node("Claim", { name: input.proposition, kind: "exploratory" }),
      );
      for (const on of new Set(input.restingOn)) unitOfWork.edge(claim, "RESTS_ON", on);

      return { subject: claim, result: { claim } };
    });
  }

  private async concludeOne(input: ConcludeCommand): Promise<RecordedAnalysis> {
    return this.handle("conclude", input, async (unitOfWork) => {
      const concluded = await this.concluding(input, unitOfWork);

      return {
        subject: input.analysis,
        result: { analysis: input.analysis, claims: [asConcludedClaim(concluded)] },
      };
    });
  }

  /**
   * Records a reviewer's finding about an analysis.
   *
   * The review attaches to the inferential activity (the evidence unit), not to
   * the execution that ran it: what a reviewer criticises is the method, and
   * nothing ran incorrectly. See EDGE_SCHEMA.EVALUATES.
   */
  async recordReview(input: RecordReviewCommand): Promise<RecordedReview> {
    return this.handle("recordReview", input, async (unitOfWork) => {
      const unit = await this.unitOf(input.of);

      const review = ref("review", await unitOfWork.node("Review", { verdict: input.verdict }));
      unitOfWork.edge(review, "EVALUATES", unit);

      return {
        subject: review,
        result: { review },
      };
    });
  }
}
