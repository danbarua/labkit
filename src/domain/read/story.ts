import { edgeProps, optional, scalar, vertexProps } from "../../db/cypher";
import type {
  ArtefactProps,
  ClaimProps,
  ComputationProps,
  EvidenceProps,
  IdentityString,
  IndexedString,
} from "../../db/domain";
import { SessionCore } from "../core";
import { compose, per, type Row } from "../facts";
import { ref, isRefOfKind } from "../report";
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

export class StoryGroup extends SessionCore {
  /** Is this enquiry open, and if not, how did it close? */
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

    // Closure attaches to the question the enquiry pursues, not to the
    // enquiry itself -- an enquiry is a way of pursuing a question, and it is
    // the question that gets answered.
    const rows = await this.graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $id})
       OPTIONAL MATCH (resolving:Decision)-[:RESOLVES]->(q)
       OPTIONAL MATCH (deferring:Decision)-[:DEFERS]->(q)
       RETURN q, resolving, deferring`,
      {
        q: vertexProps<{ name: string; natural_id: string }>(),
        resolving: optional(vertexProps<{ natural_id: string }>()),
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

    // What this pursuit itself produced. Evidence units address the line of
    // enquiry they were recorded against, so this is the enquiry's own work --
    // and it is the field that makes "where is my ablation up to?" answerable
    // without inferring anything from the question's state.
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

    // Identity and wording, kept apart. The old line was
    // `rows[0]?.q.name ?? loe.loe.name` -- wording, silently substituting the
    // enquiry's own name when no question stood behind it. Two entities' text
    // in one field, and no way for a caller to reach the question at all.
    const behind = rows[0]?.q ?? null;
    const resolving = rows.find((r) => r.resolving)?.resolving ?? null;
    const deferred = rows.some((r) => r.deferring);

    if (!resolving && !deferred) {
      return {
        enquiry,
        pursuing: loe.loe.name,
        contributed,
        question: behind && {
          question: ref("question", behind.natural_id),
          asks: behind.name,
          open: true,
          closure: null,
          answer: null,
          evidence: [],
        },
      };
    }
    // Accepted, not closed. `open` stays TRUE: a question left open on purpose
    // is not shut. It has not been answered and nobody claims it has; what
    // changed is that leaving it open is now a
    // recorded decision rather than an absence of one.
    const accepting = rows.find((r) => r.deferring)?.deferring ?? null;
    if (accepting && !resolving) {
      const inLightOf = await this.graph.query(
        `MATCH (:Decision {natural_id: $id})-[:BASED_ON]->(e:Evidence) RETURN e`,
        { e: vertexProps<{ statement: string } & Identified>() },
        { id: accepting.natural_id },
      );
      return {
        enquiry,
        pursuing: loe.loe.name,
        contributed,
        question: behind && {
          question: ref("question", behind.natural_id),
          asks: behind.name,
          open: true,
          closure: "accepted-as-unresolved",
          answer: null,
          evidence: dedupeById(
            inLightOf.map((r) => ({
              evidence: ref("evidence", r.e.natural_id),
              states: r.e.statement,
            })),
            (f) => f.evidence,
          ),
          acceptedBecause: accepting.reason,
          reopensIf: accepting.invalidation_check,
        },
      };
    }

    // What the closing decision rests on. Nothing cited means the question was
    // abandoned, not answered -- absence of evidence is not a negative result.
    const cited = await this.graph.query(
      // Only the challenging bearing is fetched: polarity is "no" when
      // something challenges and "yes" otherwise, so the supporting side is the
      // default rather than an input. Returning it as `forClaim` would also be
      // silently broken, since a camelCase column decodes as null (see
      // `buildAsClause`, which
      // now refuses the name that hid this).
      `MATCH (:Decision {natural_id: $id})-[:BASED_ON]->(e:Evidence)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(against:Claim)
       RETURN e, against`,
      {
        e: vertexProps<{ statement: string } & Identified>(),
        against: optional(vertexProps<{ name: string }>()),
      },
      { id: resolving!.natural_id },
    );

    if (cited.length === 0) {
      return {
        enquiry,
        pursuing: loe.loe.name,
        contributed,
        question: behind && {
          question: ref("question", behind.natural_id),
          asks: behind.name,
          open: false,
          closure: "abandoned",
          answer: null,
          evidence: [],
        },
      };
    }

    // Polarity is derived from which way the cited findings cut, not stored on
    // the decision: a question answered by evidence that challenges its
    // proposition was answered "no".
    const challenges = cited.some((r) => r.against !== null);

    // What the closure rests on: promoted work, or scratch nobody promoted.
    // Answered either way -- the question is settled as far as anyone has taken
    // it -- but a reader deciding whether to build on it should not have to go
    // and look.
    // **Both bearings.** A question answered *no* is settled by evidence that
    // CHALLENGES the claim, so walking only SUPPORTS finds no claim at all and
    // a promoted negative result reports itself as resting on scratch. No edge
    // alternation in AGE, so it is two OPTIONAL MATCHes.
    const promoted = await this.graph.query(
      `MATCH (:Decision {natural_id: $id})-[:BASED_ON]->(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(sc:Claim)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(cc:Claim)
       RETURN sc, cc`,
      {
        sc: optional(vertexProps<{ kind?: string }>()),
        cc: optional(vertexProps<{ kind?: string }>()),
      },
      { id: resolving!.natural_id },
    );
    return {
      enquiry,
      pursuing: loe.loe.name,
      contributed,
      question: behind && {
        question: ref("question", behind.natural_id),
        asks: behind.name,
        open: false,
        closure: "answered",
        answer: challenges ? "no" : "yes",
        evidence: dedupeById(
          cited.map((r) => ({
            evidence: ref("evidence", r.e.natural_id),
            states: r.e.statement,
          })),
          (f) => f.evidence,
        ),
        restsOn: promoted.some((r) => (r.sc ?? r.cc)?.kind === "confirmatory")
          ? "confirmatory"
          : "exploratory",
      },
    };
  }

  /**
   * Findings bearing on a proposition **within an enquiry**, one way or the
   * other — deliberately not by claim handle, which was tried and refuted.
   *
   * `bearing` is interpolated because pglite-age rejects edge-type alternation
   * outright — `[:SUPPORTS|CHALLENGES]` is a syntax error, not merely
   * unsupported for variable-length patterns. The value comes from a closed set
   * of literals here, never from a caller.
   *
   * Everything else in `whySupported` now selects by handle, because two
   * analyses in one enquiry concluding the same sentence are two claims and a
   * check held by one is not the other's standard. **Findings are the
   * exception**, and the distinction is a domain fact: a re-run producing the
   * same conclusion **corroborates**, so findings aggregate over the
   * proposition, while a prespecified check **belongs to** the analysis held to
   * it. Same two nodes, two different questions, two answers.
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
   *
   * The execution verdict is derived from what each run recorded consuming, not
   * from a stored flag: two runs are a reproduction when they read the same
   * recorded inputs. Structure in the query rather than in the stored model, so
   * there is no value anyone can set to "reproduced".
   */
  async reproductionOf(verification: AnalysisRef): Promise<ReproductionReport> {
    const link = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:PRODUCES]->(new:Evidence)
       MATCH (new)-[:REVERIFIES]->(old:Evidence)<-[:PRODUCES]-(:EvidenceUnit)-[:USES]->(oldcomp:Computation)
       RETURN new, old, oldcomp`,
      {
        new: vertexProps<{ natural_id: string }>(),
        old: vertexProps<{ natural_id: string }>(),
        oldcomp: vertexProps<{ natural_id: string; kind: string }>(),
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
      { c: vertexProps<{ kind: string }>() },
      { id: verification },
    );

    // Keyed by natural id, never by `logical_name`. Two runs can each record
    // something called "initial conditions" and mean different data; comparing
    // the names would make those the same execution input.
    // What a run read, **in order and with repeats**, plus the same as a set
    // for the difference calculation below.
    //
    // Two shapes because they answer different questions. `read` is the
    // sequence the caller gave: `from: [A, B, A]` is three occurrences and a
    // reader comparing two runs needs all three. `bySubject` is which records
    // were involved, which is what `differs` is about -- reading one twice and
    // reading it once are not a *difference in inputs*, they are a difference
    // in the sequence, and the two lists show that plainly.
    //
    // Edges written before `positions` existed have none; they sort last and
    // among themselves by identity, so the list is stable rather than
    // arbitrary. An absent position is not position zero.
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
      verificationMethod: method[0]!.c.kind,
      of: ref("analysis", found.oldcomp.natural_id),
      ofMethod: found.oldcomp.kind,
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
   *
   * The chain walks claim-to-claim through the decisions that made it: each
   * revision `CHANGES` the reading it withdrew and `MOTIVATES` the one that
   * replaced it. No timestamps, nothing from the event log, and — unlike
   * `designHistory` — no `SUPERSEDES` edge, because with both halves of each
   * step recorded the order is already implied and a supersession edge would
   * be a writer with no reader.
   */
  async interpretationHistory(claim: ClaimRef): Promise<InterpretationHistory> {
    // **Walked by id.** `reinterpret` writes `Decision -MOTIVATES-> narrower`
    // and `Decision -CHANGES-> each withdrawn claim`, both carrying natural
    // ids, so every step is reachable by identity.
    //
    // Matching by NAME instead breaks on two independent chains passing through
    // one sentence: the match finds the other chain's claim and its decision,
    // and a legitimate history throws `is not a single line`. Same text is not
    // same claim.
    const proposition = await this.assertedBy(claim);
    if (proposition === undefined)
      throw new Error(
        `no claim ${claim}; a claim exists once an analysis concludes it, and its handle comes back from that act or from looking up the exact proposition it asserts`,
      );
    const steps: Revision[] = [];
    let current: ConcludedClaim[] = [{ claim, asserts: proposition }];

    // Seeded with the entry claim, which is what catches a self-loop on the
    // first step rather than the second.
    const seen = new Set<ClaimRef>([claim]);

    for (;;) {
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
        { ids: current.map((c) => c.claim) },
      );
      // One decision per step. This is now a real structural statement -- the
      // history is a line rather than a merge -- where the old `replaced.size`
      // guard was about wording and fired on chains that never met.
      const decisions = new Set(rows.map((r) => r.d.natural_id));
      if (decisions.size > 1) {
        throw new Error(
          `interpretation history for "${proposition}" is not a single line at "${current.map((c) => c.asserts).join('", "')}"`,
        );
      }
      const step = rows[0];
      if (!step) break;

      // Every record the decision withdrew, not the one that came back first.
      // One decision withdraws every claim asserting the reading it replaced,
      // so this is plural by construction: two analyses reaching one reading are
      // withdrawn together.
      const withdrew: ConcludedClaim[] = [
        ...new Map(rows.map((r) => [r.was.natural_id, r.was] as const)).values(),
      ].map((was) => ({
        claim: ref("claim", was.natural_id),
        asserts: was.name,
      }));

      for (const w of withdrew) {
        if (seen.has(w.claim))
          throw new Error(
            `interpretation history for "${proposition}" loops at "${w.asserts}"; a narrowing chain must not revisit a claim, so this history cannot be walked`,
          );
        seen.add(w.claim);
      }

      steps.unshift({
        revision: ref("decision", step.d.natural_id),
        previously: withdrew,
        nowClaims: {
          claim: ref("claim", step.nxt.natural_id),
          asserts: step.nxt.name,
        },
        reason: step.d.reason,
        // Scoped to the withdrawn claim's own line of enquiry. The bare
        // proposition would ask "what was decided on the strength of this
        // SENTENCE", which reaches another chain's decisions.
        restingOnTheOldReading: await this.decidedOnTheStrengthOf(
          await this.scopeOf(withdrew[0]!.claim),
        ),
      });
      current = withdrew;
    }

    return {
      originally: steps[0]?.previously ?? [{ claim, asserts: proposition }],
      // The handle the caller asked about, not one re-found by its wording.
      nowClaims: { claim, asserts: proposition },
      revisions: steps,
    };
  }

  /**
   * Whether two findings actually conflict.
   *
   * Answered from what each claim is attached to — the question it answers and
   * the way its evidence bears — never from comparing the two sentences. Two
   * claims can be worded identically and not conflict at all.
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
          method: row.comp.kind,
          analysis: ref("analysis", row.comp.natural_id),
        };
        // **Per claim, not per artefact**: a decision that changed *this*
        // claim, which is the same fact `withdrawalOf` reads. An artefact-grain
        // answer could only say why the whole *analysis* was replaced.
        //
        // Deduped, and one reason per finding rather than one per review of
        // its unit.
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
              method: row.comp.kind,
            });
        } else {
          live.push(entry);
        }
      }
    }

    // What the still-current analyses actually consumed -- one hop from the
    // computation, not a detour through the enquiry. Only currently-standing
    // findings count: a superseded analysis's inputs are not what the claim
    // rests on now.
    // Both bearings, and by handle: a claim its evidence bears *against* rests
    // on inputs exactly as one it supports does, and a one-sided walk reports
    // `restingOn: []` for it.
    const resting = (
      await Promise.all(
        (["SUPPORTS", "CHALLENGES"] as const).map((bearing) =>
          this.artefactsConsumedBy(scope, bearing),
        ),
      )
    ).flat();

    // The standard the finding was held to, if it was held to one. The criteria
    // a researcher agreed before the run are what "does this stand?" is
    // answered against; without them a finding whose own prespecified checks
    // failed reads as `supported: true`.
    //
    // Same invalidation filter as `restingOn` above: a replaced analysis's
    // checks are as historical as its findings, and applying one filter and not
    // the other makes two fields of one answer disagree.
    //
    // **Boundary: only the SUPPORTING analyses' standards are read.** An
    // analysis recorded with `heldTo` whose findings CHALLENGE the proposition
    // reads as a live challenge even if its own checks failed, so `challenged`
    // is not qualified the way `supported` is. What would settle it is a null
    // result whose robustness checks disagree, which nothing records yet.
    // The same fact the survey and a gate read, so "which checks does this
    // claim answer to" is one definition. Selected by handle: two analyses in
    // one enquiry concluding the same sentence are two claims, and matching by
    // wording makes this verb and `whatIsKnown` contradict each other.
    //
    // Both bearings, merged, and a loop rather than two hand-written anchors
    // because the one-sided version is silent: a promoted negative result
    // reports "held to no prespecified standard" while the record holds the
    // check.
    // Which of the inputs this claim rests on have been retracted outright --
    // every finding they record superseded. One query for all of them.
    const retractedInputs = await this.retractedArtefacts([
      ...new Set(resting.map((r) => ref("observations", r.a.natural_id))),
    ]);

    const byCriterion = new Map<CriterionRef, CheckStatus>();
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const { cypher, decoders } = compose(checksAnchor(bearing), checkStatus, {
        crit: vertexProps<{ natural_id: string; proposition: string }>(),
      });
      const rows = (await this.graph.query(cypher, decoders, { claim })) as unknown as Row[];
      for (const [criterion, check] of per(checkStatus, rows)) {
        byCriterion.set(ref("criterion", criterion), check);
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
    // carried it. `support` stays populated deliberately: the findings are
    // fine, and blanking them would say the numbers had gone wrong when only
    // the reading moved.
    const { withdrawn, replacedBy } = await this.withdrawalOf(scope);

    // Standing, and why it was conferred. Read from the claim rather than the
    // conclusion so a promotion taken later is visible here at all.
    // By handle, and with no traversal at all. A promotion is an edge on the
    // claim, so reaching it through `<-[:SUPPORTS]-` cannot see a promoted
    // negative result, and selecting by name within an enquiry can return a
    // different claim's promotion.
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

    return {
      // The handle the caller asked with, echoed so the answer names its own
      // subject once it is stored or sent.
      claim,
      proposition,
      // Four ways to not be supported, and they are different states: no
      // evidence at all, the interpretation withdrawn, evidence that exists
      // and fails the standard set for it, and evidence that settles the
      // proposition neither way. `support`
      // stays populated in the third case for the same reason it does in the
      // second: the numbers are fine, and blanking them would say otherwise.
      supported: support.length > 0 && !withdrawn && unmet.length === 0 && !undecided,
      standing: undecided ? "undecided" : confirmed ? "confirmatory" : "exploratory",
      ...(confirmed && promotedBecause ? { promotedBecause } : {}),
      support,
      reverifiedBy,
      standard,
      unmet,
      // Re-verifying findings are excluded here for the same reason they are
      // kept out of `support`: the claim does not rest on inputs belonging to
      // something this very report says is not an independent supporting
      // finding. Filtered in TypeScript rather than in the query, because AGE
      // rejects a `NOT (pattern)` predicate outright -- `cypher_yyerror`, not a
      // decode problem.
      // Deduplicated by **identity**, never by name. Two artefacts may share a
      // `logical_name`, since a regeneration carries the name of the part it
      // replaces, so collapsing on the name reports a conclusion resting on one
      // input when it rests on two, with the vanished one indistinguishable
      // from the survivor.
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
   *
   * The caller re-runs whatever it can and offers the hashes it got back; this
   * says which parts match, which disagree, and which nobody can check because
   * the original never recorded a hash. The one reader of `content_hash`.
   *
   * Offered per part rather than by name, deliberately. A regenerated part
   * carries the name of the part it regenerates, so a name-keyed map would
   * merge exactly the two things this scenario exists to keep apart.
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
      // Two ways for no comparison to happen, and neither is inequality:
      // the record has no hash (permanent, about the artefact), or this
      // attempt did not rebuild the part (about the attempt). `differing` is a
      // comparison that ran and came out unequal, which is a different kind of
      // statement. Folding either absence into it claims evidence the record
      // does not have.
      //
      // Keyed by natural id, never by name: an original and its regeneration
      // legitimately share a `logical_name`, so bare names put one string in
      // `exact` and `differing` at once.
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
      // Anything not shown to match leaves the construction unshown.
      //
      // `exact.length > 0` is the conjunct three empty lists cannot supply: an
      // analysis that consumed nothing satisfies "nothing differed, nothing was
      // unverifiable, nothing went unrebuilt" vacuously, and would report that
      // a construction with no parts reproduces. Absence is still absence.
      reproducible:
        exact.length > 0 &&
        differing.length === 0 &&
        unverifiable.length === 0 &&
        notRebuilt.length === 0,
    };
  }

  /**
   * What is affected if this artefact turns out to be wrong?
   *
   * Deliberately the affected side only. What is *not* affected depends on what
   * a replacement rests on rather than on the invalidated record alone.
   *
   * Distinct from `whySupported()`'s `restingOn`: this asks which enquiries
   * REQUIRE the evidence held here, not what any computation read.
   *
   * **Two routes in.** An artefact reached by `Evidence -RECORDED_IN->` is an
   * analysis *output*, and the evidence recorded in it bears on claims
   * directly. An artefact a computation `CONSUMES` is an *input*, and nothing
   * recorded in it
   * bears on anything; what rests on it are the claims of every analysis that
   * read it. Walking only the first returned `claims: []` for an input a claim
   * demonstrably rested on, while still naming the enquiry — a confident,
   * populated, wrong answer, and the same verb answering one question two
   * incompatible ways depending on which end of a computation it was aimed at.
   * `Evidence` carries both senses, and a query that walks one of them answers
   * about half the record.
   *
   * `subject` is a name while a name identifies one artefact, and an explicit
   * reference when it does not: a regenerated part carries the name of the part
   * it regenerates. Given an ambiguous name this **refuses** rather than answering
   * about the union, because the union is exactly the "inferred provenance
   * silently inheriting the original's standing" the scenario exists to prevent.
   */
  async whatDependsOn(subject: IndexedString | ObservationsRef): Promise<DependencyReport> {
    // **`typeof` cannot tell these apart any more, and that is the trap.** A
    // handle is a branded string now, so `typeof subject === "string"` is true
    // for both arms of the union and sent every handle off to be looked up by
    // logical name -- which threw `no artefact named "ART_21"`. The union is
    // real to the type system and invisible at runtime, so the discrimination
    // has to read the value: `isRefOfKind` asks whether the id's own prefix
    // names an Artefact, which is the same question `ref()` asks when minting.
    const start = isRefOfKind("observations", subject)
      ? (subject as ObservationsRef)
      : await this.artefactNamed(subject);

    // Walk the pipeline downstream before asking what rests on it. An analysis
    // can read another analysis's output (row AE), so invalidating a raw input
    // reaches every stage built on top of it -- and asking only about the
    // artefact handed in stops at the first stage.
    //
    // Iterative rather than a variable-length pattern: the chain alternates
    // CONSUMES and PRODUCES, and AGE has no edge-type alternation at all.
    // Visited-set rather than a depth cap, so a
    // cycle terminates without silently truncating a legitimate long pipeline.
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
   *
   * The inverse of {@link restingOnArtefact}, which walks artefact → claims.
   * Named apart deliberately: `restingArtefacts` beside `restingOnArtefact` was
   * two names one letter apart for opposite traversals.
   *
   * One hop from the computation, not a detour through the enquiry. Only
   * currently-standing findings count: a superseded analysis's inputs are not
   * what the claim rests on now — and the `invalidated` filter is on the
   * evidence's **own** output, never on what the computation read, because a
   * retracted input must still be reported and marked.
   *
   * Called once per bearing: a single-bearing version reports an empty list for
   * a claim its evidence bears *against*, the same silent hole `checksAnchor`
   * exists to close.
   *
   * **Selected by proposition within the enquiry, not by handle** — the same
   * exception `findingsBearing` documents, and refuted the same way: selecting
   * by handle emptied `restingOn` for a two-stage pipeline in
   * `tests/subject-identity.test.ts`. What a claim rests on aggregates over the
   * proposition; what it was *held to* belongs to one analysis.
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
   *
   * **Every, not any.** An artefact holds one finding per conclusion its
   * analysis drew; replacing one leaves the rest standing, and so leaves the
   * artefact a live record a reader may still rest on. Only when nothing in it
   * stands has the record itself been retracted.
   *
   * An artefact holding no findings at all is **not** retracted: there is
   * nothing in it to have fallen.
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
   *
   * Two artefacts can carry one name — a regenerated part carries the name of
   * the part it regenerates — and answering about both merges a historical
   * record with an inferred one. Declining beats guessing, exactly as it does
   * for a claim asserted in two lines of enquiry.
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
