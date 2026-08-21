/**
 * What every research verb needs, and the few helpers both halves share.
 *
 * `src/domain/session.ts` reached 2,920 lines across 62 members. The seam it
 * was split on is one the domain already asserts — CLAUDE.md's *"events explain
 * how state changed; the graph explains what the current research state is"* —
 * and the measurement bore it out: 18 write verbs and 14 read verbs partitioned
 * with **no member doing both**, and `emit` had 18 callers, every one a write.
 *
 * This class holds the graph, the clock and the event sink, plus the nine
 * helpers that both halves genuinely need. Nine, not five: the first pass found
 * five by direct use, and transitive closure through those five pulled in four
 * more — `findingFor`, `enquiriesClaiming`, `enquiryAddressedBy` and
 * `withdrawalOf`, the last of which a regex pass had called read-only.
 *
 * It deliberately holds **no verbs and no `emit`**. `emit` lives on the write
 * side so that a read *cannot* stamp an event: the invariant that reads are
 * silent is structural here rather than remembered.
 */

import type { TenantGraph } from "../db/graph";
import { optional, vertexProps } from "../db/cypher";
import {
  type Clock,
  type EventSink,
  inMemoryEventLog,
  systemClock,
} from "./events";
import type { ClaimSubject, AnalysisRef } from "./report";

export interface ResearchSessionOptions {
  clock?: Clock;
  events?: EventSink;
}

export class SessionCore {
  protected readonly clock: Clock;
  readonly events: EventSink;

  constructor(
    protected readonly graph: TenantGraph,
    options: ResearchSessionOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.events = options.events ?? inMemoryEventLog();
  }

