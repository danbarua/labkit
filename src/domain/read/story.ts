import { edgeProps, optional, scalar, vertexProps } from "../../db/cypher";
import type {
  ArtefactProps,
  ClaimProps,
  ComputationProps,
  EvidenceProps,
  IdentityString,
  IndexedString,
  Prose,
} from "../../db/domain";
import { SessionCore } from "../core";
import { compose, per, type Row } from "../facts";
import { ref, isRefOfKind, verdictOf } from "../report";
import type {
  AffectedClaim,
  AffectedEnquiry,
  AnalysisRef,
  CheckStatus,
  ClaimRef,
  ConcludedClaim,
  ConflictSide,
  ConflictVerdict,
  CriterionRef,
  DecisionRef,
  DependencyReport,
  EnquiryRef,
  EnquiryStatus,
  IdentifiedArtefact,
  InterpretationHistory,
  ObservationsRef,
  ReproducibilityReport,
  ReproductionReport,
  Reverification,
  Revision,
  SupportExplanation,
} from "../report";
import { checkStatus, checksAnchor } from "../survey-facts";
import { blockedBy } from "./blocked";
import { dedupeById, type Identified } from "./shared";

/**
 * What a deferral says, carried onto whatever the question's standing turns out to be.
 */
const deferral = (
  accepting: { reason: string; invalidation_check: string } | null,
): { acceptedBecause: string; reopensIf: string } | Record<string, never> =>
  accepting ? { acceptedBecause: accepting.reason, reopensIf: accepting.invalidation_check } : {};

