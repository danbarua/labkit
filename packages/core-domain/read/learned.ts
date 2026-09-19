/**
 * What the programme found out.
 *
 * `claims` lists conclusions; it does not say what any of them was for. This
 * groups them under the question they were reached against, with the finding
 * underneath — which is the answer to "what was all this compute for?".
 */

import { optional, vertexProps } from "../../core-db/cypher";
import { SessionCore } from "../core";
import { byHandle, ref } from "../report";
import type { Learned, LearnedUnderQuestion } from "../report";

export class LearnedGroup extends SessionCore {
  async learned(): Promise<Learned> {
    // Two clauses, not `[:SUPPORTS|CHALLENGES]`: AGE has no edge alternation.
    const rows = await this.graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(loe:LineOfEnquiry)
       OPTIONAL MATCH (u:EvidenceUnit)-[:ADDRESSES]->(loe)
       OPTIONAL MATCH (u)-[:PRODUCES]->(ev:Evidence)
       OPTIONAL MATCH (ev)-[:SUPPORTS]->(sup:Claim)
       OPTIONAL MATCH (ev)-[:CHALLENGES]->(ch:Claim)
       RETURN q, loe, ev, sup, ch`,
      {
        q: vertexProps<{ natural_id: string; name: string }>(),
        loe: vertexProps<{ natural_id: string }>(),
        ev: optional(vertexProps<{ natural_id: string; statement: string }>()),
        sup: optional(vertexProps<{ natural_id: string; name: string; kind?: string }>()),
        ch: optional(vertexProps<{ natural_id: string; name: string; kind?: string }>()),
      },
      {},
    );

    const byQuestion = new Map<string, LearnedUnderQuestion & { seen: Set<string> }>();
    for (const row of rows) {
      const entry = byQuestion.get(row.q.natural_id) ?? {
        question: ref("question", row.q.natural_id),
        asks: row.q.name,
        found: [],
        seen: new Set<string>(),
      };
      for (const [claim, bearing] of [
        [row.sup, "supports"] as const,
        [row.ch, "challenges"] as const,
      ]) {
        if (!claim || !row.ev) continue;
        // One claim per question, by the first finding that reached it: a
        // conclusion cited by four runs is one thing learned, not four.
        const key = `${claim.natural_id}:${bearing}`;
        if (entry.seen.has(key)) continue;
        entry.seen.add(key);
        entry.found.push({
          claim: ref("claim", claim.natural_id),
          asserts: claim.name,
          bearing,
          confirmed: claim.kind === "confirmatory",
          finding: ref("evidence", row.ev.natural_id),
          states: row.ev.statement,
        });
      }
      byQuestion.set(row.q.natural_id, entry);
    }

    const questions = [...byQuestion.values()]
      .map(({ seen: _seen, ...q }) => ({
        ...q,
        found: q.found.sort((a, b) => byHandle(a.claim, b.claim)),
      }))
      .sort((a, b) => byHandle(a.question, b.question));
    return { questions, found: questions.reduce((n, q) => n + q.found.length, 0) };
  }
}
