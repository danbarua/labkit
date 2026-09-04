/** Measuring, analysing, concluding, reviewing. */

import type { TenantGraph } from "../../db/graph";
import type { RecordedAnalysis, RecordedObservations, RecordedReview } from "../report";
import { ref } from "../report";
import type {
  ConcludeCommand,
  RecordAnalysisCommand,
  RecordObservationsCommand,
  RecordReviewCommand,
} from "../commands";
import type { ResearchSessionOptions } from "../core";
import type { Handle } from "./index";
import { asConcludedClaim, Shared, UnitOfWork } from "./shared";

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
    return this.handle<RecordedObservations>("recordObservations", input, async (unitOfWork) => {
      const artefact = await unitOfWork.node("Artefact", {
        kind: "observations",
        logical_name: input.name,
        ...(input.contentHash ? { content_hash: input.contentHash } : {}),
      });
      const evidence = await unitOfWork.node("Evidence", { statement: input.finding });
      // `role` is recorded because the property is not optional, not because
      // anything reads it: `EvidenceUnitRole` has one writer and no readers
      // anywhere in `src/`. `experiment` is the nearest existing value for a
      // measurement taken rather than inferred, and it is a placeholder until
      // something reads the field.
      const unit = await unitOfWork.node("EvidenceUnit", { role: "experiment" });
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
    return this.handle<RecordedAnalysis>("recordAnalysis", input, async (unitOfWork) => {
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
   * **The output artefact's `invalidated` flag is untouched.** A flag over the
   * whole artefact would summarise the standing of every finding it carries.
   * Standing is per finding, and `whySupported` computes it.
   */
  async conclude(input: ConcludeCommand): Promise<RecordedAnalysis> {
    return this.concludeOne(input);
  }

  private async concludeOne(input: ConcludeCommand): Promise<RecordedAnalysis> {
    return this.handle<RecordedAnalysis>("conclude", input, async (unitOfWork) => {
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
    return this.handle<RecordedReview>("recordReview", input, async (unitOfWork) => {
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
