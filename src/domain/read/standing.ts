import { optional, vertexProps } from "../../db/cypher";
import type { Timestamp } from "../../db/domain";
import { SessionCore } from "../core";
import { compose, per, type Row } from "../facts";
import type { HistoricalSurvey, KnowledgeSurvey, QuestionStanding } from "../report";
import { ref } from "../report";
import {
  type AnsweringClaim,
  BEARINGS,
  answeringClaimBearing,
  checksMetBearing,
  standingAsOf,
} from "../survey-facts";

export class StandingGroup extends SessionCore {
  /**
   * What the record held at a stated moment. Row Z.
   *
   * Every act that moves belief is a `Decision`, and each now carries
   * `decided_at`, so this filters on the acts rather than on their consequences.
   * Two things that took a build to learn:
   *
   * **Promotion is dated, not read off the claim.** `whatIsKnown()` asks whether
   * `Claim.kind` is `confirmatory` — correct for the present and wrong for any
   * past moment, because it would report a question `established` in March on
   * the strength of a promotion made in August. Here it is the `PROMOTES`
   * decision's own instant that decides.
   *
   * **`open` is not split.** See {@link HistoricalSurvey}: nothing records when
   * work began, so worked-on and untouched cannot be told apart as-of, and this
   * declines to guess rather than leaking today's evidence units into a question
   * about the past.
   *
   * **A question that did not exist yet is not open.** `open` is an assertion —
   * the question was on the record and nothing had settled it — so a question
   * posed after the instant must be absent from the survey entirely, not placed
   * in the bucket every unclassified row falls into. That took a new property,
   * `Question.posed_at`, earned by demonstration: see its docstring in
   * `src/db/domain.ts` and tests/consumer/historical_survey.test.ts.
   *
   * **The instant is canonicalised before anything is compared.** Every stamp
   * this reads is written by a `Clock` as UTC ISO-8601, where lexical order and
   * instant order agree. A caller's string need not be: `2026-03-01T09:00:00-05:00`
   * is 14:00Z and sorts before `2026-03-01T10:00:00.000Z`, so comparing the raw
   * text reported a question unresolved four hours after it was resolved.
   * `Date.parse` accepted it, which is exactly why validating a string is not
   * the same as being able to order it.
   */
  async whatWasKnown(at: Timestamp): Promise<HistoricalSurvey> {
    const parsed = Date.parse(at);
    if (Number.isNaN(parsed))
      throw new Error(
        `whatWasKnown expected an ISO instant like 2026-07-15T12:34:56.000Z, got "${at}"`,
      );
    const asOf = new Date(parsed).toISOString();

    // Composed from a time-scoped standing fact. `whatIsKnown` and this verb
    // both decide "was this answer promoted", and the two drifted once already
    // — the current survey learned to consult prespecified checks and this one
    // did not, four lines apart in shape. Sharing the clause and the fold is
    // what stops that recurring; the *time* is the argument.
    // One bearing per query, merged — the same shape as `whatIsKnown`, and for
    // the same reason.
    const standings = new Map<string, { resolved: boolean; promoted: boolean }>();
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
        const seen = standings.get(question) ?? { resolved: false, promoted: false };
        standings.set(question, {
          resolved: seen.resolved || was.resolved,
          promoted: seen.promoted || was.promoted,
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
      const was = standings.get(question) ?? { resolved: false, promoted: false };
      if (was.resolved && was.promoted) survey.established.push(entry);
      else if (was.resolved) survey.provisional.push(entry);
      else if (e.accepted) survey.accepted.push(entry);
      else survey.open.push(entry);
    }
    return survey;
  }

  /**
   * What the programme knows: settled, unsettled, and never looked at.
   *
   * More states than settled-or-not, classified structurally — established is a
   * question resolved on cited evidence, untested is one nothing has ever been
   * run against, and `provisional` and `accepted` are each checked before
   * `unresolved`, which takes the rest. See `KnowledgeSurvey` for what each
   * bucket means and why none is a flag on another. Nothing here compares a
   * question's words to a claim's; the buckets come from what is attached to
   * each question, not from what it says.
   */
  async whatIsKnown(): Promise<KnowledgeSurvey> {
    // Composed from named facts rather than written out, so that "the claim
    // this answer rests on" and "did its prespecified checks pass" are the same
    // definitions every other reader uses. Two defects came from those being
    // written twice: a promoted *negative* result whose checks were unreachable
    // because only `SUPPORTS` was matched, and a disagreement with
    // `whySupported` about which claims a check belongs to. See
    // `./survey-facts.ts`.
    // One bearing per query, merged — because AGE has no edge alternation and
    // the two-columns-in-one-query version is how the last defect survived: the
    // fact collected both names and the grain read one, so a criterion reached
    // down the challenged path was silently dropped. Downstream of this loop
    // there is one `answering` and one `crit`.
    const anchor = `MATCH (q:Question)
       OPTIONAL MATCH (accepting:Decision)-[:DEFERS]->(q)
       OPTIONAL MATCH (q)-[:MOTIVATES]->(:LineOfEnquiry)<-[:ADDRESSES]-(work:EvidenceUnit)`;

    const answering = new Map<string, AnsweringClaim>();
    // Which bearing supplied the answering claim -- CHALLENGES means the
    // question was answered "no", exactly as `enquiryStatus` derives polarity
    // from the same shape of query. Never both for one question in practice
    // (`closeEnquiry` forbids a second `RESOLVES`), so last-write is
    // academic, not a real ambiguity to resolve.
    const answeringBearing = new Map<string, "SUPPORTS" | "CHALLENGES">();
    const met = new Map<string, boolean>();
    const seen = new Map<
      string,
      {
        asks: string;
        accepted: boolean;
        worked: boolean;
        reopensIf?: string;
        acceptedBecause?: string;
      }
    >();

    for (const bearing of BEARINGS) {
      const claimFact = answeringClaimBearing(bearing);
      const metFact = checksMetBearing(bearing);
      const { cypher, decoders } = compose(anchor, metFact, {
        q: vertexProps<{ natural_id: string; name: string }>(),
        accepting: optional(
          vertexProps<{ natural_id: string; reason: string; invalidation_check: string }>(),
        ),
        work: optional(vertexProps<{ natural_id: string }>()),
      });
      const rows = (await this.graph.query(cypher, decoders, {})) as unknown as Row[];

      for (const [question, answer] of per(claimFact, rows)) {
        if (answer !== null) {
          answering.set(question, answer);
          answeringBearing.set(question, bearing);
        }
      }
      for (const [claim, ok] of per(metFact, rows)) met.set(claim, ok);

      for (const row of rows) {
        const q = row.q as { natural_id: string; name: string };
        const accepting = row.accepting as { reason: string; invalidation_check: string } | null;
        const entry = seen.get(q.natural_id) ?? { asks: q.name, accepted: false, worked: false };
        entry.accepted ||= accepting !== null;
        entry.worked ||= row.work !== null;
        // Same `accepting` node every time it appears, regardless of which
        // bearing's query found this row -- one `DEFERS` decision per
        // question, not one per bearing.
        if (accepting) {
          entry.acceptedBecause = accepting.reason;
          entry.reopensIf = accepting.invalidation_check;
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
    };
    for (const [question, entry] of seen) {
      const standing: QuestionStanding = { question: ref("question", question), asks: entry.asks };
      const claim = answering.get(question);
      // Settled beats accepted: a question answered after being accepted is
      // answered. Accepted beats worked, because a reader scanning for what
      // still needs doing must not find a deliberately-parked question there.
      //
      // `established` is the strongest word this survey has and means the
      // answer rests on promoted work **that met the standard it was held to**.
      // Promoted is the `PROMOTES` edge the walk to the answering claim already
      // followed, not `Claim.kind`: `--standing confirmatory` writes that value
      // to say a finding was prespecified, which is not a vouch.
      // Promotion alone is not enough: a prespecified check that failed, or
      // that nobody ran, counts against the finding it qualifies. A claim held
      // to nothing is vacuously met, so promoted work under no standard stays
      // `established`.
      const answer: "yes" | "no" = answeringBearing.get(question) === "CHALLENGES" ? "no" : "yes";
      // Carried onto the answer when there was one: a question answered after
      // being deliberately parked is answered, and it is also a question
      // somebody parked on a stated condition. Dropping the second the moment
      // the first arrives makes the pairing unreconstructable.
      const deferral =
        entry.acceptedBecause === undefined
          ? {}
          : { acceptedBecause: entry.acceptedBecause, reopensIf: entry.reopensIf! };
      if (claim && claim.vouchedFor && met.get(claim.claim.natural_id) !== false)
        survey.established.push({
          ...standing,
          claim: ref("claim", claim.claim.natural_id),
          answer,
          ...deferral,
        });
      else if (claim)
        survey.provisional.push({
          ...standing,
          claim: ref("claim", claim.claim.natural_id),
          answer,
          ...deferral,
        });
      else if (entry.accepted)
        survey.accepted.push({
          ...standing,
          // Never absent when `entry.accepted` is true -- both are set in the
          // same branch above, the one time `accepting` is seen for this
          // question.
          reopensIf: entry.reopensIf!,
          acceptedBecause: entry.acceptedBecause!,
        });
      else if (entry.worked) survey.unresolved.push(standing);
      else survey.untested.push(standing);
    }
    return survey;
  }
}
