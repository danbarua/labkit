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
import type {
  ClaimSubject,
  ClaimRef,
  AnalysisRef,
  ConclusionRef,
  ConfirmatoryResult,
  ReplacementClaim,
  DecidedQuestion,
  GatedWork,
} from "./report";
import { ref } from "./report";

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

  /**
   * The finding that bears on a claim, and what the claim asserts.
   *
   * The direct replacement for `findingFor(analysis, proposition)`: with a
   * `ClaimRef` there is nothing to search for, so this matches the claim by id
   * and walks one edge back. No wording crosses the query.
   */
  protected async findingOn(
    claim: ClaimRef,
  ): Promise<{ evidence: string; asserts: string } | undefined> {
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (c:Claim {natural_id: $id})<-[:${bearing}]-(e:Evidence)
         RETURN c, e`,
        {
          c: vertexProps<{ name: string }>(),
          e: vertexProps<{ natural_id: string }>(),
        },
        { id: claim.id },
      );
      const found = rows[0];
      if (found) return { evidence: found.e.natural_id, asserts: found.c.name };
    }
    return undefined;
  }

  /** What a claim asserts. */
  protected async assertedBy(claim: ClaimRef): Promise<string | undefined> {
    const rows = await this.graph.query(
      `MATCH (c:Claim {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ name: string }>() },
      { id: claim.id },
    );
    return rows[0]?.c.name;
  }

  /** The single finding by which an analysis concluded something about one proposition. */
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

  /**
   * Restricts a claim traversal to one line of enquiry, when the caller named
   * one. Empty when they did not — a sentence asserted in a single scope needs
   * no qualifier, and every scenario before S-5 relies on that.
   */

  protected withinScope(scope: { enquiry?: string }): string {
    return scope.enquiry
      ? `MATCH (u)-[:ADDRESSES]->(:LineOfEnquiry {natural_id: $enquiry})`
      : "";
  }

  /** Work these gates protect, and which therefore has to be run again when their condition changes. */
  protected async workGatedBy(gates: string[]): Promise<GatedWork[]> {
    // Keyed by id, not by objective. Two tasks can share an objective and be
    // two tasks; deduping on the text reported one piece of work to re-run
    // where there were two. Same traversal `gateStatus` reports as
    // `{work, objective}` -- one was converted and this was not (PJ-030 §7).
    const found = new Map<string, GatedWork>();
    for (const gate of gates) {
      const rows = await this.graph.query(
        `MATCH (:Gate {natural_id: $id})-[:GATES]->(t:Task) RETURN t`,
        { t: vertexProps<{ objective: string; natural_id: string }>() },
        { id: gate },
      );
      for (const row of rows)
        found.set(row.t.natural_id, { work: ref("work", row.t.natural_id), objective: row.t.objective });
    }
    return [...found.values()].sort((a, b) => a.work.id.localeCompare(b.work.id));
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

  protected async confirmatoryResultsBehind(gates: string[]): Promise<ConfirmatoryResult[]> {
    // Keyed by id. S-5's literal case: one sentence asserted in two lines of
    // enquiry is two claims, and merging them understated the blast radius of
    // a scientific amendment.
    const affected = new Map<string, ConfirmatoryResult>();
    for (const gate of gates) {
      for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
        const rows = await this.graph.query(
          `MATCH (:Gate {natural_id: $id})-[:GATES]->(:Task)-[:IMPLEMENTS]->(u:EvidenceUnit)
           MATCH (u)-[:PRODUCES]->(e:Evidence)-[:${bearing}]->(c:Claim)
           RETURN c`,
          { c: vertexProps<{ name: string; kind?: string; natural_id: string }>() },
          { id: gate },
        );
        for (const row of rows)
          if (row.c.kind === "confirmatory")
            affected.set(row.c.natural_id, { claim: ref("claim", row.c.natural_id), asserts: row.c.name });
      }
    }
    return [...affected.values()].sort((a, b) => a.claim.id.localeCompare(b.claim.id));
  }

  /** Whether the record has stopped asserting a proposition, and what replaced it. */
  protected async withdrawalOf(scope: {
    proposition: string;
    enquiry?: string;
  }): Promise<{ withdrawn: boolean; replacedBy?: ReplacementClaim }> {
    const rows = await this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       ${this.withinScope(scope)}
       OPTIONAL MATCH (d:Decision)-[:CHANGES]->(c)
       OPTIONAL MATCH (d)-[:MOTIVATES]->(now:Claim)
       RETURN c, d, now`,
      {
        c: vertexProps<{ natural_id: string }>(),
        d: optional(vertexProps<{ natural_id: string }>()),
        now: optional(vertexProps<{ name: string; natural_id: string }>()),
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

    // Identity as well as wording. This was the claim's NAME, picked from
    // whichever row happened to carry one -- arbitrary row and arbitrary text,
    // in the field that says what the record asserts instead (PJ-030 §7).
    const now = rows.find((r) => r.now)?.now;
    return {
      withdrawn: true,
      ...(now ? { replacedBy: { claim: ref("claim", now.natural_id), asserts: now.name } } : {}),
    };
  }

  /**
   * The claim a conclusion refers to, by id.
   *
   * Both bearings, because a conclusion may challenge rather than support and
   * `doTheseConflict` needs the handle either way. Two queries rather than
   * `[:SUPPORTS|CHALLENGES]`, which pglite-age rejects outright.
   *
   * Lifted here from `WriteSurface` when `sideOf` needed it: `ConflictSide`
   * carried four entity-naming fields and not one identifier (PJ-030 §7).
   */
  protected async claimFor(ref: ConclusionRef): Promise<string> {
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:PRODUCES]->(:Evidence)-[:${bearing}]->(c:Claim {name: $name})
         RETURN c`,
        { c: vertexProps<{ natural_id: string }>() },
        { id: ref.analysis.id, name: ref.proposition },
      );
      const found = rows[0];
      if (found) return found.c.natural_id;
    }
    throw new Error(`analysis ${ref.analysis.id} concluded nothing about "${ref.proposition}"`);
  }

  /** Questions closed on the strength of a proposition — what a reinterpretation puts at risk. */

  protected async decidedOnTheStrengthOf(scope: {
    proposition: string;
    enquiry?: string;
  }): Promise<DecidedQuestion[]> {
    // Keyed by id. Two identically-worded questions are two questions -- S-1
    // poses exactly that pair, and `report.ts` says neither may be resolved by
    // comparing text. This helper was doing it anyway.
    const asked = new Map<string, DecidedQuestion>();
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
        { q: vertexProps<{ name: string; natural_id: string }>() },
        {
          name: scope.proposition,
          ...(scope.enquiry ? { enquiry: scope.enquiry } : {}),
        },
      );
      for (const row of rows)
        asked.set(row.q.natural_id, { question: ref("question", row.q.natural_id), asks: row.q.name });
    }
    return [...asked.values()].sort((a, b) => a.question.id.localeCompare(b.question.id));
  }

  protected async scopeOf(
    claim: ClaimRef,
  ): Promise<{ proposition: string; enquiry?: string }> {
    // BOTH bearings. A conclusion that challenges its proposition reaches its
    // line of enquiry the same way one that supports it does, and walking only
    // SUPPORTS lost the enquiry for every challenging claim -- which S-5's
    // second stage is, and which is how this was caught.
    let name: string | undefined;
    let enquiry: string | undefined;
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (c:Claim {natural_id: $id})
         OPTIONAL MATCH (c)<-[:${bearing}]-(:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)-[:ADDRESSES]->(loe:LineOfEnquiry)
         RETURN c, loe`,
        {
          c: vertexProps<{ name: string }>(),
          loe: optional(vertexProps<{ natural_id: string }>()),
        },
        { id: claim.id },
      );
      if (rows[0]) name = rows[0].c.name;
      enquiry ??= rows.find((r) => r.loe)?.loe?.natural_id;
    }
    if (name === undefined) throw new Error(`no claim ${claim.id}`);
    return { proposition: name, ...(enquiry ? { enquiry } : {}) };
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
}
