/**
 * What every research verb needs, and the few helpers both halves share.
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
import { graphProjector, type Projector } from "./projection";
import type {
  ClaimRef,
  ClaimStanding,
  ConcludedClaim,
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
 * What a surface is constructed with: a command's execution context, plus where its events go.
 */
export interface ResearchSessionOptions extends Partial<CommandContext> {
  events?: EventSink;
  /**
   * What builds state from this session's events, in order.
   */
  projectors?: Projector[];
}

/**
 * The callable, public method names of a class.
 */
export type Methods<T> = {
  [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];

export class SessionCore {
  protected readonly clock: Clock;
  /**
   * Who is running commands through this surface.
   */
  protected readonly attribution: AttributionContext;
  /** What every act through this surface was read off, or `null` if nobody said. */
  protected readonly reconstructedFrom: Prose | null;
  readonly events: EventSink;
  protected readonly projectors: Projector[];

  constructor(
    protected readonly graph: TenantGraph,
    options: ResearchSessionOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.attribution = options.attribution ?? UNATTRIBUTED;
    this.reconstructedFrom = options.reconstructedFrom ?? null;
    this.events = options.events ?? inMemoryEventLog();
    this.projectors = options.projectors ?? [graphProjector(graph)];
  }

  /**
   * The finding that bears on a claim, and what the claim asserts.
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
   * no qualifier.
   */

  protected withinScope(scope: { enquiry?: EnquiryRef }): string {
    return scope.enquiry ? `MATCH (u)-[:ADDRESSES]->(:LineOfEnquiry {natural_id: $enquiry})` : "";
  }

  /**
   * The params half of {@link withinScope}, so the clause and the binding it needs are never
   * written apart.
   */
  protected scopeParams(scope: { enquiry?: EnquiryRef }): { enquiry?: string } {
    return scope.enquiry ? { enquiry: scope.enquiry } : {};
  }

  /** Work these gates protect, and which therefore has to be run again when their condition changes. */
  protected async workGatedBy(gates: GateRef[]): Promise<GatedWork[]> {
    // Keyed by id, not by objective. Two tasks can share an objective and be
    // two tasks; deduping on the text reported one piece of work to re-run
    // where there were two. Same traversal `gateStatus` reports as
    // `{work, objective}`.
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
   */

  protected async confirmatoryResultsBehind(gates: GateRef[]): Promise<ConfirmatoryResult[]> {
    // Keyed by id: one sentence asserted in two lines of enquiry is two claims,
    // and merging them understates the blast radius of a scientific amendment.
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

  /**
   * Which of these claims still stand, and what replaced the ones that do not.
   */
  protected async standingOf(claims: ClaimRef[]): Promise<Map<ClaimRef, ClaimStanding>> {
    const state = new Map<ClaimRef, ClaimStanding>(
      claims.map((c) => [c, { withdrawn: false, by: [], insteadOf: [] }]),
    );
    if (claims.length === 0) return state;
    const rows = await this.graph.query(
      `MATCH (c:Claim) WHERE c.natural_id IN $ids
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
      { ids: claims },
    );
    for (const row of rows) {
      const claim = ref("claim", row.c.natural_id);
      const entry = state.get(claim);
      if (!entry) continue;
      if (!row.narrowed && !row.replaced) continue;
      entry.withdrawn = true;
      for (const decision of [row.narrowed, row.replaced]) {
        if (!decision) continue;
        const acted = ref("decision", decision.natural_id);
        if (!entry.by.includes(acted)) entry.by.push(acted);
      }
      // By handle: two successors phrased alike are two records, and this list is what a
      // refusal names. **It can be empty on a withdrawn claim.** `replaceAnalysis` supersedes a
      // claim and mints the replacement's conclusions without pairing them, so the decision
      // `MOTIVATES` the new *analysis* and no new claim.
      for (const next of [row.insteadof, row.successor]) {
        if (!next) continue;
        const successor = ref("claim", next.natural_id);
        if (!entry.insteadOf.some((c) => c.claim === successor))
          entry.insteadOf.push({ claim: successor, asserts: next.name });
      }
    }
    return state;
  }

  /** Whether the record has stopped asserting a proposition, and what replaced it. */
  protected async withdrawalOf(scope: {
    proposition: IndexedString;
    enquiry?: EnquiryRef;
  }): Promise<{ withdrawn: boolean; by?: Ref<"decision">; replacedBy?: ReplacementClaim }> {
    const rows = await this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       ${this.withinScope(scope)}
       // **Both predicates, and AGE has no edge alternation** -- [:CHANGES|SUPERSEDES] is a
       // syntax error, so this is two clauses and the fold below must read both. Naming only
       // one is SILENT: the row is simply absent and a reader concludes the claim still stands.
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
    // standing means the record still claims it.
    // Either predicate counts. Reading one and not the other is the silent
    // half of the two-clause trap above: a claim superseded but not narrowed
    // would have read as standing.
    const standing = new Set(
      rows.filter((r) => !r.narrowed && !r.replaced).map((r) => r.c.natural_id),
    );
    if (standing.size > 0) return { withdrawn: false };

    // Identity as well as wording. A name alone is picked from whichever row
    // happens to carry one -- an arbitrary row and arbitrary text, in the field
    // that says what the record asserts.
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
    // Keyed by id. Two identically-worded questions are two questions, and
    // neither is resolvable by comparing text.
    const asked = new Map<QuestionRef, DecidedQuestion>();
    // Both bearings: a question can be settled "no" on a finding that
    // challenges the proposition, and that closure rests on this reading just
    // as much as a supporting one does.
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (d:Decision)-[:BASED_ON]->(e:Evidence)-[:${bearing}]->(:Claim {name: $name})
         MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
         ${this.withinScope(scope)}
         MATCH (d)-[:RESOLVES]->(loe:LineOfEnquiry)<-[:MOTIVATES]-(q:Question)
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
    // SUPPORTS loses the enquiry for every challenging claim.
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
