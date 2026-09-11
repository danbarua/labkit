import { optional, vertexProps } from "../../db/cypher";
import type { Timestamp } from "../../db/domain";
import { SessionCore } from "../core";
import { compose, per, type Row } from "../facts";
import type { HistoricalSurvey, KnowledgeSurvey, QuestionStanding } from "../report";
import { ref } from "../report";
import { BEARINGS, answeringClaimBearing, checksMetBearing, standingAsOf } from "../survey-facts";

export class StandingGroup extends SessionCore {
  /**
   * What the record held at a stated moment. Row Z.
   */
  async whatWasKnown(at: Timestamp): Promise<HistoricalSurvey> {
    const parsed = Date.parse(at);
    if (Number.isNaN(parsed))
      throw new Error(
        `whatWasKnown expected an ISO instant like 2026-07-15T12:34:56.000Z, got "${at}"`,
      );
    const asOf = new Date(parsed).toISOString();

    const standings = new Map<string, { resolved: boolean; promoted: boolean; open: boolean }>();
    const asked = new Map<string, { asks: string; accepted: boolean }>();

    for (const bearing of BEARINGS) {
      const standing = standingAsOf(asOf, bearing);
      const { cypher, decoders } = compose(
        `MATCH (q:Question)
       WHERE q.posed_at <= $at
       OPTIONAL MATCH (accepting:Decision)-[:DEFERS]->(q)`,
        standing,
        {
          q: vertexProps<{ natural_id: string; name: string }>(),
          accepting: optional(vertexProps<{ decided_at: string }>()),
        },
      );
      const rows = (await this.graph.query(cypher, decoders, { at: asOf })) as unknown as Row[];

      for (const [question, was] of per(standing, rows)) {
        const seen = standings.get(question) ?? { resolved: false, promoted: false, open: false };
        standings.set(question, {
          resolved: seen.resolved || was.resolved,
          promoted: seen.promoted || was.promoted,
          open: seen.open || was.open,
        });
      }
      for (const row of rows) {
        const q = row.q as { natural_id: string; name: string };
        const entry = asked.get(q.natural_id) ?? { asks: q.name, accepted: false };
        const accepting = row.accepting as { decided_at: string } | null;
        entry.accepted ||= accepting !== null && accepting.decided_at <= asOf;
        asked.set(q.natural_id, entry);
      }
    }

    const survey: HistoricalSurvey = {
      at: asOf,
      established: [],
      provisional: [],
      accepted: [],
      open: [],
    };
    for (const [question, e] of asked) {
      const entry: QuestionStanding = { question: ref("question", question), asks: e.asks };
      const was = standings.get(question) ?? { resolved: false, promoted: false, open: false };
      if (was.open && e.accepted) survey.accepted.push(entry);
      else if (was.open) survey.open.push(entry);
      else if (was.resolved && was.promoted) survey.established.push(entry);
      else if (was.resolved) survey.provisional.push(entry);
      else survey.open.push(entry);
    }
    return survey;
  }

