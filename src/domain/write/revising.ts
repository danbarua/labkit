/** Same thing, understood differently now. */

import { scalar, vertexProps } from "../../db/cypher";
import type { ClaimProps } from "../../db/domain";
import type { TenantGraph } from "../../db/graph";
import type {
  AnalysisRef,
  CitedFinding,
  ClaimRef,
  ConcludedClaim,
  EnquiryRef,
  EvidenceRef,
  ObservationsRef,
  ReinterpretationReport,
  ReplacementReport,
  Restated,
  ReviewRef,
  VerificationReport,
} from "../report";
import { ref } from "../report";
import type {
  ClaimState,
  IsCommand,
  KeepCommand,
  ReinterpretCommand,
  ReplaceAnalysisCommand,
  ReverifyCommand,
} from "../commands";
import { SessionCore, type ResearchSessionOptions } from "../core";
import type { Emit } from "./index";
import { asConcludedClaim, type Shared } from "./shared";

/**
 * The `Claim.kind` each state is stored as.
 *
 * `confirmed` is the researcher's word and `confirmatory` is the stored one,
 * which is not a translation layer creeping in: the property predates the verb
 * and every read already branches on its value, so renaming it would be a data
 * migration bought with nothing. The map is here so the two words meet in one
 * place rather than at each write.
 */
const STORED_KIND: Record<ClaimState, NonNullable<ClaimProps["kind"]>> = {
  undecided: "undecided",
  confirmed: "confirmatory",
};

/** What would make a decision of each class wrong. */
const INVALIDATION_CHECK: Record<ClaimState, string> = {
  undecided: "a further finding that settles the proposition either way",
  confirmed: "evidence that the promoted result does not replicate",
};

export class Revising extends SessionCore {
  constructor(
    graph: TenantGraph,
    options: ResearchSessionOptions,
    private readonly emit: Emit,
    private readonly shared: Shared,
  ) {
    super(graph, options);
  }

  /**
   * Records that a historical result was re-checked, without claiming its run
   * was reproduced.
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
      // Atomic: without the second write the durable state is a second
      // independent support standing where a re-verification was meant. See
      // TenantGraph.inTransaction.
      // **One hop, inferred rather than restated.** The analysis being
      // re-checked knows the enquiry it was recorded under, so a caller who
      // named the analysis has already said which one. An explicit `enquiry`
      // wins: a re-check may legitimately belong to a different line of
      // enquiry than the analysis it re-checks, and only the caller knows that.
      const enquiry = input.enquiry ?? (await this.shared.enquiryOf(input.historical));
      if (!enquiry)
        throw new Error(
          `analysis ${input.historical} is under no line of enquiry, so there is none to ` +
            `infer; name one with the enquiry this re-check belongs to`,
        );

      const verification = await this.graph.inTransaction(async () => {
        const original = await this.findingFor(input.historical, input.concludes.proposition);
        if (!original) {
          throw new Error(
            `analysis ${input.historical} concluded nothing about "${input.concludes.proposition}"; there is nothing to re-verify`,
          );
        }
        const { analysis } = await this.shared.recorded({
          enquiry,
          method: input.method,
          from: input.under,
        });
        return { analysis, original };
      });

      // The conclusion first, then the edge, then the emit: `emit` drains what
      // has been minted since the last event, so anything written after it
      // lands in the next act's event instead of this one.
      const concluded = await this.shared.concluding({
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
        conclusions: this.shared.conclusionEvents([concluded]),
      });

      return {
        at,
        verification: verification.analysis,
        of: input.historical,
        claims: [asConcludedClaim(concluded)],
        events,
      };
    });
  }

  /**
   * Puts a claim into a state its evidence does not carry, and records what
   * put it there.
   *
   * **The state is on the claim, not on a third kind of edge.** A finding that
   * settles nothing is not a third direction for evidence to point — AGE has
   * no edge alternation, so every clause reaching a claim already spells
   * `SUPPORTS` and `CHALLENGES` separately, and a third label would have to be
   * added to each of them with silence as the failure mode. `promote` is the
   * shape this follows: mint the deciding act, connect it, set the property.
   *
   * The Decision carries `GRADES`, not `CHANGES`: `supersededClaim()` reads
   * every `CHANGES` into a claim as that claim no longer standing, and a
   * finding recorded as undecided is not withdrawn — it is real, and it still
   * rests under the claim.
   */
  async is(input: IsCommand): Promise<Restated> {
    return this.graph.inTransaction(async () => {
      const written = await this.graph.inTransaction(async () => {
        const decision = await this.graph.createNode("Decision", {
          decided_at: this.clock.now(),
          reason: input.state === "confirmed" ? input.because : `recorded as ${input.state}`,
          invalidation_check: INVALIDATION_CHECK[input.state],
        });
        // **`confirmed` writes exactly what `promote` writes.** The two are one
        // act spelled two ways, so they must leave one record; a reader able to
        // tell which verb was typed is the leak the single grammar exists to
        // close. `undecided` has no act-specific edge and takes `GRADES`.
        if (input.state === "confirmed") {
          await this.graph.createEdge(decision.natural_id, "PROMOTES", input.claim);
        } else {
          await this.graph.createEdge(decision.natural_id, "GRADES", input.claim);
          await this.graph.createEdge(decision.natural_id, "BASED_ON", input.because);
        }
        // Read before the write, so the event can say what the state moved
        // from -- the act overwrites `kind` in place, exactly as `promote`
        // does, and afterwards nothing holds the value it replaced.
        const [existing] = await this.graph.query(
          `MATCH (c:Claim {natural_id: $id}) RETURN c`,
          { c: vertexProps<ClaimProps>() },
          { id: input.claim },
        );
        await this.graph.query(
          `MATCH (c:Claim {natural_id: $id}) SET c.kind = $state RETURN c`,
          { c: vertexProps<ClaimProps>() },
          { id: input.claim, state: STORED_KIND[input.state] },
        );
        return { decision, was: existing?.c.kind ?? "exploratory" };
      });
      const events = await this.emit("is", input.claim, {
        proposition: await this.assertedBy(input.claim),
        from: written.was,
        to: STORED_KIND[input.state],
        // The act's own word, beside the property it wrote. `to` is the stored
        // kind so it pairs with `from`; `state` is what the caller said, and it
        // is what decides whether `because` is a handle or a sentence.
        state: input.state,
        because: input.because,
      });
      return { decision: ref("decision", written.decision.natural_id), events };
    });
  }

