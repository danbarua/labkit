/**
 * What is on the record, by kind.
 *
 * `gates` and `work` list their kinds; the four kinds a researcher actually
 * writes — claims, enquiries, analyses, conditions — had no list at all, so the
 * only way to a handle was to already know it or to search for wording.
 */

import { optional, vertexProps } from "../../db/cypher";
import { SessionCore } from "../core";
import { byHandle, ref } from "../report";
import type { ListedAnalysis, ListedClaim, ListedCriterion, ListedEnquiry } from "../report";

export class InventoryGroup extends SessionCore {
  /** Every claim, with what bears on it. */
  async claimList(): Promise<ListedClaim[]> {
    const rows = await this.graph.query(
      // Two clauses, not `[:SUPPORTS|CHALLENGES]`: AGE has no edge alternation
      // and the alternation is a syntax error rather than an empty result.
      `MATCH (c:Claim) WHERE c.retracted IS NULL
       OPTIONAL MATCH (sup:Evidence)-[:SUPPORTS]->(c)
       OPTIONAL MATCH (ch:Evidence)-[:CHALLENGES]->(c)
       OPTIONAL MATCH (promoted:Decision)-[:PROMOTES]->(c)
       RETURN c, sup, ch, promoted`,
      {
        c: vertexProps<{ natural_id: string; name: string }>(),
        sup: optional(vertexProps<{ natural_id: string }>()),
        ch: optional(vertexProps<{ natural_id: string }>()),
        promoted: optional(vertexProps<{ natural_id: string }>()),
      },
      {},
    );
    const found = new Map<
      string,
      ListedClaim & { supporting: Set<string>; against: Set<string> }
    >();
    for (const row of rows) {
      const entry = found.get(row.c.natural_id) ?? {
        claim: ref("claim", row.c.natural_id),
        asserts: row.c.name,
        supports: 0,
        challenges: 0,
        confirmed: false,
        supporting: new Set<string>(),
        against: new Set<string>(),
      };
      if (row.sup) entry.supporting.add(row.sup.natural_id);
      if (row.ch) entry.against.add(row.ch.natural_id);
      if (row.promoted) entry.confirmed = true;
      found.set(row.c.natural_id, entry);
    }
    return [...found.values()]
      .map(({ supporting, against, ...claim }) => ({
        ...claim,
        supports: supporting.size,
        challenges: against.size,
      }))
      .sort((a, b) => byHandle(a.claim, b.claim));
  }

  /** Every line of enquiry, with the question it pursues. */
  async enquiryList(): Promise<ListedEnquiry[]> {
    const rows = await this.graph.query(
      `MATCH (e:LineOfEnquiry) WHERE e.retracted IS NULL
       OPTIONAL MATCH (q:Question)-[:MOTIVATES]->(e)
       OPTIONAL MATCH (u:EvidenceUnit)-[:ADDRESSES]->(e)
       OPTIONAL MATCH (closing:Decision)-[:RESOLVES]->(e)
       RETURN e, q, u, closing`,
      {
        e: vertexProps<{ natural_id: string; name: string }>(),
        q: optional(vertexProps<{ natural_id: string; name: string }>()),
        u: optional(vertexProps<{ natural_id: string }>()),
        closing: optional(vertexProps<{ natural_id: string }>()),
      },
      {},
    );
    const found = new Map<string, ListedEnquiry & { units: Set<string> }>();
    for (const row of rows) {
      const entry = found.get(row.e.natural_id) ?? {
        enquiry: ref("enquiry", row.e.natural_id),
        approach: row.e.name,
        pursuing: row.q?.name ?? "",
        runs: 0,
        closed: false,
        units: new Set<string>(),
        ...(row.q ? { question: ref("question", row.q.natural_id) } : {}),
      };
      if (row.u) entry.units.add(row.u.natural_id);
      if (row.closing) entry.closed = true;
      found.set(row.e.natural_id, entry);
    }
    return [...found.values()]
      .map(({ units, ...enquiry }) => ({ ...enquiry, runs: units.size }))
      .sort((a, b) => byHandle(a.enquiry, b.enquiry));
  }

  /** Every analysis, with what it was run for. */
  async analysisList(): Promise<ListedAnalysis[]> {
    const rows = await this.graph.query(
      `MATCH (c:Computation) WHERE c.retracted IS NULL
       OPTIONAL MATCH (u:EvidenceUnit)-[:USES]->(c)
       OPTIONAL MATCH (u)-[:PRODUCES]->(ev:Evidence)
       OPTIONAL MATCH (u)-[:ADDRESSES]->(e:LineOfEnquiry)
       RETURN c, ev, e`,
      {
        c: vertexProps<{ natural_id: string; method: string }>(),
        ev: optional(vertexProps<{ natural_id: string }>()),
        e: optional(vertexProps<{ natural_id: string }>()),
      },
      {},
    );
    const found = new Map<string, ListedAnalysis & { produced: Set<string> }>();
    for (const row of rows) {
      const entry = found.get(row.c.natural_id) ?? {
        analysis: ref("analysis", row.c.natural_id),
        method: row.c.method,
        findings: 0,
        produced: new Set<string>(),
        ...(row.e ? { enquiry: ref("enquiry", row.e.natural_id) } : {}),
      };
      if (row.ev) entry.produced.add(row.ev.natural_id);
      found.set(row.c.natural_id, entry);
    }
    return [...found.values()]
      .map(({ produced, ...analysis }) => ({ ...analysis, findings: produced.size }))
      .sort((a, b) => byHandle(a.analysis, b.analysis));
  }

  /** Every condition, with what it governs. */
  async criterionList(): Promise<ListedCriterion[]> {
    const rows = await this.graph.query(
      `MATCH (c:Criterion) WHERE c.retracted IS NULL
       OPTIONAL MATCH (c)-[:GOVERNS]->(g:Gate)
       OPTIONAL MATCH (c)-[:EVALUATED_AS]->(ev:CriterionEvaluation)
       OPTIONAL MATCH (amended:Decision)-[:CHANGES]->(c)
       RETURN c, g, ev, amended`,
      {
        c: vertexProps<{ natural_id: string; proposition: string }>(),
        g: optional(vertexProps<{ natural_id: string }>()),
        ev: optional(vertexProps<{ natural_id: string; outcome: string }>()),
        amended: optional(vertexProps<{ natural_id: string }>()),
      },
      {},
    );
    const found = new Map<
      string,
      ListedCriterion & { gates: Set<string>; verdicts: Map<string, string> }
    >();
    for (const row of rows) {
      const entry = found.get(row.c.natural_id) ?? {
        criterion: ref("criterion", row.c.natural_id),
        requires: row.c.proposition,
        governs: 0,
        evaluations: 0,
        state: "never-run" as const,
        amended: false,
        gates: new Set<string>(),
        verdicts: new Map<string, string>(),
      };
      if (row.g) entry.gates.add(row.g.natural_id);
      if (row.ev) entry.verdicts.set(row.ev.natural_id, row.ev.outcome);
      if (row.amended) entry.amended = true;
      found.set(row.c.natural_id, entry);
    }
    return [...found.values()]
      .map(({ gates, verdicts, ...criterion }) => ({
        ...criterion,
        governs: gates.size,
        evaluations: verdicts.size,
        state:
          verdicts.size === 0
            ? ("never-run" as const)
            : [...verdicts.values()].includes("fail")
              ? ("failed" as const)
              : ("passed" as const),
      }))
      .sort((a, b) => byHandle(a.criterion, b.criterion));
  }
}