export class StoryGroup extends SessionCore {
  /** Is this enquiry open, and if not, how did this enquiry close? */
  async enquiryStatus(enquiry: EnquiryRef): Promise<EnquiryStatus> {
    const named = await this.graph.query(
      `MATCH (loe:LineOfEnquiry {natural_id: $id}) RETURN loe`,
      { loe: vertexProps<{ name: string }>() },
      { id: enquiry },
    );
    const loe = named[0];
    if (!loe)
      throw new Error(
        `no enquiry ${enquiry}; an enquiry is opened against a question, and 'search' finds its handle by the approach it was opened with`,
      );

    const rows = await this.graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(loe:LineOfEnquiry {natural_id: $id})
       OPTIONAL MATCH (resolving:Decision)-[:RESOLVES]->(loe)
       OPTIONAL MATCH (resolving)-[:ANSWERS]->(answered:Claim)
       OPTIONAL MATCH (deferring:Decision)-[:DEFERS]->(q)
       RETURN q, resolving, answered, deferring`,
      {
        q: vertexProps<{ name: string; natural_id: string }>(),
        resolving: optional(vertexProps<{ natural_id: string; resolution_kind?: string }>()),
        answered: optional(vertexProps<{ natural_id: string; name: string }>()),
        deferring: optional(
          vertexProps<{
            natural_id: string;
            reason: string;
            invalidation_check: string;
          }>(),
        ),
      },
      { id: enquiry },
    );

    const mine = await this.graph.query(
      `MATCH (u:EvidenceUnit)-[:ADDRESSES]->(:LineOfEnquiry {natural_id: $id})
       MATCH (u)-[:PRODUCES]->(e:Evidence)
       RETURN e`,
      { e: vertexProps<{ statement: string } & Identified>() },
      { id: enquiry },
    );
    const contributed = dedupeById(
      mine.map((r) => ({
        evidence: ref("evidence", r.e.natural_id),
        states: r.e.statement,
      })),
      (f) => f.evidence,
    );

    const behind = rows[0]?.q ?? null;
    const resolving = rows.find((r) => r.resolving)?.resolving ?? null;
    const accepting = rows.find((r) => r.deferring)?.deferring ?? null;
    const acceptedBasis = accepting
      ? await this.graph.query(
          `MATCH (:Decision {natural_id: $id})-[:BASED_ON]->(e:Evidence) RETURN e`,
          { e: vertexProps<{ statement: string } & Identified>() },
          { id: accepting.natural_id },
        )
      : [];
    const question = behind
      ? {
          question: ref("question", behind.natural_id),
          asks: behind.name,
          ...deferral(accepting),
          ...(accepting
            ? {
                acceptedInLightOf: dedupeById(
                  acceptedBasis.map((r) => ({
                    evidence: ref("evidence", r.e.natural_id),
                    states: r.e.statement,
                  })),
                  (f) => f.evidence,
                ),
              }
            : {}),
        }
      : null;

    if (!resolving)
      return {
        enquiry,
        pursuing: loe.loe.name,
        contributed,
        open: true,
        closure: null,
        answer: null,
        evidence: [],
        question,
      };

    if (resolving.resolution_kind === "abandoned")
      return {
        enquiry,
        pursuing: loe.loe.name,
        contributed,
        open: false,
        closure: "abandoned",
        answer: null,
        evidence: [],
        question,
      };

    if (resolving.resolution_kind !== "answered")
      throw new Error(
        `decision ${resolving.natural_id} resolves enquiry ${enquiry} with invalid resolution kind ${resolving.resolution_kind ?? "absent"}`,
      );

    const cited = await this.graph.query(
      `MATCH (:Decision {natural_id: $id})-[:BASED_ON]->(e:Evidence)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(against:Claim)
       RETURN e, against`,
      {
        e: vertexProps<{ statement: string } & Identified>(),
        against: optional(vertexProps<{ name: string }>()),
      },
      { id: resolving.natural_id },
    );
    const answered = rows.find((r) => r.answered)?.answered ?? null;
    if (cited.length === 0 || answered === null)
      throw new Error(
        `answered decision ${resolving.natural_id} lacks its answering claim or cited evidence for enquiry ${enquiry}`,
      );

    return {
      enquiry,
      pursuing: loe.loe.name,
      contributed,
      open: false,
      closure: "answered",
      answer: cited.some((r) => r.against !== null) ? "no" : "yes",
      answered: { claim: ref("claim", answered.natural_id), asserts: answered.name },
      evidence: dedupeById(
        cited.map((r) => ({
          evidence: ref("evidence", r.e.natural_id),
          states: r.e.statement,
        })),
        (f) => f.evidence,
      ),
      restsOn: await this.restsOnFor(ref("claim", answered.natural_id)),
      question,
    };
  }

  /**
   * Confirmatory only when the answering claim is confirmatory *and* its checks passed —
   * the same pair `whatIsKnown` uses for established.
   */
  private async restsOnFor(claim: ClaimRef): Promise<"exploratory" | "confirmatory"> {
    const [row] = await this.graph.query(
      `MATCH (c:Claim {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ kind?: string }>() },
      { id: claim },
    );
    if (row?.c.kind !== "confirmatory") return "exploratory";
    return (await this.checksMet(claim)) ? "confirmatory" : "exploratory";
  }

  /**
   * Findings bearing on a proposition **within an enquiry**, one way or the other —
   * deliberately not by claim handle, which was tried and refuted.
   */
  private async findingsBearing(
    scope: { proposition: IndexedString; enquiry?: EnquiryRef },
    bearing: "SUPPORTS" | "CHALLENGES",
  ) {
    return this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:${bearing}]-(e:Evidence)
       MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
       ${this.withinScope(scope)}
       MATCH (u)-[:USES]->(comp:Computation)
       OPTIONAL MATCH (e)-[:RECORDED_IN]->(a:Artefact)
       OPTIONAL MATCH (r:Review)-[:EVALUATES]->(u)
       // Supersession, per claim -- the same pair withdrawalOf reads: a
       // decision that stands instead of this one.
       OPTIONAL MATCH (d:Decision)-[:SUPERSEDES]->(c)
       // Which review THIS retraction rested on (row O), at the grain the
       // question is asked. Distinct from the 'r' above, which is any review of
       // the unit -- reading that as the cause is what reported a confirming
       // review as a reason work was retracted.
       OPTIONAL MATCH (d)-[:INVALIDATED_BY]->(caused:Review)
       RETURN e, comp, a, r, d, caused`,
      {
        e: vertexProps<EvidenceProps & { natural_id: string }>(),
        comp: vertexProps<ComputationProps & Identified>(),
        a: optional(vertexProps<ArtefactProps & { natural_id: string }>()),
        r: optional(vertexProps<{ verdict: string }>()),
        d: optional(vertexProps<{ reason: string }>()),
        caused: optional(vertexProps<{ verdict: string }>()),
      },
      {
        name: scope.proposition,
        ...this.scopeParams(scope),
      },
    );
  }

  /**
   * What a re-run did and did not establish.
   */
  async reproductionOf(verification: AnalysisRef): Promise<ReproductionReport> {
    const link = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:PRODUCES]->(new:Evidence)
       MATCH (new)-[:REVERIFIES]->(old:Evidence)<-[:PRODUCES]-(:EvidenceUnit)-[:USES]->(oldcomp:Computation)
       RETURN new, old, oldcomp`,
      {
        new: vertexProps<{ natural_id: string }>(),
        old: vertexProps<{ natural_id: string }>(),
        oldcomp: vertexProps<{ natural_id: string; method: string }>(),
      },
      { id: verification },
    );
    const found = link[0];
    if (!found)
      throw new Error(
        `analysis ${verification} re-verifies nothing; a reproduction report is about a re-verification, so name one recorded by 'reverify'`,
      );

    const method = await this.graph.query(
      `MATCH (c:Computation {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ method: string }>() },
      { id: verification },
    );

    // Keyed by natural id, never by `logical_name`. Two runs can each record something called
    // "initial conditions" and mean different data; comparing the names would make those the
    // same execution input. What a run read, **in order and with repeats**, plus the same as a
    // set for the difference calculation below.
    const inputs = async (
      computation: string,
    ): Promise<{
      read: IdentifiedArtefact[];
      bySubject: Map<ObservationsRef, IdentifiedArtefact>;
    }> => {
      const rows = await this.graph.query(
        `MATCH (:Computation {natural_id: $id})-[c:CONSUMES]->(a:Artefact) RETURN a, c`,
        {
          a: vertexProps<{ natural_id: string; logical_name: string }>(),
          c: edgeProps<{ positions?: number[] }>(),
        },
        { id: computation },
      );
      const occurrences = rows.flatMap((r) =>
        (r.c.positions ?? [Number.MAX_SAFE_INTEGER]).map((position) => ({
          position,
          a: r.a,
        })),
      );
      occurrences.sort(
        (x, y) => x.position - y.position || x.a.natural_id.localeCompare(y.a.natural_id),
      );
      const identify = (a: { natural_id: string; logical_name: string }): IdentifiedArtefact => ({
        part: ref("observations", a.natural_id),
        name: a.logical_name,
      });
      return {
        read: occurrences.map((o) => identify(o.a)),
        bySubject: new Map(rows.map((r) => [ref("observations", r.a.natural_id), identify(r.a)])),
      };
    };
    const mine = await inputs(verification);
    const theirs = await inputs(found.oldcomp.natural_id);
    const mineBy = mine.bySubject;
    const theirsBy = theirs.bySubject;

    // Absence and difference are not the same answer, and absence on BOTH sides
    // is still absence: two runs that each recorded nothing have not reproduced
    // anything, they have simply both failed to say what they read. Comparing
    // the two empty sets reported `reproduced`, contradicting the premise the
    // scenario exists for.
    const provenanceMissing = theirsBy.size === 0;
    const differs: ReproductionReport["differs"] = provenanceMissing
      ? [...mineBy.values()].map((what) => ({
          what,
          standing: "unrecorded-in-the-original" as const,
        }))
      : [
          ...[...mineBy]
            .filter(([id]) => !theirsBy.has(id))
            .map(([, what]) => ({ what, standing: "changed" as const })),
          // The other direction, which was not computed at all: an input the
          // original read and the re-run did not is a difference too, and
          // reporting `not-reproduced` with an empty `differs` named nothing.
          ...[...theirsBy]
            .filter(([id]) => !mineBy.has(id))
            .map(([, what]) => ({
              what,
              standing: "not-used-by-the-re-run" as const,
            })),
        ];
    // Sorted by name then identity: the name is what a reader scans, and the
    // identity breaks the tie when two inputs share one.
    differs.sort(
      (a, b) => a.what.name.localeCompare(b.what.name) || a.what.part.localeCompare(b.what.part),
    );

    // Which way each run cut, read from the bearing each finding was recorded
    // with -- never from comparing the two findings' wording. Both are needed:
    // reading only the re-run's made two runs that each found *against* the
    // proposition report as disagreeing with each other.
    const challenges = async (evidence: string): Promise<boolean> =>
      (
        await this.graph.query(
          `MATCH (:Evidence {natural_id: $id})-[:CHALLENGES]->(:Claim) RETURN 1`,
          { ok: scalar<number>() },
          { id: evidence },
        )
      ).length > 0;
    const newChallenges = await challenges(found.new.natural_id);
    const oldChallenges = await challenges(found.old.natural_id);
    const agrees = newChallenges === oldChallenges;

    return {
      // Identity and wording both. Method text alone leaves two runs of one
      // method indistinguishable.
      verification,
      verificationMethod: method[0]!.c.method,
      of: ref("analysis", found.oldcomp.natural_id),
      ofMethod: found.oldcomp.method,
      conclusion: agrees ? "agrees" : "disagrees",
      // Both lists, in order, and no verdict over them. Whether the same
      // records read in a different order is the same execution depends on what
      // the method does; the record does not know and does not guess.
      verificationRead: mine.read,
      ofRead: theirs.read,
      differs,
      // Which way the RE-RUN cuts for the claim -- a question about the
      // proposition, not about whether the two runs concur. Two runs that agree
      // on a negative finding agree with each other and lower confidence in the
      // proposition, and those are different sentences.
      bearing: newChallenges ? "lowers" : "raises",
    };
  }

  /**
   * An interpretation and every narrowing behind it, oldest first.
   */
  async interpretationHistory(claim: ClaimRef): Promise<InterpretationHistory> {
    // **Walked by id.** `reinterpret` writes `Decision -MOTIVATES-> narrower` and `Decision
    // -CHANGES-> each withdrawn claim`, both carrying natural ids, so every step is reachable
    // by identity.
    const proposition = await this.assertedBy(claim);
    if (proposition === undefined)
      throw new Error(
        `no claim ${claim}; a claim exists once an analysis concludes it, and its handle comes back from that act or from looking up the exact proposition it asserts`,
      );

    // Depth from the claim asked about, so the deepest revisions are the
    // oldest. A claim reached by two paths of different lengths keeps the
    // longer one, which is what puts every revision behind it deeper still.
    const steps: Array<{ depth: number; revision: Revision }> = [];
    const narrowed = new Set<ClaimRef>();
    const walked = new Set<DecisionRef>();
    let frontier: ConcludedClaim[] = [{ claim, asserts: proposition }];
    const reached = new Map<ClaimRef, ConcludedClaim>([[claim, frontier[0]!]]);

    for (let depth = 1; frontier.length > 0; depth++) {
      const rows = await this.graph.query(
        // `nxt` bound and matched by id. Lower-case RETURN names throughout: a
        // camelCase one decodes as null. See `buildAsClause`.
        `MATCH (d:Decision)-[:MOTIVATES]->(nxt:Claim)
         WHERE nxt.natural_id IN $ids
         MATCH (d)-[:CHANGES]->(was:Claim)
         RETURN d, was, nxt`,
        {
          d: vertexProps<{ natural_id: string; reason: string }>(),
          was: vertexProps<{ name: string } & Identified>(),
          nxt: vertexProps<{ name: string } & Identified>(),
        },
        { ids: frontier.map((c) => c.claim) },
      );

      // One entry per decision. A decision that withdrew several readings comes
      // back as one row per withdrawn claim, and every one of them is a step
      // backwards from the same act.
      const byDecision = new Map<
        DecisionRef,
        { reason: Prose; nxt: ConcludedClaim; was: Map<ClaimRef, ConcludedClaim> }
      >();
      for (const row of rows) {
        const decision = ref("decision", row.d.natural_id);
        const entry = byDecision.get(decision) ?? {
          reason: row.d.reason,
          nxt: { claim: ref("claim", row.nxt.natural_id), asserts: row.nxt.name },
          was: new Map<ClaimRef, ConcludedClaim>(),
        };
        const was = ref("claim", row.was.natural_id);
        entry.was.set(was, { claim: was, asserts: row.was.name });
        byDecision.set(decision, entry);
      }

      const next = new Map<ClaimRef, ConcludedClaim>();
      for (const [decision, entry] of byDecision) {
        // A claim reached by two paths yields the same decision twice. The
        // revision is one act and is reported once, at the greater depth.
        if (walked.has(decision)) continue;
        walked.add(decision);
        narrowed.add(entry.nxt.claim);
        const withdrew = [...entry.was.values()];
        steps.push({
          depth,
          revision: {
            revision: decision,
            previously: withdrew,
            nowClaims: entry.nxt,
            reason: entry.reason,
            // Scoped to the withdrawn claim's own line of enquiry. The bare
            // proposition would ask "what was decided on the strength of this
            // SENTENCE", which reaches another chain's decisions.
            restingOnTheOldReading: await this.decidedOnTheStrengthOf(
              await this.scopeOf(withdrew[0]!.claim),
            ),
          },
        });
        for (const was of withdrew) {
          reached.set(was.claim, was);
          next.set(was.claim, was);
        }
      }
      frontier = [...next.values()];
    }

    // Oldest first: deepest first, and by decision within a depth so two
    // branches come back in a stable order rather than the graph's.
    steps.sort(
      (a, b) => b.depth - a.depth || a.revision.revision.localeCompare(b.revision.revision),
    );

    return {
      // Every reading the walk reached that no revision produced. On a line
      // that is the first claim; on a merge it is one per branch, including a
      // branch an analysis concluded outright and nobody narrowed.
      originally: [...reached.values()].filter((c) => c.claim !== claim && !narrowed.has(c.claim)),
      // The handle the caller asked about, not one re-found by its wording.
      nowClaims: { claim, asserts: proposition },
      revisions: steps.map((s) => s.revision),
    };
  }

  /**
   * Whether two findings actually conflict.
   */
  async doTheseConflict(a: ClaimRef, b: ClaimRef): Promise<ConflictVerdict> {
    const sides = [await this.sideOf(a), await this.sideOf(b)];
    const [left, right] = sides;

    // Value equality, which a handle gives: two records wrongly told apart here
    // turn a contradiction into a dissociation, silently and with the compiler's
    // blessing, since both sides have the same type.
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

  private async sideOf(conclusion: ClaimRef): Promise<ConflictSide & { enquiry: EnquiryRef }> {
    const resolved = await this.scopeOf(conclusion);
    const enquiry = resolved.enquiry!;

    const asked = await this.graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $id}) RETURN q`,
      { q: vertexProps<{ name: string } & Identified>() },
      { id: enquiry },
    );

    const scope = resolved;
    // Deduped by id. `findingsBearing` already selects natural_id and it was
    // being discarded on the mapping line, so two independent findings phrased
    // alike counted as one corroboration -- and `doTheseConflict` decides from
    // these arrays' lengths.
    const findings = async (bearing: "SUPPORTS" | "CHALLENGES") =>
      dedupeById(
        (await this.findingsBearing(scope, bearing)).map((r) => ({
          evidence: ref("evidence", r.e.natural_id),
          states: r.e.statement,
        })),
        (f) => f.evidence,
      ).sort((a, b) => a.evidence.localeCompare(b.evidence));

    const claim = conclusion;

    return {
      claim,
      question: ref("question", asked[0]?.q.natural_id ?? ""),
      proposition: resolved.proposition,
      asks: asked[0]?.q.name ?? "",
      supportedBy: await findings("SUPPORTS"),
      challengedBy: await findings("CHALLENGES"),
      enquiry,
    };
  }

  /** "Why does this conclusion count as supported?" and "what did the superseded inference claim?" */
  async whySupported(claim: ClaimRef): Promise<SupportExplanation> {
    const scope = await this.scopeOf(claim);
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
        await this.graph.query(`MATCH (e:Evidence)-[:REVERIFIES]->(:Evidence) RETURN e`, {
          e: vertexProps<{ natural_id: string }>(),
        })
      ).map((r) => r.e.natural_id),
    );

    // The review each retraction actually rested on (row O). Absent for an
    // artefact invalidated by anything other than replaceAnalysis(), which is
    // why the reader still falls back rather than assuming the edge is there.
    const retractedBy = new Map(
      (
        await this.graph.query(`MATCH (a:Artefact)-[:INVALIDATED_BY]->(r:Review) RETURN a, r`, {
          a: vertexProps<{ natural_id: string }>(),
          r: vertexProps<{ verdict: string }>(),
        })
      ).map((row) => [row.a.natural_id, row.r.verdict] as const),
    );

    const support: SupportExplanation["support"] = [];
    const reverifiedBy: Reverification[] = [];
    const against: SupportExplanation["against"] = [];
    const superseded: SupportExplanation["superseded"] = [];
    for (const { rows, bearing, live } of [
      { rows: forRows, bearing: "supports" as const, live: support },
      { rows: againstRows, bearing: "challenges" as const, live: against },
    ]) {
      for (const row of rows) {
        const entry = {
          finding: row.e.statement,
          evidence: ref("evidence", row.e.natural_id),
          method: row.comp.method,
          analysis: ref("analysis", row.comp.natural_id),
        };
        // **Per claim, not per artefact**: a decision that changed *this* claim, which is the
        // same fact `withdrawalOf` reads. An artefact-grain answer could only say why the whole
        // *analysis* was replaced. Deduped, and one reason per finding rather than one per
        // review of its unit.
        if (row.d) {
          if (!superseded.some((x) => x.evidence === entry.evidence && x.bearing === bearing))
            superseded.push({
              ...entry,
              bearing,
              // **The review that caused THIS retraction first** (row O). The
              // decision's own `reason` is generated text -- useful when a
              // bare `conclude --replacing` superseded a finding with no
              // review behind it, and not an answer to "which review
              // retracted it?" when there is one.
              reason:
                row.caused?.verdict ||
                row.d.reason ||
                (row.a
                  ? (retractedBy.get(row.a.natural_id) ?? "it was superseded")
                  : "it was superseded"),
            });
        } else if (bearing === "supports" && reverifying.has(row.e.natural_id)) {
          // A re-verification is not a second independent finding: counting it
          // as one reports a proposition established once as corroborated
          // twice. See `EDGE_SCHEMA.REVERIFIES`.
          if (!reverifiedBy.some((r) => r.analysis === row.comp.natural_id))
            reverifiedBy.push({
              analysis: ref("analysis", row.comp.natural_id),
              method: row.comp.method,
            });
        } else {
          live.push(entry);
        }
      }
    }

    // What the still-current analyses actually consumed -- one hop from the computation, not a
    // detour through the enquiry. Only currently-standing findings count: a superseded
    // analysis's inputs are not what the claim rests on now.
    const resting = (
      await Promise.all(
        (["SUPPORTS", "CHALLENGES"] as const).map((bearing) =>
          this.artefactsConsumedBy(scope, bearing),
        ),
      )
    ).flat();

    // The standard the finding was held to, if it was held to one. The criteria a researcher
    // agreed before the run are what "does this stand?" is answered against; without them a
    // finding whose own prespecified checks failed reads as a `supported` verdict.
    const retractedInputs = await this.retractedArtefacts([
      ...new Set(resting.map((r) => ref("observations", r.a.natural_id))),
    ]);

    const byCriterion = new Map<string, CheckStatus>();
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const { cypher, decoders } = compose(checksAnchor(bearing), checkStatus, {
        crit: vertexProps<{ natural_id: string; proposition: string }>(),
      });
      const rows = (await this.graph.query(cypher, decoders, { claim })) as unknown as Row[];
      for (const [criterion, checks] of per(checkStatus, rows)) {
        // Keyed by criterion **and subject**: a rule judged against four
        // findings is four checks a claim is held to, and keying by criterion
        // alone would keep the last one seen (#293).
        for (const check of checks) byCriterion.set(`${criterion}|${check.about ?? ""}`, check);
      }
    }
    const standard = [...byCriterion.values()];
    // Never-run counts against, exactly as it does for a gate: a check nobody
    // performed has not been met. `gateStatus()` computes `unmet` the same way
    // and the two must agree, since they are the same checks.
    const unmetChecks = standard.filter((c) => c.state !== "passed");
    // One query for every unmet check rather than one per check: the number of
    // prespecified conditions on a claim is small, but a round trip each is the
    // shape that turns a report into a profiler finding.
    const blocking = await blockedBy(
      this.graph,
      unmetChecks.map((c) => c.criterion),
    );
    const unmet = unmetChecks.map((c) => ({
      criterion: c.criterion,
      requires: c.proposition,
      blocks: blocking.get(c.criterion) ?? [],
    }));

    // A withdrawn interpretation is not supported, however much evidence once
    // carried it. By handle: two claims can assert the same sentence, and
    // `withdrawalOf` is about the proposition, not this record.
    const standing = (await this.standingOf([claim])).get(claim);
    const withdrawn = standing?.withdrawn ?? false;
    const replacedBy = standing?.insteadOf[0];

    // Standing, and why it was conferred. Read from the claim rather than the conclusion so a
    // promotion taken later is visible here at all. By handle, and with no traversal at all.
    const promotion = await this.graph.query(
      `MATCH (c:Claim {natural_id: $claim})
       OPTIONAL MATCH (d:Decision)-[:PROMOTES]->(c)
       RETURN c, d`,
      {
        c: vertexProps<{ kind?: string }>(),
        d: optional(vertexProps<{ reason: string }>()),
      },
      { claim },
    );
    const confirmed = promotion.some((r) => r.c.kind === "confirmatory");
    // A finding that settles the proposition neither way. Read off the claim
    // rather than off the edges, because the evidence is real and points
    // somewhere -- what is absent is a direction anyone will stand behind.
    const undecided = promotion.some((r) => r.c.kind === "undecided");
    const promotedBecause = promotion.find((r) => r.d)?.d?.reason;

    // What a synthesis was drawn across. By handle, from the claim itself:
    // `synthesise` writes `RESTS_ON` at the moment the act names the findings,
    // so this is a read of what the caller said rather than a match on wording.
    const drawnAcross = (
      await this.graph.query(
        // `part`, not `on`: a RETURN name that is a SQL reserved word breaks
        // the AS clause AGE builds, and `on` is one.
        `MATCH (:Claim {natural_id: $claim})-[:RESTS_ON]->(part:Claim) RETURN part`,
        { part: vertexProps<ClaimProps & { natural_id: string }>() },
        { claim },
      )
    ).map((r) => ({ claim: ref("claim", r.part.natural_id), asserts: r.part.name }));

    return {
      // The handle the caller asked with, echoed so the answer names its own
      // subject once it is stored or sent.
      claim,
      proposition,
      drawnAcross,
      // Six ways not to be supported, and they are different states: the interpretation
      // withdrawn, evidence bearing against it, a synthesis that measured nothing, evidence
      // that fails the standard set for it, evidence that settles the proposition neither way,
      // and nothing having examined it at all.
      verdict: verdictOf({
        support,
        withdrawn,
        unmet,
        undecided,
        challenged: against.length > 0,
        drawnAcross,
      }),
      standing: undecided ? "undecided" : confirmed ? "confirmatory" : "exploratory",
      ...(confirmed && promotedBecause ? { promotedBecause } : {}),
      support,
      reverifiedBy,
      standard,
      unmet,
      // Re-verifying findings are excluded here for the same reason they are kept out of
      // `support`: the claim does not rest on inputs belonging to something this very report
      // says is not an independent supporting finding.
      restingOn: [
        ...new Map(
          resting
            .filter((r) => !reverifying.has(r.e.natural_id))
            .map((r) => [
              r.a.natural_id,
              {
                part: ref("observations", r.a.natural_id),
                name: r.a.logical_name,
                // Computed, not stored -- see `retractedArtefacts`.
                ...(retractedInputs.has(ref("observations", r.a.natural_id))
                  ? { invalidated: true as const }
                  : {}),
              },
            ]),
        ).values(),
      ],
      superseded,
      challenged: against.length > 0,
      against,
      withdrawn,
      ...(replacedBy ? { replacedBy } : {}),
    };
  }

  /**
   * How much of a past construction can be rebuilt.
   */
  async reproducibilityOf(
    analysis: AnalysisRef,
    rebuilt: Array<{ part: ObservationsRef; hash: IdentityString }>,
  ): Promise<ReproducibilityReport> {
    const offered = new Map<ObservationsRef, IdentityString>(rebuilt.map((r) => [r.part, r.hash]));

    // An absent subject and an empty one are different states: answering them
    // alike lets this report say `reproducible: true` about nothing. The
    // existence check is separate from the parts query because both return zero
    // rows and only one of them is a caller error.
    const subject = await this.graph.query(
      `MATCH (c:Computation {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ natural_id: string }>() },
      { id: analysis },
    );
    if (subject.length === 0)
      throw new Error(
        `no analysis ${analysis}; an analysis is recorded before it can be read back, and its handle comes back from the act that recorded it`,
      );

    const parts = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})-[:CONSUMES]->(a:Artefact) RETURN a`,
      {
        a: vertexProps<{
          natural_id: string;
          logical_name: string;
          content_hash?: string;
        }>(),
      },
      { id: analysis },
    );

    const exact: IdentifiedArtefact[] = [];
    const differing: IdentifiedArtefact[] = [];
    const unverifiable: IdentifiedArtefact[] = [];
    const notRebuilt: IdentifiedArtefact[] = [];
    for (const { a } of parts) {
      const candidate = offered.get(ref("observations", a.natural_id));
      // Two ways for no comparison to happen, and neither is inequality: the record has no hash
      // (permanent, about the artefact), or this attempt did not rebuild the part (about the
      // attempt). `differing` is a comparison that ran and came out unequal, which is a
      // different kind of statement.
      const entry = {
        part: ref("observations", a.natural_id),
        name: a.logical_name,
      };
      if (!a.content_hash) unverifiable.push(entry);
      else if (candidate === undefined) notRebuilt.push(entry);
      else if (candidate === a.content_hash) exact.push(entry);
      else differing.push(entry);
    }

    const byName = (a: IdentifiedArtefact, b: IdentifiedArtefact) =>
      a.name.localeCompare(b.name) || a.part.localeCompare(b.part);
    return {
      analysis,
      exact: exact.sort(byName),
      differing: differing.sort(byName),
      unverifiable: unverifiable.sort(byName),
      notRebuilt: notRebuilt.sort(byName),
      // Anything not shown to match leaves the construction unshown. `exact.length > 0` is the
      // conjunct three empty lists cannot supply: an analysis that consumed nothing satisfies
      // "nothing differed, nothing was unverifiable, nothing went unrebuilt" vacuously, and
      // would report that a construction with no parts reproduces.
      reproducible:
        exact.length > 0 &&
        differing.length === 0 &&
        unverifiable.length === 0 &&
        notRebuilt.length === 0,
    };
  }

  /**
   * What is affected if this artefact turns out to be wrong?
   */
  async whatDependsOn(subject: IndexedString | ObservationsRef): Promise<DependencyReport> {
    // **`typeof` cannot tell these apart any more, and that is the trap.** A handle is a
    // branded string now, so `typeof subject === "string"` is true for both arms of the union
    // and sent every handle off to be looked up by logical name -- which threw `no artefact
    // named "ART_21"`.
    const start = isRefOfKind("observations", subject)
      ? (subject as ObservationsRef)
      : await this.artefactNamed(subject);

    // Walk the pipeline downstream before asking what rests on it. An analysis can read another
    // analysis's output (row AE), so invalidating a raw input reaches every stage built on top
    // of it -- and asking only about the artefact handed in stops at the first stage.
    const reached = new Set<ObservationsRef>([start]);
    for (let frontier = [start]; frontier.length > 0; ) {
      const next: ObservationsRef[] = [];
      for (const id of frontier) {
        const downstream = await this.graph.query(
          `MATCH (:Artefact {natural_id: $id})<-[:CONSUMES]-(:Computation)-[:PRODUCES]->(out:Artefact)
           RETURN out`,
          { out: vertexProps<{ natural_id: string }>() },
          { id },
        );
        for (const row of downstream) {
          if (reached.has(ref("observations", row.out.natural_id))) continue;
          reached.add(ref("observations", row.out.natural_id));
          next.push(ref("observations", row.out.natural_id));
        }
      }
      frontier = next;
    }

    // Deduplicated **by id**, not by wording. Two claims asserting the same
    // sentence in different lines of enquiry are two claims, and a `Set<string>`
    // of names merges them silently.
    const claims = new Map<ClaimRef, AffectedClaim>();
    const enquiries = new Map<EnquiryRef, AffectedEnquiry>();
    for (const artefact of reached) {
      const { claims: c, enquiries: e } = await this.restingOnArtefact(
        ref("observations", artefact),
      );
      for (const found of c) claims.set(found.claim, found);
      for (const found of e) enquiries.set(found.enquiry, found);
    }

    return {
      // Which record the answer is about -- and when a name was passed, which
      // record that name resolved to.
      subject: ref("observations", start),
      claims: [...claims.values()],
      enquiries: [...enquiries.values()],
      routesWalked: [
        "evidence recorded in this artefact, and the claims it bears on",
        "computations that consumed this artefact, and the claims their findings bear on",
        "the same, for every artefact downstream of this one through CONSUMES/PRODUCES",
      ],
      complete: false,
    };
  }

  /**
   * The artefacts a claim's still-current analyses consumed, for one bearing.
   */
  private async artefactsConsumedBy(
    scope: { proposition: IndexedString; enquiry?: EnquiryRef },
    bearing: "SUPPORTS" | "CHALLENGES",
  ): Promise<{ a: ArtefactProps & Identified; e: Identified }[]> {
    return this.graph
      .query(
        `MATCH (c:Claim {name: $name})<-[:${bearing}]-(e:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       ${this.withinScope(scope)}
       MATCH (u)-[:USES]->(comp:Computation)
       MATCH (comp)-[:CONSUMES]->(a:Artefact)
       // **Per claim, not per artefact**: a finding stops counting when a
       // decision stands instead of the claim it bears on.
       //
       // Two clauses, because AGE has no edge alternation; filtered in
       // TypeScript, because it has no NOT (pattern) predicate in WHERE.
       OPTIONAL MATCH (narrowed:Decision)-[:CHANGES]->(c)
       OPTIONAL MATCH (replaced:Decision)-[:SUPERSEDES]->(c)
       RETURN a, e, narrowed, replaced`,
        {
          // `natural_id` because `restingOn` deduplicates by identity: two
          // artefacts can share a `logical_name`.
          a: vertexProps<ArtefactProps & { natural_id: string }>(),
          e: vertexProps<{ natural_id: string }>(),
          narrowed: optional(vertexProps<{ natural_id: string }>()),
          replaced: optional(vertexProps<{ natural_id: string }>()),
        },
        { name: scope.proposition, ...this.scopeParams(scope) },
      )
      .then((rows) => rows.filter((r) => !r.narrowed && !r.replaced));
  }

  /**
   * The artefacts among these whose every recorded finding has been superseded.
   */
  private async retractedArtefacts(ids: ObservationsRef[]): Promise<Set<ObservationsRef>> {
    if (ids.length === 0) return new Set();
    const rows = await this.graph.query(
      `MATCH (a:Artefact) WHERE a.natural_id IN $ids
       MATCH (e:Evidence)-[:RECORDED_IN]->(a)
       // The supersession check is supersededClaim() below, per claim, not a
       // clause here: it reads BOTH predicates, and this query has no way to
       // ask for "neither" -- AGE has no NOT (pattern) predicate in WHERE. Two
       // ask for "neither" in one clause.
       OPTIONAL MATCH (e)-[:SUPPORTS]->(sup:Claim)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(chal:Claim)
       RETURN a, e, sup, chal`,
      {
        a: vertexProps<{ natural_id: string }>(),
        e: vertexProps<{ natural_id: string }>(),
        sup: optional(vertexProps<{ natural_id: string }>()),
        chal: optional(vertexProps<{ natural_id: string }>()),
      },
      { ids },
    );
    // Both bearings. A finding that CHALLENGES a claim is a finding, and
    // reading only the supporting side is the silent half of this repo's
    // six-occurrence defect.
    const standing = new Map<ObservationsRef, boolean>();
    for (const row of rows) {
      const bears = row.sup?.natural_id ?? row.chal?.natural_id;
      const gone = bears === undefined ? false : await this.supersededClaim(ref("claim", bears));
      const artefact = ref("observations", row.a.natural_id);
      standing.set(artefact, (standing.get(artefact) ?? false) || !gone);
    }
    return new Set([...standing].filter(([, anyStanding]) => !anyStanding).map(([id]) => id));
  }

  /** Whether a decision stands instead of this claim. Both predicates; see `withdrawalOf`. */
  private async supersededClaim(claim: ClaimRef): Promise<boolean> {
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
    return rows.some((r) => r.narrowed || r.replaced);
  }

  /** The claims and enquiries resting on one artefact, by the two direct routes. */
  private async restingOnArtefact(
    artefact: ObservationsRef,
  ): Promise<{ claims: AffectedClaim[]; enquiries: AffectedEnquiry[] }> {
    const rows = await this.graph.query(
      `MATCH (a:Artefact {natural_id: $id})
       OPTIONAL MATCH (a)<-[:RECORDED_IN]-(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(claim:Claim)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(challenged:Claim)
       OPTIONAL MATCH (loe:LineOfEnquiry)-[:REQUIRES]->(e)
       RETURN claim, challenged, loe`,
      {
        claim: optional(vertexProps<ClaimProps & Identified>()),
        challenged: optional(vertexProps<ClaimProps & Identified>()),
        loe: optional(vertexProps<{ name: string } & Identified>()),
      },
      { id: artefact },
    );

    // The input side. Separate query rather than more OPTIONAL MATCHes on the
    // same one, because the two routes share no bound variable and combining
    // them multiplies rows for no gain.
    const consumers = await this.graph.query(
      `MATCH (:Artefact {natural_id: $id})<-[:CONSUMES]-(:Computation)<-[:USES]-(u:EvidenceUnit)
       MATCH (u)-[:PRODUCES]->(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(claim:Claim)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(challenged:Claim)
       OPTIONAL MATCH (u)-[:ADDRESSES]->(loe:LineOfEnquiry)
       RETURN claim, challenged, loe`,
      {
        claim: optional(vertexProps<ClaimProps & Identified>()),
        challenged: optional(vertexProps<ClaimProps & Identified>()),
        loe: optional(vertexProps<{ name: string } & Identified>()),
      },
      { id: artefact },
    );

    const all = [...rows, ...consumers];
    return {
      // A claim whose refutation rested on this record is affected by
      // invalidating it, exactly as a supported one is.
      claims: all.flatMap((r) =>
        [r.claim, r.challenged]
          .filter((c): c is ClaimProps & Identified => !!c)
          .map((c) => ({ claim: ref("claim", c.natural_id), asserts: c.name })),
      ),
      enquiries: all.flatMap((r) =>
        r.loe
          ? [
              {
                enquiry: ref("enquiry", r.loe.natural_id),
                pursuing: r.loe.name,
              },
            ]
          : [],
      ),
    };
  }

  /**
   * Resolves an artefact name to one artefact, or refuses.
   */
  private async artefactNamed(name: IndexedString): Promise<ObservationsRef> {
    const rows = await this.graph.query(
      `MATCH (a:Artefact {logical_name: $name}) RETURN a`,
      { a: vertexProps<{ natural_id: string }>() },
      { name },
    );
    if (rows.length === 0)
      throw new Error(
        `no artefact named "${name}"; observations are named when they are recorded, and the handle comes back from that act`,
      );
    if (rows.length > 1) {
      throw new Error(
        `${rows.length} artefacts are named "${name}"; name which, by the record that produced it`,
      );
    }
    return ref("observations", rows[0]!.a.natural_id);
  }
}