  /**
   * "Replace the analysis, mark the prior inference superseded, and propagate
   * whatever claims change." One instruction in the conversation, so one verb
   * here — it invalidates the old analysis's output, records the replacement
   * against the same observations, and returns what moved.
   *
   * The observations are deliberately untouched: only the artefact holding the
   * old analysis's OUTPUT is invalidated. An inference can be wrong while the
   * measurements it read remain fine.
   */
  async replaceAnalysis(input: ReplaceAnalysisCommand): Promise<ReplacementReport> {
    return this.revise({ ...input, keeping: [] }, "replaceAnalysis");
  }

  /**
   * Revises an analysis by naming the conclusions that survive.
   *
   * Everything else that analysis concluded is superseded here, at this moment,
   * rather than one `conclude --replacing` at a time. A caller who forgets an
   * entry supersedes something still true — visible in the answer — where
   * forgetting to supersede leaves something stale reading as current.
   *
   * The kept claims identify the analysis, so they must come from one.
   */
  async keep(input: KeepCommand): Promise<ReplacementReport> {
    if (input.keeping.length === 0)
      throw new Error(
        `keep needs at least one conclusion to carry forward and was given none; ` +
          `name the claims that survive, or use 'replace' to supersede an analysis whole`,
      );
    const spans = await this.analysesConcluding(input.keeping);
    if (spans.length !== 1)
      throw new Error(
        spans.length === 0
          ? `no analysis concluded ${input.keeping.join(", ")}; keep carries forward conclusions ` +
              `of the analysis being revised, and 'why' on a claim names the analysis that drew it`
          : `${input.keeping.join(", ")} were concluded by ${spans.join(" and ")}, and a revision ` +
              `revises one analysis; keep the claims of one of them`,
      );
    return this.revise({ ...input, supersedes: spans[0]! }, "keep");
  }

