import { optional, vertexProps } from "@labkit/core-db/cypher";
import { SessionCore } from "../core";
import type { ClaimRef, HistoricalSurvey, KnowledgeSurvey, QuestionStanding } from "../report";
import { byHandle, ref } from "../report";
import type { KnownAtQuery } from "../queries";

/** The two ways a finding bears on a claim; a closure is read for each. */
const BEARINGS = ["SUPPORTS", "CHALLENGES"] as const;

export class StandingGroup extends SessionCore {
  /**
   * What the record held at a stated moment. Row Z.
   */
  async whatWasKnown({ at }: KnownAtQuery): Promise<HistoricalSurvey> {
    const parsed = Date.parse(at);
    if (Number.isNaN(parsed))
      throw new Error(
        `whatWasKnown expected an ISO instant like 2026-07-15T12:34:56.000Z, got "${at}"`,
      );
    const asOf = new Date(parsed).toISOString();

    const standings = new Map<string, { resolved: boolean; promoted: boolean; open: boolean }>();
    const asked = new Map<string, { asks: string; accepted: boolean }>();

    // Two passes, one per bearing: AGE has no edge alternation, and the cited finding may
    // support or challenge the answering claim.
    for (const bearing of BEARINGS) {
      const rows = await this.graph.query(
        `MATCH (q:Question)
         WHERE q.posed_at <= $at
         OPTIONAL MATCH (accepting:Decision)-[:ACCEPTS]->(q)
         OPTIONAL MATCH (q)-[:MOTIVATES]->(loe:LineOfEnquiry)
         OPTIONAL MATCH (resolving:Decision)-[:CLOSES]->(loe)
         OPTIONAL MATCH (resolving)-[:ANSWERS]->(answering:Claim)
         OPTIONAL MATCH (answering)-[:BASED_ON]->(part:Claim)
         OPTIONAL MATCH (resolving)-[:BASED_ON]->(cited:Evidence)
         OPTIONAL MATCH (cited)-[:${bearing}]->(borne:Claim)
         OPTIONAL MATCH (vouching:Decision)-[:CONFIRMED]->(answering)
         RETURN q, accepting, loe, resolving, answering, part, borne, vouching`,
        {
          q: vertexProps<{ natural_id: string; name: string }>(),
          accepting: optional(vertexProps<{ decided_at: string }>()),
          loe: optional(vertexProps<{ natural_id: string; started_at?: string }>()),
          resolving: optional(vertexProps<{ decided_at: string }>()),
          answering: optional(vertexProps<{ natural_id: string }>()),
          part: optional(vertexProps<{ natural_id: string }>()),
          borne: optional(vertexProps<{ natural_id: string }>()),
          vouching: optional(vertexProps<{ decided_at: string }>()),
        },
        { at: asOf },
      );

      for (const row of rows) {
        const question = row.q.natural_id;
        const entry = asked.get(question) ?? { asks: row.q.name, accepted: false };
        entry.accepted ||= row.accepting !== null && row.accepting.decided_at <= asOf;
        asked.set(question, entry);

        const was = standings.get(question) ?? { resolved: false, promoted: false, open: false };
        const existed =
          row.loe !== null && (row.loe.started_at === undefined || row.loe.started_at <= asOf);
        const closed = existed && row.resolving !== null && row.resolving.decided_at <= asOf;
        const bearsOnAnswer =
          row.answering !== null &&
          row.borne !== null &&
          (row.borne.natural_id === row.answering.natural_id ||
            row.part?.natural_id === row.borne.natural_id);
        const answered = closed && bearsOnAnswer;
        standings.set(question, {
          resolved: was.resolved || answered,
          promoted:
            was.promoted || (answered && row.vouching !== null && row.vouching.decided_at <= asOf),
          open: was.open || (existed && !closed),
        });
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
       OPTIONAL MATCH (accepting:Decision)-[:ACCEPTS]->(q)
       OPTIONAL MATCH (q)-[:MOTIVATES]->(:LineOfEnquiry)<-[:ADDRESSES]-(work:EvidenceUnit)`;
    type Closing = {
      natural_id: string;
      decided_at: string;
      reason: string;
      retracted?: boolean;
      /** The closing decision named an answer. Absent is abandoned. */
      answered: boolean;
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
    for (const bearing of BEARINGS) {
      const rows = await this.graph.query(
        `${anchor}
         OPTIONAL MATCH (q)-[:MOTIVATES]->(loe:LineOfEnquiry)
         OPTIONAL MATCH (closing:Decision)-[:CLOSES]->(loe)
         OPTIONAL MATCH (closing)-[:ANSWERS]->(answering:Claim)
         OPTIONAL MATCH (answering)-[:BASED_ON]->(part:Claim)
         OPTIONAL MATCH (closing)-[:BASED_ON]->(cited:Evidence)
         OPTIONAL MATCH (cited)-[:${bearing}]->(borne:Claim)
         OPTIONAL MATCH (answering)<-[:CONFIRMED]-(vouching:Decision)
         RETURN q, accepting, work, loe, closing, answering, part, borne, vouching`,
        {
          q: vertexProps<{ natural_id: string; name: string }>(),
          accepting: optional(
            vertexProps<{ reason: string; invalidation_check: string; decided_at: string }>(),
          ),
          work: optional(vertexProps<{ natural_id: string }>()),
          loe: optional(vertexProps<{ natural_id: string; name: string }>()),
          closing: optional(vertexProps<Omit<Closing, "answered">>()),
          answering: optional(vertexProps<{ natural_id: string }>()),
          part: optional(vertexProps<{ natural_id: string }>()),
          borne: optional(vertexProps<{ natural_id: string }>()),
          vouching: optional(vertexProps<{ natural_id: string }>()),
        },
        {},
      );

      for (const row of rows) {
        const q = row.q;
        const accepting = row.accepting;
        const entry: Entry = seen.get(q.natural_id) ?? {
          asks: q.name,
          worked: false,
          pursuits: new Map(),
          answers: new Map(),
        };
        entry.worked ||= row.work !== null;
        if (accepting && (!entry.accepting || accepting.decided_at > entry.accepting.decided_at))
          entry.accepting = accepting;

        const loe = row.loe;
        const answering = row.answering;
        const closing: Closing | null = row.closing && {
          ...row.closing,
          answered: answering !== null,
        };
        if (loe) {
          const pursuit = entry.pursuits.get(loe.natural_id) ?? { name: loe.name, closing: null };
          if (closing && closing.retracted !== true) {
            if (!pursuit.closing || closing.decided_at > pursuit.closing.decided_at)
              pursuit.closing = closing;
          }
          entry.pursuits.set(loe.natural_id, pursuit);

          const borne = row.borne;
          const part = row.part;
          const bearsOnAnswer = Boolean(
            answering &&
              borne &&
              (borne.natural_id === answering.natural_id || part?.natural_id === borne.natural_id),
          );
          if (closing && closing.retracted !== true && answering && bearsOnAnswer) {
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

    const recordedIds = [
      ...new Set(
        [...seen.values()].flatMap((entry) => [...entry.answers.values()].map((a) => a.claim)),
      ),
    ].map((id) => ref("claim", id));
    const liveFor = await this.liveClaims(recordedIds);
    const liveIds = [
      ...new Set([...liveFor.values()].filter((id): id is ClaimRef => id !== undefined)),
    ];
    const confirmatory = await this.confirmatoryOf(liveIds);
    const met = new Map<string, boolean>();
    for (const live of liveIds) met.set(live, await this.checksMet(live));

    const survey: KnowledgeSurvey = {
      established: [],
      provisional: [],
      unresolved: [],
      untested: [],
      accepted: [],
      closedPursuits: [],
    };
    for (const [question, entry] of [...seen].sort(([a], [b]) => byHandle(a, b))) {
      const standing: QuestionStanding = { question: ref("question", question), asks: entry.asks };
      const liveAnswers: Answer[] = [];
      for (const answer of entry.answers.values()) {
        const live = liveFor.get(ref("claim", answer.claim));
        if (!live) continue;
        liveAnswers.push({
          enquiry: answer.enquiry,
          claim: live,
          bearing: answer.bearing,
          vouchedFor: confirmatory.has(live),
        });
      }
      liveAnswers.sort((a, b) => byHandle(a.enquiry, b.enquiry) || byHandle(a.claim, b.claim));
      const answerReport = liveAnswers.map((answer) => ({
        enquiry: ref("enquiry", answer.enquiry),
        claim: ref("claim", answer.claim),
        bearing: answer.bearing === "CHALLENGES" ? ("challenges" as const) : ("supports" as const),
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
        const recorded = [...entry.answers.values()].find((answer) => answer.enquiry === enquiry);
        if (closing.answered && !recorded)
          throw new Error(
            `answered decision ${closing.natural_id} has no answering claim for enquiry ${enquiry}`,
          );
        const live = recorded ? liveFor.get(ref("claim", recorded.claim)) : undefined;
        const shown = live ?? (recorded ? recorded.claim : undefined);
        const shownAnswer = answerReport.find((candidate) => candidate.enquiry === enquiry);
        survey.closedPursuits.push({
          enquiry: ref("enquiry", enquiry),
          pursuing: pursuit.name,
          question: standing.question,
          decision: ref("decision", closing.natural_id),
          closure: closing.answered ? ("answered" as const) : ("abandoned" as const),
          ...(shown
            ? {
                answered: {
                  claim: ref("claim", shown),
                  bearing:
                    shownAnswer?.bearing ??
                    (recorded!.bearing === "CHALLENGES" ? "challenges" : "supports"),
                },
              }
            : {}),
        });
      }

      if (open) {
        if (entry.accepting)
          survey.accepted.push({ ...standing, ...deferral } as KnowledgeSurvey["accepted"][number]);
        else if (entry.worked || closed.length > 0) survey.unresolved.push(standing);
        else survey.untested.push(standing);
      } else if (liveAnswers.length > 0) {
        const answered = { ...standing, answers: answerReport, ...deferral };
        if (liveAnswers.every((answer) => answer.vouchedFor && met.get(answer.claim) !== false))
          survey.established.push(answered);
        else survey.provisional.push(answered);
      } else if (entry.pursuits.size > 0) survey.unresolved.push(standing);
      else survey.untested.push(standing);
    }
    survey.closedPursuits.sort((a, b) => byHandle(a.enquiry, b.enquiry));
    return survey;
  }

  /** The claim that currently stands for each recorded answering claim, if one does. */
  private async liveClaims(ids: ClaimRef[]): Promise<Map<ClaimRef, ClaimRef | undefined>> {
    const standing = await this.standingOf(ids);
    const out = new Map<ClaimRef, ClaimRef | undefined>();
    for (const id of ids) {
      const seen = new Set<ClaimRef>();
      let current = id;
      for (;;) {
        if (seen.has(current)) {
          out.set(id, undefined);
          break;
        }
        seen.add(current);
        let st = standing.get(current);
        if (!st) {
          for (const [k, v] of await this.standingOf([current])) standing.set(k, v);
          st = standing.get(current);
        }
        if (!st?.withdrawn) {
          out.set(id, current);
          break;
        }
        if (st.insteadOf.length !== 1) {
          out.set(id, undefined);
          break;
        }
        current = st.insteadOf[0]!.claim;
      }
    }
    return out;
  }
}
