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
   * Records raw observations — the durable measurements an analysis later interprets. Kept
   * distinct from the conclusions drawn from them: an inference can be wrong while the
   * observations it consumed remain fine.
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
      // The enquiry requires these observations -- a statement about the enquiry, not about any
      // analysis. What a given analysis actually read is CONSUMES, drawn in recordAnalysis();
      // this edge no longer stands in for it.
      unitOfWork.edge(input.enquiry, "REQUIRES", evidence);

      const observations = ref("observations", artefact);
      return {
        subject: observations,
        result: { observations },
      };
    });
  }

  /**
   * Records an analysis: a method applied to observations, yielding conclusions. Creates the
   * computation, the unit of work that ran it, the artefact holding its output, and one finding
   * + proposition per conclusion.
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
   * Assert one thing an analysis found. **The primitive the compound verbs are built from.**
   */
  async conclude(input: ConcludeCommand): Promise<RecordedAnalysis> {
    return this.concludeOne(input);
  }

  /**
   * Draws one finding across findings already on the record, running nothing.
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
