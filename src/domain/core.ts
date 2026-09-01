/**
 * What every research verb needs, and the few helpers both halves share.
 *
 * `src/domain/session.ts` reached 2,920 lines across 62 members. The seam it
 * was split on is one the domain already asserts — CLAUDE.md's *"events explain
 * how state changed; the graph explains what the current research state is"* —
 * and the measurement bore it out: 18 write verbs and 14 read verbs partitioned
 * with **no member doing both**, and `emit` had 18 callers, every one a write.
 *
 * This class holds the graph, the clock, the attribution and the event sink,
 * plus the helpers both halves genuinely need.
 *
 * **Membership is by use, and it has to be re-checked rather than assumed.**
 * The first pass took what each half calls directly; transitive closure through
 * those pulled in more, including `withdrawalOf`, which a regex pass had
 * wrongly called read-only. It also pulled in two that were already dead —
 * `enquiriesClaiming` and `enquiryAddressedBy` had no caller anywhere — and
 * `claimFor` lost its last one later with nothing to notice. All three were
 * removed on 2026-08-24. The count that used to open this paragraph went with
 * them: a numeral in prose must earn its assertion (PJ-028), and that one
 * asserted a membership nobody re-derived.
 *
 * It deliberately holds **no verbs and no `emit`**. `emit` lives on the write
 * side so that a read *cannot* stamp an event: the invariant that reads are
 * silent is structural here rather than remembered.
 */

import type { TenantGraph } from "../db/graph";
import type { IndexedString, Prose } from "../db/domain";
import { optional, vertexProps } from "../db/cypher";
import {
  type AttributionContext,
  type Clock,
  type CommandContext,
  type EventSink,
  UNATTRIBUTED,
  inMemoryEventLog,
  systemClock,
} from "./events";
import type {
  ClaimRef,
  AnalysisRef,
  EnquiryRef,
  EvidenceRef,
  GateRef,
  QuestionRef,
  WorkRef,
  ConfirmatoryResult,
  ReplacementClaim,
  DecidedQuestion,
  GatedWork,
  Ref,
} from "./report";
import { ref } from "./report";

/**
 * What a surface is constructed with: a command's execution context, plus where
 * its events go.
 *
 * `extends Partial<CommandContext>` rather than `{ ctx?: CommandContext }`, and
 * the difference is the whole cost of the change. Nesting would have rewritten
 * 110 construction sites across 38 test files — `{ clock }` to
 * `{ ctx: { clock, attribution } }` — to change no behaviour whatsoever. Spread
 * flat, every existing call site stays valid, `clock` keeps its name and
 * position, and an adapter that has built a whole `CommandContext` still hands
 * it over in one piece: `new WriteSurface(graph, { ...ctx, events })`.
 *
 * Both context fields stay optional. `tests/domain-session.test.ts` constructs
 * `new ResearchSession(graph)` bare, and a surface with no stated attribution is
 * a real case — the CLI is one — not a caller who forgot.
 */
export interface ResearchSessionOptions extends Partial<CommandContext> {
  events?: EventSink;
}

export class SessionCore {
  protected readonly clock: Clock;
  /**
   * Who is running commands through this surface.
   *
   * Session-scoped in the field and *per-command* in practice, because a
   * surface is cheap to construct: `src/mcp/server.ts` builds a fresh
   * `WriteSurface` per tool call over the same graph and the same sink, so each
   * call can carry its own attribution and its own `git_hash`. That works
   * because neither surface declares a field or a constructor of its own: the
   * three assignments below are the whole of a surface's state, and the only
   * mutable state in reach — `inTransaction`'s re-entrancy depth — belongs to
   * the shared `TenantGraph`, not here.
   */
  protected readonly attribution: AttributionContext;
  readonly events: EventSink;

