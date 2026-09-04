/**
 * What more than one write group needs to reach the same record the same way.
 *
 * `Work` and `Revising` both `extend Shared` (which itself `extends
 * SessionCore`) rather than holding an instance of it, and that choice is not
 * style: `tests/helpers/surface-coverage.ts` derives every exposed verb by
 * walking every class in `write/`'s files and reading `public`/`private` off
 * the declaration, so a method here that were merely `public` — reachable via
 * a held instance — would be counted as an unexposed write verb by that scan,
 * exactly like a real one accidentally left off a command. `protected` is
 * invisible to it, the same way `SessionCore`'s own helpers already are, and
 * inheritance is what makes `protected` reachable from two unrelated classes
 * that happen to share this ancestor.
 *
 * **Membership is by use, not by topic.** `unitOf`, `revisedBy`, `recorded`,
 * `concluding` and `conclusionEvents` read like `Work`'s own machinery — and
 * were first drafted there — until `reverify` (a `Revising` verb) turned out to
 * call all five, three of them via `concluding`'s own body. The test is the one
 * `supersessionOf`/`conclusionsOf`/`outputArtefactOf`/`enquiryOf` already met:
 * called from both, not called by one and read by another.
 */

import { optional, vertexProps } from "../../db/cypher";
import type {
  ArtefactProps,
  ClaimProps,
  EdgeLabel,
  EdgeProps,
  GraphChange,
  NodeLabel,
  NodePropsByLabel,
} from "../../db/domain";
import { labelForNaturalId } from "../../db/domain";
import type {
  AnalysisRef,
  ClaimRef,
  ConcludedClaim,
  EnquiryRef,
  EvidenceRef,
  ObservationsRef,
  Ref,
  ReviewRef,
  UnitRef,
} from "../report";
import { ref } from "../report";
import type { ConcludeCommand, RecordAnalysisCommand } from "../commands";
import { SessionCore } from "../core";
import type { TenantGraph } from "../../db/graph";
import type { UnitOfWork } from "../projection";
import type { DomainEvent } from "../events";

/**
 * A conclusion as this file records it — the public shape plus the standing the
 * write resolved.
 *
 * `ConcludedClaim` is what a caller gets back and does not carry standing: the
 * claim itself does, and `whySupported` reports it. This is for the event,
 * which has to say what standing the act *recorded* rather than what the claim
 * reads today.
 */
export type ConcludedWithStanding = Required<ConcludedClaim> & {
  standing: "exploratory" | "confirmatory";
};

/**
 * The public half of a {@link ConcludedWithStanding}.
 *
 * The standing is for the event, not for the caller: the claim carries it and
 * `whySupported` reports it. Returning it would widen `ConcludedClaim`, and
 * MCP's output schemas are `strictObject`, so an extra key is a validation
 * error at the wire rather than an unused field.
 */
export const asConcludedClaim = (c: ConcludedWithStanding): Required<ConcludedClaim> => ({
  claim: c.claim,
  asserts: c.asserts,
  finding: c.finding,
});

/**
 * A conclusion **already on the record**, as read back from the graph.
 *
 * Deliberately not {@link ConcludedClaim}, which is the *command* shape: a
 * caller recording conclusions holds no claim id yet, so widening the input to
 * carry one would demand a handle for a record that does not exist. Reading
 * them back is the other direction and the id is right there.
 */
