import { optional, vertexProps } from "@labkit/core-db/cypher";
import type {
  ArtefactProps,
  ClaimProps,
  ComputationProps,
  EvidenceProps,
  IndexedString,
} from "@labkit/core-db/domain";
import { SessionCore } from "../core";
import { ref, verdictOf } from "../report";
import type {
  CheckStatus,
  ClaimRef,
  EnquiryRef,
  EnquiryStatus,
  ObservationsRef,
  SupportExplanation,
} from "../report";
import { DomainRefusal } from "../refusal";
import type { EnquiryStatusQuery, WhySupportedQuery } from "../queries";
import { checkStatusOf, checksAnchor, criteriaChecks } from "./checks";
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
  async enquiryStatus({ enquiry }: EnquiryStatusQuery): Promise<EnquiryStatus> {
    const named = await this.graph.query(
      `MATCH (loe:LineOfEnquiry {natural_id: $id}) RETURN loe`,
      { loe: vertexProps<{ name: string }>() },
      { id: enquiry },
    );
    const loe = named[0];
    if (!loe)
      throw new DomainRefusal({
        kind: "not-found",
        message: `${enquiry} not found`,
        subject: enquiry,
      });

    const rows = await this.graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(loe:LineOfEnquiry {natural_id: $id})
       OPTIONAL MATCH (resolving:Decision)-[:CLOSES]->(loe)
       OPTIONAL MATCH (resolving)-[:ANSWERS]->(answered:Claim)
       OPTIONAL MATCH (deferring:Decision)-[:ACCEPTS]->(q)
       RETURN q, resolving, answered, deferring`,
      {
        q: vertexProps<{ name: string; natural_id: string }>(),
        resolving: optional(vertexProps<{ natural_id: string }>()),
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
    const answered = dedupeById(
      rows.flatMap((r) =>
        r.answered
          ? [{ claim: ref("claim", r.answered.natural_id), asserts: r.answered.name }]
          : [],
      ),
      (a) => a.claim,
    );
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
        bearing: null,
        answered: [],
        evidence: [],
        question,
      };

    // Abandoned is a closing decision that names no answer.
    if (answered.length === 0)
      return {
        enquiry,
        pursuing: loe.loe.name,
        contributed,
        open: false,
        closure: "abandoned",
        bearing: null,
        answered: [],
        evidence: [],
        question,
      };

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
    if (cited.length === 0)
      throw new Error(
        `answered decision ${resolving.natural_id} cites no evidence for enquiry ${enquiry}`,
      );

    return {
      enquiry,
      pursuing: loe.loe.name,
      contributed,
      open: false,
      closure: "answered",
      bearing: cited.some((r) => r.against !== null) ? "challenges" : "supports",
      answered,
      evidence: dedupeById(
        cited.map((r) => ({
          evidence: ref("evidence", r.e.natural_id),
          states: r.e.statement,
        })),
        (f) => f.evidence,
      ),
      restsOn: await this.restsOnFor(answered.map((a) => a.claim)),
      question,
    };
  }

  /**
   * Confirmatory only when every answering claim is confirmatory *and* its checks passed —
   * the rule `whatIsKnown` uses for established.
   */
  private async restsOnFor(claims: ClaimRef[]): Promise<"exploratory" | "confirmatory"> {
    const confirmatory = await this.confirmatoryOf(claims);
    for (const claim of claims) {
      if (!confirmatory.has(claim)) return "exploratory";
      if (!(await this.checksMet(claim))) return "exploratory";
    }
    return "confirmatory";
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
       // Supersession, per claim -- the same pair withdrawalOf reads: a
       // decision that stands instead of this one.
       OPTIONAL MATCH (d:Decision)-[:SUPERSEDES]->(c)
       RETURN e, comp, d`,
      {
        e: vertexProps<EvidenceProps & { natural_id: string }>(),
        comp: vertexProps<ComputationProps & Identified>(),
        d: optional(vertexProps<{ reason: string }>()),
      },
      {
        name: scope.proposition,
        ...this.scopeParams(scope),
      },
    );
  }

  /** "Why does this conclusion count as supported?" and "what did the superseded inference claim?" */
  async whySupported({ claim }: WhySupportedQuery): Promise<SupportExplanation> {
    const scope = await this.scopeOf(claim);
    const proposition = scope.proposition;
    // Both bearings, each partitioned by whether its analysis output was
    // later invalidated. A withdrawn challenge is as historical as a
    // withdrawn support -- before this, challenging findings counted as
    // current forever.
    const forRows = await this.findingsBearing(scope, "SUPPORTS");
    const againstRows = await this.findingsBearing(scope, "CHALLENGES");

    const support: SupportExplanation["support"] = [];
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
        // *analysis* was replaced. Deduped, one reason per finding.
        if (row.d) {
          if (!superseded.some((x) => x.evidence === entry.evidence && x.bearing === bearing))
            superseded.push({
              ...entry,
              bearing,
              reason: row.d.reason || "it was superseded",
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
      const checks = await criteriaChecks(this.graph, checksAnchor(bearing), { claim });
      // Keyed by criterion and subject: a rule judged against four findings is four checks a
      // claim is held to.
      for (const [criterion, found] of checks)
        for (const check of checkStatusOf(found))
          byCriterion.set(`${criterion}|${check.about ?? ""}`, check);
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

    // Standing: confirmatory when the conclusion was prespecified as such, or when a decision
    // confirmed it afterwards.
    const [prespecified, conferred] = await Promise.all([
      this.graph.query(
        `MATCH (c:Claim {natural_id: $claim}) RETURN c`,
        { c: vertexProps<{ kind?: string }>() },
        { claim },
      ),
      this.standingConferred(claim),
    ]);
    const confirmed =
      conferred !== undefined || prespecified.some((r) => r.c.kind === "confirmatory");
    const promotedBecause = conferred?.because;

    // What a synthesis was drawn across. By handle, from the claim itself:
    // `synthesise` writes `BASED_ON` at the moment the act names the findings,
    // so this is a read of what the caller said rather than a match on wording.
    const drawnAcross = (
      await this.graph.query(
        // `part`, not `on`: a RETURN name that is a SQL reserved word breaks
        // the AS clause AGE builds, and `on` is one.
        `MATCH (:Claim {natural_id: $claim})-[:BASED_ON]->(part:Claim) RETURN part`,
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
      // Five ways not to be supported, and they are different states: the interpretation
      // withdrawn, evidence bearing against it, a synthesis that measured nothing, evidence
      // that fails the standard set for it, and nothing having examined it at all.
      verdict: verdictOf({
        support,
        withdrawn,
        unmet,
        challenged: against.length > 0,
        drawnAcross,
      }),
      standing: confirmed ? "confirmatory" : "exploratory",
      ...(confirmed && promotedBecause ? { promotedBecause } : {}),
      support,
      standard,
      unmet,
      restingOn: [
        ...new Map(
          resting.map((r) => [
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
       OPTIONAL MATCH (narrowed:Decision)-[:SUPERSEDES]->(c)
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
       OPTIONAL MATCH (narrowed:Decision)-[:SUPERSEDES]->(c)
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
}