  constructor(
    protected readonly graph: TenantGraph,
    options: ResearchSessionOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.attribution = options.attribution ?? UNATTRIBUTED;
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
  ): Promise<{ evidence: EvidenceRef; asserts: Prose } | undefined> {
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (c:Claim {natural_id: $id})<-[:${bearing}]-(e:Evidence)
         RETURN c, e`,
        {
          c: vertexProps<{ name: string }>(),
          e: vertexProps<{ natural_id: string }>(),
        },
        { id: claim },
      );
      const found = rows[0];
      if (found)
        return {
          evidence: ref("evidence", found.e.natural_id),
          asserts: found.c.name,
        };
    }
    return undefined;
  }

  /** What a claim asserts. */
  protected async assertedBy(claim: ClaimRef): Promise<Prose | undefined> {
    const rows = await this.graph.query(
      `MATCH (c:Claim {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ name: string }>() },
      { id: claim },
    );
    return rows[0]?.c.name;
  }

  /** The single finding by which an analysis concluded something about one proposition. */
  protected async findingFor(
    analysis: AnalysisRef,
    proposition: IndexedString,
  ): Promise<EvidenceRef | undefined> {
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
      { analysis: analysis, proposition },
    );
    const found = rows.find((r) => r.sc !== null || r.cc !== null);
    return found ? ref("evidence", found.e.natural_id) : undefined;
  }

  /**
   * Restricts a claim traversal to one line of enquiry, when the caller named
   * one. Empty when they did not — a sentence asserted in a single scope needs
   * no qualifier, and every scenario before S-5 relies on that.
   */

  protected withinScope(scope: { enquiry?: EnquiryRef }): string {
    return scope.enquiry ? `MATCH (u)-[:ADDRESSES]->(:LineOfEnquiry {natural_id: $enquiry})` : "";
  }

  /**
   * The params half of {@link withinScope}, so the clause and the binding it
   * needs are never written apart.
   *
   * They were: eight call sites each spelled
   * `...(scope.enquiry ? { enquiry: scope.enquiry } : {})` beside a
   * `withinScope(scope)`, and a clause emitted without its param is a Cypher
   * error at runtime rather than a type error now.
   */
  protected scopeParams(scope: { enquiry?: EnquiryRef }): { enquiry?: string } {
    return scope.enquiry ? { enquiry: scope.enquiry } : {};
  }

  /** Work these gates protect, and which therefore has to be run again when their condition changes. */
  protected async workGatedBy(gates: GateRef[]): Promise<GatedWork[]> {
    // Keyed by id, not by objective. Two tasks can share an objective and be
    // two tasks; deduping on the text reported one piece of work to re-run
    // where there were two. Same traversal `gateStatus` reports as
    // `{work, objective}` -- one was converted and this was not (PJ-030 §7).
    const found = new Map<WorkRef, GatedWork>();
    for (const gate of gates) {
      const rows = await this.graph.query(
        `MATCH (:Gate {natural_id: $id})-[:GATES]->(t:Task) RETURN t`,
        { t: vertexProps<{ objective: string; natural_id: string }>() },
        { id: gate },
      );
      for (const row of rows) {
        const work = ref("work", row.t.natural_id);
        found.set(work, { work, objective: row.t.objective });
      }
    }
    return [...found.values()].sort((a, b) => a.work.localeCompare(b.work));
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

  protected async confirmatoryResultsBehind(gates: GateRef[]): Promise<ConfirmatoryResult[]> {
    // Keyed by id. S-5's literal case: one sentence asserted in two lines of
    // enquiry is two claims, and merging them understated the blast radius of
    // a scientific amendment.
    const affected = new Map<ClaimRef, ConfirmatoryResult>();
    for (const gate of gates) {
      for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
        const rows = await this.graph.query(
          `MATCH (:Gate {natural_id: $id})-[:GATES]->(:Task)-[:IMPLEMENTS]->(u:EvidenceUnit)
           MATCH (u)-[:PRODUCES]->(e:Evidence)-[:${bearing}]->(c:Claim)
           RETURN c`,
          {
            c: vertexProps<{
              name: string;
              kind?: string;
              natural_id: string;
            }>(),
          },
          { id: gate },
        );
        for (const row of rows) {
          if (row.c.kind !== "confirmatory") continue;
          const claim = ref("claim", row.c.natural_id);
          affected.set(claim, { claim, asserts: row.c.name });
        }
      }
    }
    return [...affected.values()].sort((a, b) => a.claim.localeCompare(b.claim));
  }

  /** Whether the record has stopped asserting a proposition, and what replaced it. */
  protected async withdrawalOf(scope: {
    proposition: IndexedString;
    enquiry?: EnquiryRef;
  }): Promise<{ withdrawn: boolean; by?: Ref<"decision">; replacedBy?: ReplacementClaim }> {
    const rows = await this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       ${this.withinScope(scope)}
       // **Both predicates, and AGE has no edge alternation** -- [:CHANGES|SUPERSEDES]
       // is a syntax error, so this is two clauses and the fold below must read
       // both. Naming only one is SILENT: the row is simply absent and a reader
       // concludes the claim still stands. That is this repository's
       // six-occurrence defect, so it is spelled once here rather than at each
       // caller.
       //
       // A claim is withdrawn either way: its reading was narrowed (CHANGES)
       // or its finding superseded (SUPERSEDES). Different acts, same
       // consequence for whether it still stands.
       OPTIONAL MATCH (narrowed:Decision)-[:CHANGES]->(c)
       OPTIONAL MATCH (narrowed)-[:MOTIVATES]->(insteadof:Claim)
       OPTIONAL MATCH (replaced:Decision)-[:SUPERSEDES]->(c)
       OPTIONAL MATCH (replaced)-[:MOTIVATES]->(successor:Claim)
       RETURN c, narrowed, insteadof, replaced, successor`,
      {
        c: vertexProps<{ natural_id: string }>(),
        narrowed: optional(vertexProps<{ natural_id: string }>()),
        insteadof: optional(vertexProps<{ name: string; natural_id: string }>()),
        replaced: optional(vertexProps<{ natural_id: string }>()),
        successor: optional(vertexProps<{ name: string; natural_id: string }>()),
      },
      { name: scope.proposition, ...this.scopeParams(scope) },
    );
    if (rows.length === 0) return { withdrawn: false };

    // Every node asserting this proposition must have been withdrawn. One left
    // standing means the record still claims it -- which is exactly the
    // duplicate-claim case S-12 was built to catch.
    // Either predicate counts. Reading one and not the other is the silent
    // half of the two-clause trap above: a claim superseded but not narrowed
    // would have read as standing.
    const standing = new Set(
      rows.filter((r) => !r.narrowed && !r.replaced).map((r) => r.c.natural_id),
    );
    if (standing.size > 0) return { withdrawn: false };

    // Identity as well as wording. This was the claim's NAME, picked from
    // whichever row happened to carry one -- arbitrary row and arbitrary text,
    // in the field that says what the record asserts instead (PJ-030 §7).
    const now =
      rows.find((r) => r.insteadof)?.insteadof ?? rows.find((r) => r.successor)?.successor;
    // **Which decision withdrew it**, so a caller can tell its own act's
    // withdrawal from somebody else's. Only meaningful when exactly one
    // decision is responsible; with several the answer is that more than one
    // was, which no single id can say, so it is absent.
    const deciding = [
      ...new Set(
        rows.flatMap((r) => [r.narrowed?.natural_id, r.replaced?.natural_id]).filter(Boolean),
      ),
    ];
    return {
      withdrawn: true,
      ...(deciding.length === 1 ? { by: ref("decision", deciding[0] as string) } : {}),
      ...(now
        ? {
            replacedBy: {
              claim: ref("claim", now.natural_id),
              asserts: now.name,
            },
          }
        : {}),
    };
  }

  /** Questions closed on the strength of a proposition — what a reinterpretation puts at risk. */

  protected async decidedOnTheStrengthOf(scope: {
    proposition: IndexedString;
    enquiry?: EnquiryRef;
  }): Promise<DecidedQuestion[]> {
    // Keyed by id. Two identically-worded questions are two questions -- S-1
    // poses exactly that pair, and `report.ts` says neither may be resolved by
    // comparing text. This helper was doing it anyway.
    const asked = new Map<QuestionRef, DecidedQuestion>();
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
        { name: scope.proposition, ...this.scopeParams(scope) },
      );
      for (const row of rows) {
        const question = ref("question", row.q.natural_id);
        asked.set(question, { question, asks: row.q.name });
      }
    }
    return [...asked.values()].sort((a, b) => a.question.localeCompare(b.question));
  }

  protected async scopeOf(
    claim: ClaimRef,
  ): Promise<{ proposition: IndexedString; enquiry?: EnquiryRef }> {
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
        { id: claim },
      );
      if (rows[0]) name = rows[0].c.name;
      enquiry ??= rows.find((r) => r.loe)?.loe?.natural_id;
    }
    if (name === undefined)
      throw new Error(
        `no claim ${claim}; a claim exists once an analysis concludes it, and its handle comes back from the act that recorded it`,
      );
    return {
      proposition: name,
      ...(enquiry ? { enquiry: ref("enquiry", enquiry) } : {}),
    };
  }
}