export interface RecordedConclusion {
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
 * `ReadSurface` in `../read.ts`. In short: name the act, never a command (the
 * two surfaces disagree on four of five names), and name a verb only when both
 * surfaces spell it identically *and* its promise has been checked against the
 * code implementing it.
 *
 * **One spelling, because four is this repository's oldest defect shape.** The
 * text was hand-written at four call sites, which is written-once and forgotten
 * the second time — the same shape as the `SUPPORTS`/`CHALLENGES` traversal
 * that appeared six times and was corrected five. A message is not a
 * traversal, but the arithmetic is identical: the next person to improve this
 * wording improves one of four, and the record then refuses the same act in
 * two different voices.
 *
 * It is the highest-frequency refusal in the domain — every verb that cites a
 * claim reaches it — so it is the one most worth having exactly once.
 *
 * Ordered fact, rule, implication — what the domain got, what it expected, what
 * would satisfy it. Every refusal here follows that order.
 */
export const noFindingBearsOn = (claim: ClaimRef): string =>
  `no finding bears on claim ${claim}; a claim can be cited only once an analysis ` +
  `has concluded it and produced the evidence bearing on it`;

/** The write helpers `Work` and `Revising` both reach — see the file header. */
export class Shared extends SessionCore {
  /**
   * The inferential activity behind an analysis.
   *
   * An `AnalysisRef` currently carries the computation's id, so reaching the
   * unit is a hop. Worth watching: "analysis" keeps behaving like the
   * EvidenceUnit (the bounded inferential activity) rather than the
   * Computation (its execution) -- the review endpoint goes that way too.
   * Flagged rather than renamed: renaming nouns is not a reason to refactor.
   */
  protected async unitOf(analysis: AnalysisRef): Promise<UnitRef> {
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

  /**
   * The analysis this one is a revision of, by way of the lineage decision.
   *
   * `new <-MOTIVATES- Decision -CHANGES-> old`. Lineage only: that this
   * analysis revises that one, never that the old one's findings fell. See the
   * `Computation` pair on `EDGE_SCHEMA.CHANGES`.
   */
  protected async revisedBy(
    analysis: AnalysisRef,
  ): Promise<{ old: AnalysisRef; decision: Ref<"decision">; because?: ReviewRef } | undefined> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:MOTIVATES]-(d:Decision)-[:SUPERSEDES]->(old:Computation)
       OPTIONAL MATCH (d)-[:INVALIDATED_BY]->(rev:Review)
       RETURN old, rev, d`,
      {
        old: vertexProps<{ natural_id: string }>(),
        rev: optional(vertexProps<{ natural_id: string }>()),
        d: vertexProps<{ natural_id: string }>(),
      },
      { id: analysis },
    );
    const found = rows[0];
    if (!found) return undefined;
    return {
      old: ref("analysis", found.old.natural_id),
      decision: ref("decision", found.d.natural_id),
      ...(found.rev ? { because: ref("review", found.rev.natural_id) } : {}),
    };
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
  protected async supersessionOf(claim: ClaimRef): Promise<Ref<"decision"> | undefined> {
    const rows = await this.graph.query(
      `MATCH (c:Claim {natural_id: $id})
       OPTIONAL MATCH (narrowed:Decision)-[:CHANGES]->(c)
       OPTIONAL MATCH (replaced:Decision)-[:SUPERSEDES]->(c)
       RETURN narrowed, replaced`,
      {
        narrowed: optional(vertexProps<{ natural_id: string }>()),
        replaced: optional(vertexProps<{ natural_id: string }>()),
      },
      { id: claim },
    );
    const found = rows
      .map((r) => r.narrowed?.natural_id ?? r.replaced?.natural_id)
      .find((r) => r !== undefined);
    return found === undefined ? undefined : ref("decision", found);
  }

  protected async conclusionsOf(analysis: AnalysisRef): Promise<RecordedConclusion[]> {
    const rows = await this.graph.query(
      // Either bearing: an analysis whose findings all CHALLENGE returned no
      // conclusions at all, so replacing one reported nothing as affected.
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(u:EvidenceUnit)-[:PRODUCES]->(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(sc:Claim)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(cc:Claim)
       RETURN e, sc, cc`,
      {
        e: vertexProps<{ natural_id: string; statement: string }>(),
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

  protected async outputArtefactOf(analysis: AnalysisRef): Promise<ObservationsRef> {
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

  /** The enquiry an analysis was recorded under, for the withdrawal guard's scope. */
  protected async enquiryOf(analysis: AnalysisRef): Promise<EnquiryRef | undefined> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:ADDRESSES]->(l:LineOfEnquiry)
       RETURN l`,
      { l: vertexProps<{ natural_id: string }>() },
      { id: analysis },
    );
    const found = rows[0];
    return found ? ref("enquiry", found.l.natural_id) : undefined;
  }

  /**
   * The write half of `recordAnalysis`, unitOfWork rather than written.
   *
   * Composed verbs call this. A researcher who re-verified a result did one
   * thing, and a log that also records the analysis underneath it describes the
   * implementation instead of the act.
   */
  protected async recorded(
    input: Omit<RecordAnalysisCommand, "concludes">,
    unitOfWork: UnitOfWork,
  ): Promise<{ analysis: AnalysisRef; unit: UnitRef; output: ObservationsRef }> {
    const computation = await unitOfWork.node("Computation", {
      kind: input.method,
      status: "completed",
    });
    const unit = await unitOfWork.node("EvidenceUnit", { role: "analysis" });
    const output = await unitOfWork.node("Artefact", {
      kind: "analysis-output",
      logical_name: `${input.method} output`,
    });

    unitOfWork.edge(unit, "USES", computation);
    unitOfWork.edge(unit, "ADDRESSES", input.enquiry);
    if (input.implementing) unitOfWork.edge(input.implementing, "IMPLEMENTS", unit);
    for (const criterion of input.heldTo ?? []) {
      unitOfWork.edge(criterion, "QUALIFIES", unit);
    }
    // Both levels of provenance, deliberately: the evidence unit produced
    // this scientific output; the computation produced this concrete
    // execution output. Without the second, CONSUMES would be half a pair --
    // "what did this computation read" answerable in one hop while "what did
    // it produce" still needed a detour through the unit.
    //
    // The FIRST of the two is unwalked: nothing reads `EvidenceUnit -PRODUCES->
    // Artefact`. Kept under the no-cull policy -- an endpoint pair is a claim
    // about the domain the same way a label is -- and named here so it is a
    // computable map rather than an oversight.
    unitOfWork.edge(unit, "PRODUCES", output);
    unitOfWork.edge(computation, "PRODUCES", output);
    // Every position at which each artefact was read, collected before staging.
    //
    // `positions` and not `position`, and one edge per distinct artefact rather
    // than one per occurrence: `createEdge` treats `(from, label, to)` as
    // identity and a repeat is a no-op, so `from: [A, B, A]` cannot be three
    // edges and writing it as two silently drops the second A.
    const positionsFor = new Map<ObservationsRef, number[]>();
    for (const [position, source] of input.from.entries()) {
      // An analysis is named by its computation; what it *read* is that
      // computation's output artefact, which is what CONSUMES points at.
      const artefact =
        labelForNaturalId(source) === "Computation"
          ? await this.outputArtefactOf(source as AnalysisRef)
          : (source as ObservationsRef);
      const seen = positionsFor.get(artefact);
      if (seen) seen.push(position);
      else positionsFor.set(artefact, [position]);
    }
    for (const [artefact, positions] of positionsFor) {
      unitOfWork.edge(computation, "CONSUMES", artefact, { positions });
    }

    return {
      analysis: ref("analysis", computation),
      unit: ref("unit", unit),
      output: ref("observations", output),
    };
  }

