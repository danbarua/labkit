/** Same thing, understood differently now. */

import { scalar, vertexProps } from "../../db/cypher";
import type { ClaimProps } from "../../db/domain";
import type { TenantGraph } from "../../db/graph";
import { createdIn, edgesIn } from "../events";
import type {
  AnalysisRef,
  CitedFinding,
  ClaimRef,
  ConcludedClaim,
  EnquiryRef,
  EvidenceRef,
  Kind,
  ObservationsRef,
  Ref,
  ReinterpretationReport,
  ReplacementReport,
  Restated,
  ReviewRef,
  Undone,
  VerificationReport,
} from "../report";
import { kindOf, ref } from "../report";
import type {
  ClaimState,
  IsCommand,
  KeepCommand,
  ReinterpretCommand,
  ReplaceAnalysisCommand,
  ReverifyCommand,
  UndoCommand,
} from "../commands";
import type { ResearchSessionOptions } from "../core";
import type { Handle } from "./index";
import { asConcludedClaim, Shared } from "./shared";
import type { UnitOfWork } from "../projection";

/** A handle whose specific kind is not known in advance — any id this record minted. */
const anyRef = (id: string): Ref<Kind> => ref((kindOf(id) ?? id) as Kind, id);

/**
 * The `Claim.kind` each state is stored as.
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

export class Revising extends Shared {
  constructor(
    graph: TenantGraph,
    options: ResearchSessionOptions,
    private readonly handle: Handle,
  ) {
    super(graph, options);
  }

  /**
   * Records that a historical result was re-checked, without claiming its run was reproduced.
   */
  async reverify(input: ReverifyCommand): Promise<VerificationReport> {
    return this.handle("reverify", input, async (unitOfWork) => {
      const at = this.clock.now();
      // **One hop, inferred rather than restated.** The analysis being
      // re-checked knows the enquiry it was recorded under, so a caller who
      // named the analysis has already said which one. An explicit `enquiry`
      // wins: a re-check may legitimately belong to a different line of
      // enquiry than the analysis it re-checks, and only the caller knows that.
      const enquiry = input.enquiry ?? (await this.enquiryOf(input.historical));
      if (!enquiry)
        throw new Error(
          `analysis ${input.historical} is under no line of enquiry, so there is none to ` +
            `infer; name one with the enquiry this re-check belongs to`,
        );

      const original = await this.findingFor(input.historical, input.concludes.proposition);
      if (!original) {
        throw new Error(
          `analysis ${input.historical} concluded nothing about "${input.concludes.proposition}"; there is nothing to re-verify`,
        );
      }

      const { analysis, unit, output } = await this.recorded(
        { enquiry, method: input.method, from: input.under },
        unitOfWork,
      );

      // The analysis this conclusion hangs off is in the same delta, so its
      // unit, output and enquiry are handed over rather than queried for.
      const concluded = await this.concluding(
        {
          analysis,
          proposition: input.concludes.proposition,
          finding: input.concludes.finding,
          ...(input.concludes.bearing === undefined ? {} : { bearing: input.concludes.bearing }),
          ...(input.concludes.standing === undefined ? {} : { standing: input.concludes.standing }),
        },
        unitOfWork,
        { unit, output, enquiry },
      );

      // `REVERIFIES` is evidence-to-evidence and says the same proposition was
      // checked again -- deliberately NOT the supersession `conclude
      // --replacing` writes, which says a finding was replaced. Two different
      // claims about two different acts; see `conclude`'s header.
      unitOfWork.edge(concluded.finding, "REVERIFIES", original);

      return {
        subject: analysis,
        result: {
          at,
          verification: analysis,
          of: input.historical,
          claims: [asConcludedClaim(concluded)],
        },
      };
    });
  }

  /**
   * Puts a claim into a state its evidence does not carry, and records what put it there.
   */
  async is(input: IsCommand): Promise<Restated> {
    return this.handle("is", input, async (unitOfWork) => {
      // Read before the delta is stated, so the event can say what the state
      // moved from -- the act overwrites `kind` in place, and afterwards
      // nothing holds the value it replaced.
      const [existing] = await this.graph.query(
        `MATCH (c:Claim {natural_id: $id}) RETURN c`,
        { c: vertexProps<ClaimProps>() },
        { id: input.claim },
      );
      const was = existing?.c.kind ?? "exploratory";
      const proposition = await this.assertedBy(input.claim);

      const decision = ref(
        "decision",
        await unitOfWork.node("Decision", {
          decided_at: this.clock.now(),
          reason: input.state === "confirmed" ? input.because : `recorded as ${input.state}`,
          invalidation_check: INVALIDATION_CHECK[input.state],
        }),
      );
      // **`confirmed` writes exactly what `promote` writes.** The two are one
      // act spelled two ways, so they must leave one record; a reader able to
      // tell which verb was typed is the leak the single grammar exists to
      // close. `undecided` has no act-specific edge and takes `GRADES`.
      if (input.state === "confirmed") {
        unitOfWork.edge(decision, "PROMOTES", input.claim);
      } else {
        unitOfWork.edge(decision, "GRADES", input.claim);
        unitOfWork.edge(decision, "BASED_ON", input.because);
      }
      unitOfWork.set(input.claim, { kind: STORED_KIND[input.state] });

      return {
        subject: input.claim,
        result: { decision },
      };
    });
  }

  /**
   * Takes back a mistaken act, naming the event it recorded.
   */
  async undo(input: UndoCommand): Promise<Undone> {
    return this.handle("undo", input, async (unitOfWork) => {
      // `since: event - 1, limit: 1` rather than an exact-seq filter: `seq` is per-tenant but
      // the underlying sequence is shared across tenants (see `DomainEvent.seq`'s own doc
      // comment), so a gap at this tenant's next number is a real, ordinary case and not a bug
      // — checked explicitly rather than trusted, because a `since` filter finds the *next*
      // event whether or not this one exists.
      const [found] = await this.events.select({ since: input.event - 1, limit: 1 });
      if (found?.seq !== input.event)
        throw new Error(`no event ${input.event}; 'labkit happened' names the acts on the record`);

      const retracting = createdIn(found);
      if (retracting.length === 0)
        throw new Error(
          `event ${input.event} (${found.operation}) minted nothing to retract; there is no ` +
            `node this verb can hide, and an edge alone has no natural id of its own to mark`,
        );

      const propsSet = found.changes.some((c) => c.change === "PropsChanged");
      if (propsSet)
        throw new Error(
          `event ${input.event} (${found.operation}) set a property in place and has nothing ` +
            `recorded to set it back to; this verb can retract what an act created, not undo ` +
            `a value it overwrote`,
        );

      // What rests on any of this, from outside the act itself -- an edge between two things
      // this same event created is the act's own wiring, not a dependent. Unlabeled on both
      // sides deliberately: a dependent can be any kind of node, and naming one label would
      // silently miss every other.
      const into = await this.graph.query(
        `MATCH (external)-[r]->(target)
         WHERE target.natural_id IN $ids AND NOT external.natural_id IN $ids
         RETURN external AS origin, type(r) AS via, target AS reaches`,
        {
          origin: vertexProps<{ natural_id: string }>(),
          via: scalar<string>(),
          reaches: vertexProps<{ natural_id: string }>(),
        },
        { ids: retracting },
      );
      const outOf = await this.graph.query(
        `MATCH (source)-[r]->(external)
         WHERE source.natural_id IN $ids AND NOT external.natural_id IN $ids
         RETURN source AS origin, type(r) AS via, external AS reaches`,
        {
          origin: vertexProps<{ natural_id: string }>(),
          via: scalar<string>(),
          reaches: vertexProps<{ natural_id: string }>(),
        },
        { ids: retracting },
      );
      // An edge THIS event wrote is the act's own wiring even when one of its two endpoints
      // already existed -- `conclude` staging `unit PRODUCES evidence` reaches a pre-existing
      // unit, and that unit is not a dependent of the evidence it produced.
      const ownEdges = new Set(edgesIn(found).map((e) => `${e.from}|${e.label}|${e.to}`));
      const dependents = [...into, ...outOf].filter(
        (d) => !ownEdges.has(`${d.origin.natural_id}|${d.via}|${d.reaches.natural_id}`),
      );
      if (dependents.length > 0) {
        const named = dependents
          .map(
            (d) => `${anyRef(d.origin.natural_id)} -[${d.via}]-> ${anyRef(d.reaches.natural_id)}`,
          )
          .join(", ");
        throw new Error(
          `event ${input.event} (${found.operation}) cannot be undone: ${named} rests on what ` +
            `it created; retracting it would silently change what that depends on`,
        );
      }

      for (const id of retracting) unitOfWork.set(id, { retracted: true });

      return {
        subject: anyRef(found.subject),
        result: { event: input.event, retracted: retracting.map(anyRef) },
      };
    });
  }

  /**
   * Replaces an analysis, supersedes the inference it stood on, and returns what moved.
   *
   * One instruction, so one verb. The replacement is recorded against the same observations.
   */
  async replaceAnalysis(input: ReplaceAnalysisCommand): Promise<ReplacementReport> {
    return this.revise({ ...input, keeping: [] }, "replaceAnalysis");
  }

  /**
   * Revises an analysis by naming the conclusions that survive.
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
     * Which act the caller performed.
     */
    operation: "keep" | "replaceAnalysis",
  ): Promise<ReplacementReport> {
    return this.handle(operation, input, async (unitOfWork) => {
      const at = this.clock.now();

      await this.assertReviewOf(input.because, input.supersedes);
      const output = await this.outputArtefactOf(input.supersedes);
      const inherited = await this.inputsOf(input.supersedes);
      const enquiry = (await this.enquiryOf(input.supersedes)) as EnquiryRef;
      const before = await this.conclusionsOf(input.supersedes);

      // **A finding falls once.** One already withdrawn by another act --
      // narrowed by a reinterpretation, superseded by an earlier revision --
      // cannot fall again here: two decisions would stand instead of one
      // claim, each naming a different successor, and no reader can say
      // which holds.
      const kept = new Set<string>(input.keeping);
      for (const c of before) {
        if (kept.has(c.claim)) continue;
        const gone = await this.supersessionOf(c.claim);
        if (gone !== undefined)
          throw new Error(
            `${c.claim} "${c.proposition}" has already been withdrawn by ${gone}, so this ` +
              `revision cannot supersede it as well and a finding falls once; keep it, ` +
              `since it no longer stands on its own account`,
          );
      }

      // An edge to the review that found it wanting, not a flag on the
      // artefact: a flag would summarise the standing of every finding the
      // artefact carries, and standing is per finding.
      unitOfWork.edge(output, "INVALIDATED_BY", input.because);

      // Add-only: the successor reads what its predecessor read, plus
      // whatever this call names.
      const { analysis: replacement } = await this.recorded(
        { enquiry, method: input.method, from: [...inherited, ...(input.from ?? [])] },
        unitOfWork,
      );

      // **One decision carries the whole act**: this analysis stands in
      // place of that one, on this review, superseding these findings and
      // keeping those. A reader of the decision sees all of it.
      const decision = ref(
        "decision",
        await unitOfWork.node("Decision", {
          decided_at: at,
          reason: `superseded by a re-run: ${input.method}`,
          invalidation_check: "evidence that the superseded analysis was sound after all",
        }),
      );
      unitOfWork.edge(decision, "SUPERSEDES", input.supersedes);
      unitOfWork.edge(decision, "MOTIVATES", replacement);
      unitOfWork.edge(decision, "INVALIDATED_BY", input.because);

      // Every conclusion not kept falls now. A kept one is **not
      // re-parented**: it keeps the evidence that produced it, so asking
      // why it holds still answers with the run that produced the number.
      const superseded: ConcludedClaim[] = [];
      for (const c of before) {
        if (kept.has(c.claim)) {
          unitOfWork.edge(decision, "KEEPS", c.claim);
          continue;
        }
        unitOfWork.edge(decision, "SUPERSEDES", c.claim);
        superseded.push({ claim: c.claim, asserts: c.proposition });
      }

      return {
        subject: replacement,
        result: {
          at,
          replacement,
          decision,
          supersedes: input.supersedes,
          kept: input.keeping,
          superseded,
        },
      };
    });
  }

  /**
   * Narrows an interpretation without touching anything it was inferred from.
   */
  async reinterpret(input: ReinterpretCommand): Promise<ReinterpretationReport> {
    return this.handle("reinterpret", input, async (unitOfWork) => {
      const at = this.clock.now();
      const origin = await this.claimOrigin(input.of);
      if (origin?.kind === "synthesis") {
        const named = (await this.standingOf([input.of])).get(input.of);
        if (named?.withdrawn)
          throw new Error(
            "claim " +
              input.of +
              " no longer stands: " +
              named.by.join(" and ") +
              " withdrew it. " +
              (named.insteadOf.length > 0
                ? "Reinterpret " +
                  named.insteadOf.map((c) => c.claim).join(" or ") +
                  " which stands in its place"
                : "The record does not say which claim stands in its place; " +
                  "'labkit why " +
                  named.by[0] +
                  "' says what the act was"),
          );

        const withdrawn: ConcludedClaim[] = [{ claim: input.of, asserts: origin.asserts }];
        const review = await unitOfWork.node("Review", { verdict: input.because });
        const narrower = ref(
          "claim",
          await unitOfWork.node("Claim", { name: input.as, kind: "exploratory" }),
        );
        const decision = await unitOfWork.node("Decision", {
          decided_at: at,
          reason: input.because,
          invalidation_check: "evidence that the original reading was right after all",
        });
        unitOfWork.edge(decision, "MOTIVATES", narrower);
        unitOfWork.edge(review, "EVALUATES", input.of);
        unitOfWork.edge(decision, "CHANGES", input.of);
        for (const part of origin.parts) unitOfWork.edge(narrower, "RESTS_ON", part);

        return {
          subject: narrower,
          result: {
            at,
            previously: withdrawn,
            nowClaims: { claim: narrower, asserts: input.as },
            evidenceStanding: [],
            restingOnTheOldReading: [],
            requiresRecomputation: false,
          },
        };
      }

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
      if (claims.length === 0)
        throw new Error(
          `no claim ${input.of} to reinterpret; a claim exists once an analysis concludes it`,
        );

      // Every record this act withdraws, by handle. The reading is one sentence
      // and the records asserting it are several -- reporting the sentence alone
      // left a caller unable to name which claims stopped standing, and reporting
      // one handle would have picked between them arbitrarily.
      const withdrawnIds = [...new Set(claims.map((c) => c.c.natural_id))].map((id) =>
        ref("claim", id),
      );
      const withdrawn: ConcludedClaim[] = withdrawnIds.map((claim) => ({
        claim,
        asserts: previously,
      }));

      // **The match above is on wording, and wording does not say whether a claim still
      // stands.** A reading narrowed weeks ago carries its name and its evidence unchanged, so
      // it matches again -- and narrowing it a second time puts two successors on one reading
      // with nothing saying which the record asserts.
      const named = (await this.standingOf([input.of])).get(input.of);
      if (named?.withdrawn)
        throw new Error(
          `claim ${input.of} no longer stands: ${named.by.join(" and ")} withdrew it. ` +
            (named.insteadOf.length > 0
              ? `Reinterpret ${named.insteadOf.map((c) => c.claim).join(" or ")}, which stands in its place`
              : `The record does not say which claim stands in its place; ` +
                `'labkit why ${named.by[0]}' says what the act was`),
        );
      // One query for every withdrawn claim's evidence, not one per claim.
      // Deduplicated by the Map below: the query selects `natural_id` AND
      // `statement` and keying on the statement merged two findings phrased
      // alike -- in the field whose whole job is showing the findings survived
      // unchanged.
      const evidence = await this.graph.query(
        `MATCH (e:Evidence)-[:SUPPORTS]->(c:Claim) WHERE c.natural_id IN $ids RETURN e`,
        { e: vertexProps<{ natural_id: string; statement: string }>() },
        { ids: withdrawnIds },
      );
      const restingOnTheOldReading = await this.decidedOnTheStrengthOf(scope);

      const review = await unitOfWork.node("Review", { verdict: input.because });
      const narrower = ref(
        "claim",
        await unitOfWork.node("Claim", { name: input.as, kind: "exploratory" }),
      );
      // The review records that someone objected; the decision records that the
      // objection was acted on. Reviews also confirm, so a review alone cannot
      // mean "withdrawn" without reading its prose.
      const decision = await unitOfWork.node("Decision", {
        decided_at: this.clock.now(),
        reason: input.because,
        invalidation_check: "evidence that the original reading was right after all",
      });
      unitOfWork.edge(decision, "MOTIVATES", narrower);

      for (const id of withdrawnIds) {
        unitOfWork.edge(review, "EVALUATES", id);
        unitOfWork.edge(decision, "CHANGES", id);
      }

      // Keyed by id: keying on the statement merged two findings phrased alike.
      const carried = new Map<EvidenceRef, CitedFinding>();
      for (const row of evidence) {
        unitOfWork.edge(row.e.natural_id, "SUPPORTS", narrower);
        const finding = ref("evidence", row.e.natural_id);
        carried.set(finding, { evidence: finding, states: row.e.statement });
      }

      return {
        subject: narrower,
        result: {
          at,
          previously: withdrawn,
          // The act records what it produced: without this a caller has to go
          // back through `claimsAsserting` to name what this very call created.
          nowClaims: { claim: narrower, asserts: input.as },
          evidenceStanding: [...carried.values()].sort((a, b) =>
            a.evidence.localeCompare(b.evidence),
          ),
          restingOnTheOldReading,
          requiresRecomputation: false,
        },
      };
    });
  }

  /**
   * A replacement must be justified by a review OF the analysis being replaced -- otherwise any
   * review's verdict could retire any analysis, and `whySupported()` would report a withdrawal
   * reason that never referred to the withdrawn work.
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
