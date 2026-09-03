/** Measuring, analysing, concluding, reviewing. */

import type { TenantGraph } from "../../db/graph";
import type {
  RecordedAnalysis,
  RecordedObservations,
  RecordedReview,
} from "../report";
import { ref } from "../report";
import type {
  ConcludeCommand,
  RecordAnalysisCommand,
  RecordObservationsCommand,
  RecordReviewCommand,
} from "../commands";
import { SessionCore, type ResearchSessionOptions } from "../core";
import type { Emit } from "./index";
import { asConcludedClaim, type Shared } from "./shared";

export class Work extends SessionCore {
  constructor(
    graph: TenantGraph,
    options: ResearchSessionOptions,
    private readonly emit: Emit,
    private readonly shared: Shared,
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
    return this.graph.inTransaction(async () => {
      // Atomic. A failure between the evidence and its unit writes *precisely*
      // the invariant this verb exists to prevent --
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
        // anything reads it: `EvidenceUnitRole` has one writer and no readers
        // anywhere in `src/`. An "observation" value was declined -- adding
        // vocabulary to a union nothing consumes is dead shape, and the no-cull
        // policy covers labels and edges, which are claims about the domain,
        // not property values. `experiment` is
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
   * `from` names the observations consumed, recorded as real execution lineage
   * (`CONSUMES`). A route back to inputs through the enquiry instead answers a
   * different question and produces a false inference in `whySupported()`. See
   * EDGE_SCHEMA.CONSUMES.
   */
  async recordAnalysis(input: RecordAnalysisCommand): Promise<RecordedAnalysis> {
    return this.graph.inTransaction(async () => {
      const { analysis } = await this.graph.inTransaction(() => this.shared.recorded(input));
      // An analysis with no conclusions yet emits exactly one event and is a
      // real state: `enquiry` prints "has produced nothing yet" and `known`
      // buckets it as worked-on-no-answer.
      const events = await this.emit("recordAnalysis", analysis, {
        enquiry: input.enquiry,
        method: input.method,
      });
      return { analysis, claims: [], events };
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

  /**
   * `conclude`'s work in its own mint scope. **The compounds call this one.**
   */
  private async concludeOne(input: ConcludeCommand): Promise<RecordedAnalysis> {
    return this.graph.inTransaction(async () =>
      // **Its own mint scope, so a composition calling this keeps its own.**
      // `emit` drains what has been minted since the last event, and without a
      // scope that meant everything the enclosing verb had minted too — the
      // parent's edges carried off into the child's event. See
      // `TenantGraph.inMintScope`, which also records why suppressing the inner
      // event was the wrong fix.
      this.graph.inMintScope(async () => {
        const concluded = await this.shared.concluding(input);
        const events = await this.emit("conclude", input.analysis, {
          conclusions: this.shared.conclusionEvents([concluded]),
          ...(input.replacing === undefined ? {} : { replacing: input.replacing }),
        });
        return { analysis: input.analysis, claims: [asConcludedClaim(concluded)], events };
      }),
    );
  }

  /**
   * Records a reviewer's finding about an analysis.
   *
   * The review attaches to the inferential activity (the evidence unit), not to
   * the execution that ran it: what a reviewer criticises is the method, and
   * nothing ran incorrectly. See EDGE_SCHEMA.EVALUATES.
   */
  async recordReview(input: RecordReviewCommand): Promise<RecordedReview> {
    return this.graph.inTransaction(async () => {
      const review = await this.graph.createNode("Review", {
        verdict: input.verdict,
      });
      await this.graph.createEdge(
        review.natural_id,
        "EVALUATES",
        await this.shared.unitOf(input.of).then((u) => u),
      );
      const events = await this.emit("recordReview", ref("review", review.natural_id), {
        of: input.of,
        verdict: input.verdict,
      });
      return { review: ref("review", review.natural_id), events };
    });
  }
}