  protected async concluding(
    input: ConcludeCommand,
    unitOfWork: UnitOfWork,
    /**
     * The unit, output and enquiry of an analysis unitOfWork by this same act, and
     * therefore not yet on the record to be queried for.
     */
    staging?: { unit: UnitRef; output: ObservationsRef; enquiry?: EnquiryRef },
  ): Promise<ConcludedWithStanding> {
    {
      const at = this.clock.now();
      {
        const unit = staging?.unit ?? (await this.unitOf(input.analysis));
        const output = staging?.output ?? (await this.outputArtefactOf(input.analysis));

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
        let revision:
          | { old: AnalysisRef; decision: Ref<"decision">; because?: ReviewRef }
          | undefined;
        if (input.replacing !== undefined) {
          // **Scoped to the analysis this one revises, not to this one.** A
          // replacement supersedes findings of the analysis it replaced, so the
          // handle the caller holds belongs to the OLD analysis. The lineage
          // decision is what makes that reachable:
          // `new <-MOTIVATES- Decision -CHANGES-> old`.
          revision = await this.revisedBy(input.analysis);
          const revised = revision?.old;
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

          // **A finding falls once, and it fell when the revision was
          // recorded.** So `replacing` here is not the act of superseding; it
          // names which superseded finding this one stands in place of, for a
          // reader that would otherwise match on wording.
          //
          // What is refused is naming a finding that some OTHER act withdrew.
          // Two decisions would then stand instead of one claim, each naming a
          // different successor, and no reader can say which holds --
          // `withdrawalOf` takes whichever row it sees first. The refusal names
          // the claim, not the wording.
          const gone = await this.supersessionOf(superseded.claim);
          if (gone !== undefined && gone !== revision?.decision)
            throw new Error(
              `${superseded.claim} was superseded by a different act; a finding falls once, ` +
                `so this conclusion cannot stand in its place. Name a finding the revision ` +
                `this analysis records superseded, or conclude without naming one`,
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
        // **A challenging bearing is never inherited in silence.**
        // Inheriting `supports` is indistinguishable from the default, so
        // nothing is being assumed on the caller's behalf. Inheriting
        // `challenges` is: it asserts a direction nobody typed, onto a
        // replacement that exists *because* something changed — and what
        // changed is sometimes the answer. A corrected run reading "exact
        // match" then reports the proposition challenged by its own evidence.
        //
        // Which way a finding cuts is the act's own content and no walk
        // recovers it, so the remedy is to ask rather than to guess.
        if (input.bearing === undefined && superseded?.bearing === "challenges")
          throw new Error(
            `${superseded.claim} challenges "${superseded.proposition}", and a replacement ` +
              `does not inherit that: say which way this finding cuts with --bearing ` +
              `supports or --bearing challenges`,
          );
        const bearing = input.bearing ?? superseded?.bearing ?? "supports";

        // A withdrawn proposition cannot be re-asserted as a side effect of
        // recording some other analysis.
        //
        // **The exemption is one decision wide.** `keep` supersedes every
        // conclusion it does not carry forward at the moment it records the
        // successor, so the successor's own findings are asserted against
        // propositions this very act has just withdrawn; restating those is
        // what it exists to do, and without the exemption `keep` could never
        // be followed by `conclude`.
        //
        // It reaches no further than that. A proposition withdrawn by some
        // OTHER act -- a reinterpretation that narrowed it, an earlier
        // revision -- is still refused here, even to a successor, because
        // nothing about revising one analysis licenses re-asserting what
        // somebody else's decision retired. Compared by decision, not by
        // whether this analysis happens to be a successor at all.
        if (superseded === undefined) {
          if (revision === undefined) revision = await this.revisedBy(input.analysis);
          const enquiry = staging?.enquiry ?? (await this.enquiryOf(input.analysis));
          const { withdrawn, by, replacedBy } = await this.withdrawalOf({
            proposition,
            ...(enquiry === undefined ? {} : { enquiry }),
          });
          if (withdrawn && by !== revision?.decision)
            throw new Error(
              `"${proposition}" was withdrawn${replacedBy ? ` in favour of "${replacedBy}"` : ""}; ` +
                `it cannot be re-asserted by recording another analysis`,
            );
        }

        const evidence = await unitOfWork.node("Evidence", { statement: input.finding });
        const claim = await unitOfWork.node("Claim", {
          name: proposition,
          kind: input.standing ?? "exploratory",
        });
        unitOfWork.edge(unit, "PRODUCES", evidence);
        unitOfWork.edge(evidence, "RECORDED_IN", output);
        unitOfWork.edge(evidence, bearing === "challenges" ? "CHALLENGES" : "SUPPORTS", claim);

        // Per-finding supersession, on the edges the model already has.
        if (superseded) {
          const decision = await unitOfWork.node("Decision", {
            decided_at: at,
            reason: `superseded by "${input.finding}"`,
            invalidation_check: "evidence that the superseded finding was right after all",
          });
          unitOfWork.edge(decision, "SUPERSEDES", superseded.claim);
          unitOfWork.edge(decision, "MOTIVATES", claim);
          // The review the revision rested on, carried down from the lineage
          // decision so a reader asking why THIS finding fell gets the verdict
          // that caused it rather than any review of the same unit.
          if (revision?.because !== undefined)
            unitOfWork.edge(decision, "INVALIDATED_BY", revision.because);
        }

        return {
          claim: ref("claim", claim),
          asserts: proposition,
          finding: ref("evidence", evidence),
          standing: input.standing ?? "exploratory",
        };
      }
    }
  }

  /** `{claim, finding, proposition}` per conclusion — the event's own record of the pairing, independent of the typed report. */
  protected conclusionEvents(claims: ConcludedWithStanding[]): Record<string, unknown>[] {
    return claims.map((c) => ({
      claim: c.claim,
      finding: c.finding,
      proposition: c.asserts,
      // **Per conclusion, because the array is the record of what was
      // concluded.** Without it the log cannot say whether a claim now reading
      // `confirmatory` was recorded that way or promoted afterwards, and a
      // reader has to infer it from whether a `promote` happens to follow.
      standing: c.standing,
    }));
  }
}