  /** The analyses that concluded these claims — one entry per distinct analysis. */
  private async analysesConcluding(claims: ClaimRef[]): Promise<AnalysisRef[]> {
    const found = new Set<string>();
    // Both bearings: a claim reached by a challenging finding was concluded by
    // the analysis that challenged it, exactly as a supporting one was.
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (c:Claim) WHERE c.natural_id IN $ids
         MATCH (e:Evidence)-[:${bearing}]->(c)
         MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
         MATCH (u)-[:USES]->(comp:Computation)
         RETURN comp`,
        { comp: vertexProps<{ natural_id: string }>() },
        { ids: claims },
      );
      for (const row of rows) found.add(row.comp.natural_id);
    }
    return [...found].sort().map((id) => ref("analysis", id));
  }

  /** What an analysis consumed, so a revision of it inherits the same inputs. */
  private async inputsOf(analysis: AnalysisRef): Promise<ObservationsRef[]> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})-[:CONSUMES]->(a:Artefact)
       RETURN a`,
      { a: vertexProps<{ natural_id: string }>() },
      { id: analysis },
    );
    return rows.map((r) => ref("observations", r.a.natural_id));
  }

  /** `keep` and `replaceAnalysis`, which differ only in how much they carry forward. */
  private async revise(
    input: KeepCommand & { supersedes: AnalysisRef },
    /**
     * Which act the caller performed. **Taken from the caller, not fixed
     * here**: `keep` and `replace` share this implementation and are different
     * acts — one carries conclusions forward, the other supersedes every one
     * of them — so a log that named them alike could not tell them apart.
     */
    operation: "keep" | "replaceAnalysis",
  ): Promise<ReplacementReport> {
    return this.graph.inTransaction(async () => {
      const at = this.clock.now();
      const {
        analysis: replacement,
        decision,
        superseded,
      } = await this.graph.inTransaction(async () => {
        await this.assertReviewOf(input.because, input.supersedes);

        // The superseded output is not invalidated. A flag on the artefact
        // would summarise the standing of every finding it carries, and
        // standing is per finding.
        const output = await this.shared.outputArtefactOf(input.supersedes);
        await this.graph.createEdge(output, "INVALIDATED_BY", input.because);

        // Add-only: the successor reads what its predecessor read, plus
        // whatever this call names.
        const inherited = await this.inputsOf(input.supersedes);
        const { analysis } = await this.shared.recorded({
          enquiry: (await this.shared.enquiryOf(input.supersedes)) as EnquiryRef,
          method: input.method,
          from: [...inherited, ...(input.from ?? [])],
        });

        // **One decision carries the whole act**: this analysis stands in
        // place of that one, on this review, superseding these findings and
        // keeping those. A reader of the decision sees all of it.
        const decision = await this.graph.createNode("Decision", {
          decided_at: at,
          reason: `superseded by a re-run: ${input.method}`,
          invalidation_check: "evidence that the superseded analysis was sound after all",
        });
        await this.graph.createEdge(decision.natural_id, "SUPERSEDES", input.supersedes);
        await this.graph.createEdge(decision.natural_id, "MOTIVATES", analysis);
        await this.graph.createEdge(decision.natural_id, "INVALIDATED_BY", input.because);

        // Every conclusion not kept falls now. A kept one is **not
        // re-parented**: it keeps the evidence that produced it, so asking
        // why it holds still answers with the run that produced the number.
        const kept = new Set<string>(input.keeping);
        const before = await this.shared.conclusionsOf(input.supersedes);
        const superseded: ConcludedClaim[] = [];
        for (const c of before) {
          if (kept.has(c.claim)) {
            await this.graph.createEdge(decision.natural_id, "KEEPS", c.claim);
            continue;
          }
          // **A finding falls once.** One already withdrawn by another act --
          // narrowed by a reinterpretation, superseded by an earlier revision --
          // cannot fall again here: two decisions would stand instead of one
          // claim, each naming a different successor, and no reader can say
          // which holds.
          const gone = await this.shared.supersessionOf(c.claim);
          if (gone !== undefined)
            throw new Error(
              `${c.claim} "${c.proposition}" has already been withdrawn by ${gone}, so this ` +
                `revision cannot supersede it as well and a finding falls once; keep it, ` +
                `since it no longer stands on its own account`,
            );
          await this.graph.createEdge(decision.natural_id, "SUPERSEDES", c.claim);
          superseded.push({ claim: c.claim, asserts: c.proposition });
        }

        return { analysis, decision: ref("decision", decision.natural_id), superseded };
      });

      const events = await this.emit(operation, replacement, {
        supersedes: input.supersedes,
        because: input.because,
        keeping: input.keeping,
      });
      return {
        at,
        replacement,
        decision,
        supersedes: input.supersedes,
        kept: input.keeping,
        superseded,
        events,
      };
    });
  }

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

      // A reinterpretation narrows a READING, not one node: two analyses in one
      // line of enquiry concluding the same sentence share a reading, and both
      // stop standing. So the scope is (proposition, enquiry) -- but reached
      // from the named claim rather than searched for, so nothing is guessed
      // about which reading was narrowed.
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
        // The act records what it produced: without this a caller has to go
        // back through `claimsAsserting` to name what this very call created.
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
}