  protected async findingFor(
    analysis: AnalysisRef,
    proposition: string,
  ): Promise<string | undefined> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $analysis})<-[:USES]-(u:EvidenceUnit)-[:PRODUCES]->(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(sc:Claim {name: $proposition})
       OPTIONAL MATCH (e)-[:CHALLENGES]->(cc:Claim {name: $proposition})
       RETURN e, sc, cc`,
      {
        e: vertexProps<{ natural_id: string }>(),
        sc: optional(vertexProps<{ name: string }>()),
        cc: optional(vertexProps<{ name: string }>()),
      },
      { analysis: analysis.id, proposition },
    );
    return rows.find((r) => r.sc !== null || r.cc !== null)?.e.natural_id;
  }

  /** Is this enquiry open, and if not, how did it close? */

  protected withinScope(scope: { enquiry?: string }): string {
    return scope.enquiry
      ? `MATCH (u)-[:ADDRESSES]->(:LineOfEnquiry {natural_id: $enquiry})`
      : "";
  }

  protected async workGatedBy(gates: string[]): Promise<string[]> {
    const objectives = new Set<string>();
    for (const gate of gates) {
      const rows = await this.graph.query(
        `MATCH (:Gate {natural_id: $id})-[:GATES]->(t:Task) RETURN t`,
        { t: vertexProps<{ objective: string }>() },
        { id: gate },
      );
      for (const row of rows) objectives.add(row.t.objective);
    }
    return [...objectives].sort();
  }

  /**
   * Confirmatory results standing behind these gates.
   *
   * Reaches the *results*, not just the work: gate -> work -> the unit that
   * carried it out -> what that unit concluded. Without the last two hops this
   * could only report "no confirmatory result affected" by virtue of seeing no
   * results at all, which is the same answer a genuinely clean amendment
   * gives — see S-4 on absence of evidence reading as a negative.
   */

  protected async confirmatoryResultsBehind(gates: string[]): Promise<string[]> {
    const affected = new Set<string>();
    for (const gate of gates) {
      for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
        const rows = await this.graph.query(
          `MATCH (:Gate {natural_id: $id})-[:GATES]->(:Task)-[:IMPLEMENTS]->(u:EvidenceUnit)
           MATCH (u)-[:PRODUCES]->(e:Evidence)-[:${bearing}]->(c:Claim)
           RETURN c`,
          { c: vertexProps<{ name: string; kind?: string }>() },
          { id: gate },
        );
        for (const row of rows)
          if (row.c.kind === "confirmatory") affected.add(row.c.name);
      }
    }
    return [...affected].sort();
  }

  protected async withdrawalOf(scope: {
    proposition: string;
    enquiry?: string;
  }): Promise<{ withdrawn: boolean; replacedBy?: string }> {
    const rows = await this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       ${this.withinScope(scope)}
       OPTIONAL MATCH (d:Decision)-[:CHANGES]->(c)
       OPTIONAL MATCH (d)-[:MOTIVATES]->(now:Claim)
       RETURN c, d, now`,
      {
        c: vertexProps<{ natural_id: string }>(),
        d: optional(vertexProps<{ natural_id: string }>()),
        now: optional(vertexProps<{ name: string }>()),
      },
      {
        name: scope.proposition,
        ...(scope.enquiry ? { enquiry: scope.enquiry } : {}),
      },
    );
    if (rows.length === 0) return { withdrawn: false };

    // Every node asserting this proposition must have been withdrawn. One left
    // standing means the record still claims it -- which is exactly the
    // duplicate-claim case S-12 was built to catch.
    const standing = new Set(
      rows.filter((r) => !r.d).map((r) => r.c.natural_id),
    );
    if (standing.size > 0) return { withdrawn: false };

    const replacedBy = rows.find((r) => r.now)?.now?.name;
    return { withdrawn: true, ...(replacedBy ? { replacedBy } : {}) };
  }

  /** Questions closed on the strength of a proposition — what a reinterpretation puts at risk. */

  protected async decidedOnTheStrengthOf(scope: {
    proposition: string;
    enquiry?: string;
  }): Promise<string[]> {
    const asked = new Set<string>();
    // Both bearings: a question can be settled "no" on a finding that
    // challenges the proposition, and that closure rests on this reading just
    // as much as a supporting one does.
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (d:Decision)-[:BASED_ON]->(e:Evidence)-[:${bearing}]->(:Claim {name: $name})
         MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
         ${this.withinScope(scope)}
         MATCH (d)-[:RESOLVES]->(q:Question)
         RETURN q`,
        { q: vertexProps<{ name: string }>() },
        {
          name: scope.proposition,
          ...(scope.enquiry ? { enquiry: scope.enquiry } : {}),
        },
      );
      for (const row of rows) asked.add(row.q.name);
    }
    return [...asked].sort();
  }

  /**
   * Works out which claim a caller meant.
   *
   * Proposition text identifies a claim only while a sentence is asserted in
   * one line of enquiry. S-5 is the case where it is asserted in two — the
   * same words about different endpoints — and there text identifies nothing.
   * Rather than picking one, this refuses and says how many there are. The
   * wrong answer available here is not "no result": before this existed,
   * `whySupported()` merged both into a single claim that was simultaneously
   * supported and challenged, and `reinterpret()` withdrew an unrelated line
   * of work's claim with no decision saying so.
   *
   * Scope is the line of enquiry, reached by traversal. Nothing is stored on
   * the claim — see PJ-008 row C.
   */

  protected async scopeFor(
    subject: ClaimSubject,
  ): Promise<{ proposition: string; enquiry?: string }> {
    if (typeof subject !== "string") {
      // A citation has to be one the cited analysis actually made. Without
      // this, naming a proposition it never concluded still resolves to its
      // line of enquiry, and the answer comes back about whatever *other*
      // analysis in that scope said -- so `reinterpret()` would withdraw a
      // claim the cited analysis never asserted. Same check `closeEnquiry()`
      // and `amendDesign()` already make of their citations.
      const concluded = await this.findingFor(
        subject.analysis,
        subject.proposition,
      );
      if (!concluded) {
        throw new Error(
          `analysis ${subject.analysis.id} concluded nothing about "${subject.proposition}"`,
        );
      }
      const enquiry = await this.enquiryAddressedBy(subject.analysis);
      if (!enquiry)
        throw new Error(
          `analysis ${subject.analysis.id} addresses no line of enquiry`,
        );
      return { proposition: subject.proposition, enquiry };
    }

    const scopes = await this.enquiriesClaiming(subject);
    if (scopes.length > 1) {
      throw new Error(
        `"${subject}" is claimed in ${scopes.length} lines of enquiry; name which, by the analysis that concluded it`,
      );
    }
    return { proposition: subject };
  }

  /** Lines of enquiry in which some claim of this wording is asserted. */

  protected async enquiriesClaiming(proposition: string): Promise<string[]> {
    const found = new Set<string>();
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (:Claim {name: $name})<-[:${bearing}]-(e:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
         MATCH (u)-[:ADDRESSES]->(loe:LineOfEnquiry)
         RETURN loe`,
        { loe: vertexProps<{ natural_id: string }>() },
        { name: proposition },
      );
      for (const row of rows) found.add(row.loe.natural_id);
    }
    return [...found];
  }

  protected async enquiryAddressedBy(
    analysis: AnalysisRef,
  ): Promise<string | undefined> {
    const rows = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:ADDRESSES]->(loe:LineOfEnquiry) RETURN loe`,
      { loe: vertexProps<{ natural_id: string }>() },
      { id: analysis.id },
    );
    return rows[0]?.loe.natural_id;
  }

  /**
   * Whether two findings actually conflict.
   *
   * Answered from what each claim is attached to — the question it answers and
   * the way its evidence bears — never from comparing the two sentences. In
   * S-5 the sentences are identical and the answer is "no".
   */
}