  /** What the programme knows, folded over each question's pursuits. */
  async whatIsKnown(): Promise<KnowledgeSurvey> {
    const anchor = `MATCH (q:Question)
       OPTIONAL MATCH (accepting:Decision)-[:DEFERS]->(q)
       OPTIONAL MATCH (q)-[:MOTIVATES]->(:LineOfEnquiry)<-[:ADDRESSES]-(work:EvidenceUnit)`;
    type Closing = {
      natural_id: string;
      decided_at: string;
      reason: string;
      resolution_kind?: string;
    };
    type Answer = {
      enquiry: string;
      claim: string;
      bearing: "SUPPORTS" | "CHALLENGES";
      vouchedFor: boolean;
    };
    type Entry = {
      asks: string;
      worked: boolean;
      accepting?: { reason: string; invalidation_check: string; decided_at: string };
      pursuits: Map<string, { name: string; closing: Closing | null }>;
      answers: Map<string, Answer>;
    };

    const seen = new Map<string, Entry>();
    const met = new Map<string, boolean>();
    for (const bearing of BEARINGS) {
      const claimFact = answeringClaimBearing(bearing);
      const metFact = checksMetBearing(bearing);
      const { cypher, decoders } = compose(anchor, metFact, {
        q: vertexProps<{ natural_id: string; name: string }>(),
        accepting: optional(
          vertexProps<{
            reason: string;
            invalidation_check: string;
            decided_at: string;
          }>(),
        ),
        work: optional(vertexProps<{ natural_id: string }>()),
      });
      const rows = (await this.graph.query(cypher, decoders, {})) as unknown as Row[];
      for (const [claim, ok] of per(metFact, rows)) met.set(claim, (met.get(claim) ?? true) && ok);

      for (const row of rows) {
        const q = row.q as { natural_id: string; name: string };
        const accepting = row.accepting as Entry["accepting"] | null;
        const entry: Entry = seen.get(q.natural_id) ?? {
          asks: q.name,
          worked: false,
          pursuits: new Map(),
          answers: new Map(),
        };
        entry.worked ||= row.work !== null;
        if (accepting && (!entry.accepting || accepting.decided_at > entry.accepting.decided_at))
          entry.accepting = accepting;

        const loe = row.loe as { natural_id: string; name: string } | null;
        const closing = row.closing as Closing | null;
        if (loe) {
          const pursuit = entry.pursuits.get(loe.natural_id) ?? { name: loe.name, closing: null };
          if (closing) {
            if (closing.resolution_kind !== "answered" && closing.resolution_kind !== "abandoned")
              throw new Error(
                `decision ${closing.natural_id} resolves enquiry ${loe.natural_id} with invalid resolution kind ${closing.resolution_kind ?? "absent"}`,
              );
            if (!pursuit.closing || closing.decided_at > pursuit.closing.decided_at)
              pursuit.closing = closing;
          }
          entry.pursuits.set(loe.natural_id, pursuit);

          const answering = row.answering as { natural_id: string } | null;
          const borne = row.borne as { natural_id: string } | null;
          const part = row.part as { natural_id: string } | null;
          const bearsOnAnswer = Boolean(
            answering &&
              borne &&
              (borne.natural_id === answering.natural_id || part?.natural_id === borne.natural_id),
          );
          if (closing?.resolution_kind === "answered" && answering && bearsOnAnswer) {
            const key = `${loe.natural_id}\0${answering.natural_id}`;
            const prior = entry.answers.get(key);
            entry.answers.set(key, {
              enquiry: loe.natural_id,
              claim: answering.natural_id,
              bearing:
                bearing === "CHALLENGES" || prior?.bearing === "CHALLENGES"
                  ? "CHALLENGES"
                  : "SUPPORTS",
              vouchedFor: (prior?.vouchedFor ?? false) || row.vouching !== null,
            });
          }
        }
        seen.set(q.natural_id, entry);
      }
    }

    const survey: KnowledgeSurvey = {
      established: [],
      provisional: [],
      unresolved: [],
      untested: [],
      accepted: [],
      closedPursuits: [],
    };
    for (const [question, entry] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
      const standing: QuestionStanding = { question: ref("question", question), asks: entry.asks };
      const answers = [...entry.answers.values()].sort(
        (a, b) => a.enquiry.localeCompare(b.enquiry) || a.claim.localeCompare(b.claim),
      );
      const answerReport = answers.map((answer) => ({
        enquiry: ref("enquiry", answer.enquiry),
        claim: ref("claim", answer.claim),
        answer: answer.bearing === "CHALLENGES" ? ("no" as const) : ("yes" as const),
      }));
      const deferral = entry.accepting
        ? {
            acceptedBecause: entry.accepting.reason,
            reopensIf: entry.accepting.invalidation_check,
          }
        : {};
      const open = [...entry.pursuits.values()].some((pursuit) => pursuit.closing === null);
      const closed = [...entry.pursuits.entries()].filter(([, pursuit]) => pursuit.closing);

      for (const [enquiry, pursuit] of closed) {
        const closing = pursuit.closing!;
        const answer = answerReport.find((candidate) => candidate.enquiry === enquiry);
        if (closing.resolution_kind === "answered" && !answer)
          throw new Error(
            `answered decision ${closing.natural_id} has no answering claim for enquiry ${enquiry}`,
          );
        survey.closedPursuits.push({
          enquiry: ref("enquiry", enquiry),
          pursuing: pursuit.name,
          question: standing.question,
          decision: ref("decision", closing.natural_id),
          closure: closing.resolution_kind as "answered" | "abandoned",
          ...(answer ? { answered: { claim: answer.claim, answer: answer.answer } } : {}),
        });
      }

      if (open) {
        if (entry.accepting)
          survey.accepted.push({ ...standing, ...deferral } as KnowledgeSurvey["accepted"][number]);
        else if (entry.worked || closed.length > 0) survey.unresolved.push(standing);
        else survey.untested.push(standing);
      } else if (answers.length > 0) {
        const answered = { ...standing, answers: answerReport, ...deferral };
        if (answers.every((answer) => answer.vouchedFor && met.get(answer.claim) !== false))
          survey.established.push(answered);
        else survey.provisional.push(answered);
      } else if (entry.pursuits.size > 0) survey.unresolved.push(standing);
      else survey.untested.push(standing);
    }
    survey.closedPursuits.sort((a, b) => a.enquiry.localeCompare(b.enquiry));
    return survey;
  }
}
