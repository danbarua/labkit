/**
 * The verbs that answer questions about the record, and change nothing.
 *
 * Nothing in this file may emit. `emit` is not reachable from `SessionCore`, so
 * that is enforced by construction rather than by review.
 */

import { edgeProps, optional, scalar, vertexProps } from "../db/cypher";
import { NODE_LABELS, SEARCHABLE_PROSE, SEARCHABLE_PROSE_ARRAYS } from "../db/domain";
import type {
  ArtefactProps,
  ClaimProps,
  ComputationProps,
  EvidenceProps,
  IdentityString,
  IndexedString,
  Prose,
  Timestamp,
} from "../db/domain";
import type {
  HistoricalSurvey,
  ReproducibilityReport,
  ReproductionReport,
  AmendmentRecord,
  TaskContract,
  ClaimRef,
  ConcludedClaim,
  SearchGroup,
  SearchMatch,
  ConflictSide,
  ConflictVerdict,
  AnalysisRef,
  CheckStatus,
  EnquiryStatus,
  EnquiryInContext,
  QuestionBucket,
  CriterionRef,
  BlockedWork,
  ListedGate,
  ListedWork,
  WorkState,
  DecisionRef,
  EvidenceRef,
  GateRef,
  GateStatus,
  WorkRef,
  DesignHistory,
  EnquiryRef,
  KnowledgeSurvey,
  ObservationsRef,
  QuestionOrigin,
  QuestionRef,
  QuestionStanding,
  InterpretationHistory,
  Revision,
  AffectedClaim,
  AffectedEnquiry,
  CitedFinding,
  Reverification,
  DependencyReport,
  IdentifiedArtefact,
  SupportExplanation,
  Kind,
  AnyRef,
  Cause,
  Explanation,
  ClaimExplanation,
  WorkExplanation,
  EnquiryExplanation,
  GateExplanation,
  Standing,
  AnalysisRevision,
  RevisedFinding,
  AnalysisExplanation,
  Ref,
} from "./report";
import { ref, isRefOfKind, KIND_BY_LABEL, kindOf } from "./report";
import { compose, per, type Row } from "./facts";
import {
  BEARINGS,
  answeringClaimBearing,
  checkStatus,
  checkStatusForGate,
  checksAnchor,
  checksMetBearing,
  standingAsOf,
  type CheckState,
} from "./survey-facts";
import { SessionCore, type Methods } from "./core";
import type { DomainEvent, EventFilter } from "./events";

/** Every node carries a natural id; this is how a projection asks for it. */
type Identified = { natural_id: string };

/**
 * Deduplicate by identity, never by wording.
 *
 * A `Set` of strings will not do: two records can say the same sentence and be
 * different records, so collapsing on text reports one where there are two.
 */
function dedupeById<T>(items: T[], id: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [id(item), item])).values()];
}

/**
 * The read verbs a research session answers — the read half of
 * {@link ResearchWrites}, and derived the same way (see {@link Methods}).
 *
 * Its whole job is the assertion in `./session.ts`: a `ResearchSession`
 * composes a `ReadSurface` and delegates each verb by hand, so a verb added
 * here without a delegate there is reachable from the CLI and MCP and from
 * nowhere a scenario can call.
 */
export type ResearchReads = Pick<ReadSurface, Methods<ReadSurface>>;

/**
 * **What a refusal may point a caller at, and what it may not.**
 *
 * Two near-misses in two pull requests produced this, and both looked done
 * because the first case checked out.
 *
 * **A refusal may not name a command.** The domain does not know which surface
 * is calling, and the two do not agree: `pursuits`/`pursuits_of`,
 * `claims`/`claims_asserting`, `work`/`work_list`, `gates`/`gate_list`. Four of
 * the five checked differ, so naming one hands the other audience
 * `unknown command`. Name the **act** instead — *an enquiry is opened against a
 * question* — which is true wherever the caller is.
 *
 * **A verb may be named only if both surfaces spell it identically AND its
 * promise has been checked against the code that implements it.** Spelling is
 * not enough: `search` is spelled the same on both surfaces but scans only
 * {@link SEARCHABLE_PROSE}, and `Computation`, `Claim` and `Artefact` are
 * absent from that table — so *"'search' finds its handle by the method"* sends
 * a caller to a search that returns nothing.
 *
 * **A taught remedy that fails is worse than the opacity it replaced**, because
 * the caller believes it and spends the trust before finding out.
 */
export class ReadSurface extends SessionCore {
  /**
   * What was done, in order — the one read that answers from the event log
   * rather than the graph.
   *
   * **Events explain how state changed; the graph explains what the current
   * research state is.** Every other read here answers "what is true now" and
   * must never consult the log. This one asks "what happened", which the graph
   * cannot answer at all: it holds the result of every act and no record of the
   * acts themselves, and the log is the only place that says **who** did any of
   * it.
   *
   * So: do not reach for this to establish current state, and do not add a
   * caller that does. If an answer can be derived from the graph, derive it
   * there — that is what makes the graph's answers durable rather than
   * replayed, which several scenarios assert with a provably empty log.
   *
   * Ordered by `seq`, not by `at`. Under a frozen clock every event in a
   * session shares one instant; the sequence is the only thing that orders them.
   */
  async whatHappened(filter: EventFilter = {}): Promise<readonly DomainEvent[]> {
    return this.events.select(filter);
  }

  /** Every line of enquiry pursuing this question. */
  async pursuitsOf(question: QuestionRef): Promise<EnquiryRef[]> {
    const rows = await this.graph.query(
      `MATCH (:Question {natural_id: $id})-[:MOTIVATES]->(loe:LineOfEnquiry) RETURN loe`,
      { loe: vertexProps<{ natural_id: string }>() },
      { id: question },
    );
    return rows.map((r) => ref("enquiry", r.loe.natural_id) as EnquiryRef);
  }

  /**
   * Where a question came from, if it came from sharpening an earlier one.
   *
   * `null` for a question somebody simply asked — most questions have no
   * origin beyond the person who thought of it, and inventing one would be
   * worse than saying so.
   */
  async originOf(question: QuestionRef): Promise<QuestionOrigin | null> {
    const rows = await this.graph.query(
      `MATCH (d:Decision)-[:MOTIVATES]->(:Question {natural_id: $id})
       MATCH (d)-[:NARROWS]->(from:Question)
       RETURN d, from AS origin`,
      {
        d: vertexProps<{ natural_id: string; reason: string }>(),
        origin: vertexProps<{ natural_id: string; name: string }>(),
      },
      { id: question },
    );
    if (rows.length === 0) return null;

    const row = rows[0]!;
    const knew = await this.graph.query(
      `MATCH (:Decision {natural_id: $id})-[:BASED_ON]->(e:Evidence) RETURN e`,
      { e: vertexProps<{ statement: string } & Identified>() },
      { id: row.d.natural_id },
    );

    return {
      from: ref("question", row.origin.natural_id),
      fromAsks: row.origin.name,
      reason: row.d.reason,
      knownAtTheTime: dedupeById(
        knew.map((r) => ({
          evidence: ref("evidence", r.e.natural_id),
          states: r.e.statement,
        })),
        (f) => f.evidence,
      ).sort((a, b) => a.evidence.localeCompare(b.evidence)),
    };
  }

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

    const answering = new Map<string, { natural_id: string; kind?: string }>();
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

      for (const [question, claim] of per(claimFact, rows)) {
        if (claim !== null) {
          answering.set(question, claim);
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
      // Promotion alone is not enough: a prespecified check that failed, or
      // that nobody ran, counts against the finding it qualifies. A claim held
      // to nothing is vacuously met, so promoted work under no standard stays
      // `established`.
      const answer: "yes" | "no" = answeringBearing.get(question) === "CHALLENGES" ? "no" : "yes";
      if (claim && claim.kind === "confirmatory" && met.get(claim.natural_id) !== false)
        survey.established.push({ ...standing, claim: ref("claim", claim.natural_id), answer });
      else if (claim)
        survey.provisional.push({ ...standing, claim: ref("claim", claim.natural_id), answer });
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

  /** Is this enquiry open, and if not, how did it close? */
  async enquiryStatus(enquiry: EnquiryRef): Promise<EnquiryStatus> {
    const named = await this.graph.query(
      `MATCH (loe:LineOfEnquiry {natural_id: $id}) RETURN loe`,
      { loe: vertexProps<{ name: string }>() },
      { id: enquiry },
    );
    const loe = named[0];
    if (!loe)
      throw new Error(
        `no enquiry ${enquiry}; an enquiry is opened against a question, and 'search' finds its handle by the approach it was opened with`,
      );

    // Closure attaches to the question the enquiry pursues, not to the
    // enquiry itself -- an enquiry is a way of pursuing a question, and it is
    // the question that gets answered.
    const rows = await this.graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $id})
       OPTIONAL MATCH (resolving:Decision)-[:RESOLVES]->(q)
       OPTIONAL MATCH (deferring:Decision)-[:DEFERS]->(q)
       RETURN q, resolving, deferring`,
      {
        q: vertexProps<{ name: string; natural_id: string }>(),
        resolving: optional(vertexProps<{ natural_id: string }>()),
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

    // What this pursuit itself produced. Evidence units address the line of
    // enquiry they were recorded against, so this is the enquiry's own work --
    // and it is the field that makes "where is my ablation up to?" answerable
    // without inferring anything from the question's state.
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

    // Identity and wording, kept apart. The old line was
    // `rows[0]?.q.name ?? loe.loe.name` -- wording, silently substituting the
    // enquiry's own name when no question stood behind it. Two entities' text
    // in one field, and no way for a caller to reach the question at all.
    const behind = rows[0]?.q ?? null;
    const _question = behind?.natural_id ?? null;
    const _asks = behind?.name ?? null;
    const resolving = rows.find((r) => r.resolving)?.resolving ?? null;
    const deferred = rows.some((r) => r.deferring);

    if (!resolving && !deferred) {
      return {
        enquiry,
        pursuing: loe.loe.name,
        contributed,
        question: behind && {
          question: ref("question", behind.natural_id),
          asks: behind.name,
          open: true,
          closure: null,
          answer: null,
          evidence: [],
        },
      };
    }
    // Accepted, not closed. `open` stays TRUE: a question left open on purpose
    // is not shut. It has not been answered and nobody claims it has; what
    // changed is that leaving it open is now a
    // recorded decision rather than an absence of one.
    const accepting = rows.find((r) => r.deferring)?.deferring ?? null;
    if (accepting && !resolving) {
      const inLightOf = await this.graph.query(
        `MATCH (:Decision {natural_id: $id})-[:BASED_ON]->(e:Evidence) RETURN e`,
        { e: vertexProps<{ statement: string } & Identified>() },
        { id: accepting.natural_id },
      );
      return {
        enquiry,
        pursuing: loe.loe.name,
        contributed,
        question: behind && {
          question: ref("question", behind.natural_id),
          asks: behind.name,
          open: true,
          closure: "accepted-as-unresolved",
          answer: null,
          evidence: dedupeById(
            inLightOf.map((r) => ({
              evidence: ref("evidence", r.e.natural_id),
              states: r.e.statement,
            })),
            (f) => f.evidence,
          ),
          acceptedBecause: accepting.reason,
          reopensIf: accepting.invalidation_check,
        },
      };
    }

    // What the closing decision rests on. Nothing cited means the question was
    // abandoned, not answered -- absence of evidence is not a negative result.
    const cited = await this.graph.query(
      // Only the challenging bearing is fetched: polarity is "no" when
      // something challenges and "yes" otherwise, so the supporting side is the
      // default rather than an input. Returning it as `forClaim` would also be
      // silently broken, since a camelCase column decodes as null (see
      // `buildAsClause`, which
      // now refuses the name that hid this).
      `MATCH (:Decision {natural_id: $id})-[:BASED_ON]->(e:Evidence)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(against:Claim)
       RETURN e, against`,
      {
        e: vertexProps<{ statement: string } & Identified>(),
        against: optional(vertexProps<{ name: string }>()),
      },
      { id: resolving!.natural_id },
    );

    if (cited.length === 0) {
      return {
        enquiry,
        pursuing: loe.loe.name,
        contributed,
        question: behind && {
          question: ref("question", behind.natural_id),
          asks: behind.name,
          open: false,
          closure: "abandoned",
          answer: null,
          evidence: [],
        },
      };
    }

    // Polarity is derived from which way the cited findings cut, not stored on
    // the decision: a question answered by evidence that challenges its
    // proposition was answered "no".
    const challenges = cited.some((r) => r.against !== null);

    // What the closure rests on: promoted work, or scratch nobody promoted.
    // Answered either way -- the question is settled as far as anyone has taken
    // it -- but a reader deciding whether to build on it should not have to go
    // and look.
    // **Both bearings.** A question answered *no* is settled by evidence that
    // CHALLENGES the claim, so walking only SUPPORTS finds no claim at all and
    // a promoted negative result reports itself as resting on scratch. No edge
    // alternation in AGE, so it is two OPTIONAL MATCHes.
    const promoted = await this.graph.query(
      `MATCH (:Decision {natural_id: $id})-[:BASED_ON]->(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(sc:Claim)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(cc:Claim)
       RETURN sc, cc`,
      {
        sc: optional(vertexProps<{ kind?: string }>()),
        cc: optional(vertexProps<{ kind?: string }>()),
      },
      { id: resolving!.natural_id },
    );
    return {
      enquiry,
      pursuing: loe.loe.name,
      contributed,
      question: behind && {
        question: ref("question", behind.natural_id),
        asks: behind.name,
        open: false,
        closure: "answered",
        answer: challenges ? "no" : "yes",
        evidence: dedupeById(
          cited.map((r) => ({
            evidence: ref("evidence", r.e.natural_id),
            states: r.e.statement,
          })),
          (f) => f.evidence,
        ),
        restsOn: promoted.some((r) => (r.sc ?? r.cc)?.kind === "confirmatory")
          ? "confirmatory"
          : "exploratory",
      },
    };
  }

  /**
   * `enquiryStatus`, alongside where this enquiry's own question sits in the
   * overall survey — one bucket, not the whole survey. See
   * `EnquiryInContext`'s own doc comment.
   *
   * **No adapter reaches this directly.** It is the body of `why <enquiry>`'s
   * `LineOfEnquiry` case (`explainEnquiry`, below `ReadSurface`) — see
   * `NOT_EXPOSED`. Public rather than `private` because `explainEnquiry` is a
   * module-level function, not a class member; see `Explainer`.
   */
  async enquiryInContext(enquiry: EnquiryRef): Promise<EnquiryInContext> {
    const status = await this.enquiryStatus(enquiry);
    if (!status.question) return { enquiry: status, standing: null };

    const survey = await this.whatIsKnown();
    const buckets: [QuestionBucket, QuestionStanding[]][] = [
      ["established", survey.established],
      ["unresolved", survey.unresolved],
      ["untested", survey.untested],
      ["provisional", survey.provisional],
      ["accepted", survey.accepted],
    ];
    // Every question that exists lands in exactly one bucket, by construction
    // of the partition `whatIsKnown()` computes -- but this reads that back
    // from what the survey actually returned rather than assuming it, the
    // same discipline `contractFor()`'s `q`/`loe` pairing follows.
    let standing: EnquiryInContext["standing"] = null;
    for (const [bucket, questions] of buckets) {
      const found = questions.find((q) => q.question === status.question!.question);
      if (found) {
        standing = { question: found.question, asks: found.asks, bucket };
        break;
      }
    }
    return { enquiry: status, standing };
  }

  /**
   * Findings bearing on a proposition **within an enquiry**, one way or the
   * other — deliberately not by claim handle, which was tried and refuted.
   *
   * `bearing` is interpolated because pglite-age rejects edge-type alternation
   * outright — `[:SUPPORTS|CHALLENGES]` is a syntax error, not merely
   * unsupported for variable-length patterns. The value comes from a closed set
   * of literals here, never from a caller.
   *
   * Everything else in `whySupported` now selects by handle, because two
   * analyses in one enquiry concluding the same sentence are two claims and a
   * check held by one is not the other's standard. **Findings are the
   * exception**, and the distinction is a domain fact: a re-run producing the
   * same conclusion **corroborates**, so findings aggregate over the
   * proposition, while a prespecified check **belongs to** the analysis held to
   * it. Same two nodes, two different questions, two answers.
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
       OPTIONAL MATCH (e)-[:RECORDED_IN]->(a:Artefact)
       OPTIONAL MATCH (r:Review)-[:EVALUATES]->(u)
       // Supersession, per claim -- the same pair withdrawalOf reads: a
       // decision that stands instead of this one.
       OPTIONAL MATCH (d:Decision)-[:SUPERSEDES]->(c)
       // Which review THIS retraction rested on (row O), at the grain the
       // question is asked. Distinct from the 'r' above, which is any review of
       // the unit -- reading that as the cause is what reported a confirming
       // review as a reason work was retracted.
       OPTIONAL MATCH (d)-[:INVALIDATED_BY]->(caused:Review)
       RETURN e, comp, a, r, d, caused`,
      {
        e: vertexProps<EvidenceProps & { natural_id: string }>(),
        comp: vertexProps<ComputationProps & Identified>(),
        a: optional(vertexProps<ArtefactProps & { natural_id: string }>()),
        r: optional(vertexProps<{ verdict: string }>()),
        d: optional(vertexProps<{ reason: string }>()),
        caused: optional(vertexProps<{ verdict: string }>()),
      },
      {
        name: scope.proposition,
        ...this.scopeParams(scope),
      },
    );
  }

  /** What a planned task is permitted to touch, and whether anyone is enforcing it. */
  async contractFor(work: WorkRef): Promise<TaskContract> {
    const rows = await this.graph.query(
      `MATCH (t:Task {natural_id: $id})
       OPTIONAL MATCH (t)-[:ADDRESSES]->(loe:LineOfEnquiry)
       OPTIONAL MATCH (q:Question)-[:MOTIVATES]->(loe)
       RETURN t, loe, q`,
      {
        t: vertexProps<{
          objective: string;
          acceptance: string;
          mayRead: string[];
        }>(),
        loe: optional(vertexProps<{ natural_id: string; name: string }>()),
        q: optional(vertexProps<{ natural_id: string; name: string }>()),
      },
      { id: work },
    );
    const task = rows[0]?.t;
    if (!task)
      throw new Error(
        `no planned work ${work}; work is planned before it can be read back, and 'search' finds its handle by the objective`,
      );

    // No fallback, and that is checked rather than assumed: `planWork` writes
    // `mayRead: input.mayRead ?? []`, so the property is always present and an
    // empty contract round-trips as a real empty array. A guard here would be
    // guarding a shape the writer cannot produce.
    const loe = rows[0]?.loe;
    const q = rows[0]?.q;
    return {
      work,
      objective: task.objective,
      acceptance: task.acceptance,
      mayRead: task.mayRead,
      enforced: false,
      // `q` is never absent when `loe` is present -- see TaskContract.addressing
      // -- but the report shape still has to be built from what the query
      // returned rather than assumed.
      ...(loe && q
        ? {
            addressing: {
              enquiry: ref("enquiry", loe.natural_id),
              pursuing: loe.name,
              question: ref("question", q.natural_id),
              asks: q.name,
            },
          }
        : {}),
    };
  }

  /**
   * Which criterion governs this gate?
   *
   * Answered via `GOVERNS`, which exists from the moment the gate is declared.
   * A route through `CriterionEvaluation` instead returns nothing for a gate
   * nobody has evaluated — which is exactly the gate the question is usually
   * asked about. See EDGE_SCHEMA.GOVERNS.
   */
  async criteriaGoverning(gate: GateRef): Promise<CriterionRef[]> {
    const rows = await this.graph.query(
      `MATCH (c:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ natural_id: string }>() },
      { id: gate },
    );
    return rows.map((r) => ref("criterion", r.c.natural_id));
  }

  /**
   * What a re-run did and did not establish.
   *
   * The execution verdict is derived from what each run recorded consuming, not
   * from a stored flag: two runs are a reproduction when they read the same
   * recorded inputs. Structure in the query rather than in the stored model, so
   * there is no value anyone can set to "reproduced".
   */
  async reproductionOf(verification: AnalysisRef): Promise<ReproductionReport> {
    const link = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:PRODUCES]->(new:Evidence)
       MATCH (new)-[:REVERIFIES]->(old:Evidence)<-[:PRODUCES]-(:EvidenceUnit)-[:USES]->(oldcomp:Computation)
       RETURN new, old, oldcomp`,
      {
        new: vertexProps<{ natural_id: string }>(),
        old: vertexProps<{ natural_id: string }>(),
        oldcomp: vertexProps<{ natural_id: string; kind: string }>(),
      },
      { id: verification },
    );
    const found = link[0];
    if (!found)
      throw new Error(
        `analysis ${verification} re-verifies nothing; a reproduction report is about a re-verification, so name one recorded by 'reverify'`,
      );

    const method = await this.graph.query(
      `MATCH (c:Computation {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ kind: string }>() },
      { id: verification },
    );

    // Keyed by natural id, never by `logical_name`. Two runs can each record
    // something called "initial conditions" and mean different data; comparing
    // the names would make those the same execution input.
    // What a run read, **in order and with repeats**, plus the same as a set
    // for the difference calculation below.
    //
    // Two shapes because they answer different questions. `read` is the
    // sequence the caller gave: `from: [A, B, A]` is three occurrences and a
    // reader comparing two runs needs all three. `bySubject` is which records
    // were involved, which is what `differs` is about -- reading one twice and
    // reading it once are not a *difference in inputs*, they are a difference
    // in the sequence, and the two lists show that plainly.
    //
    // Edges written before `positions` existed have none; they sort last and
    // among themselves by identity, so the list is stable rather than
    // arbitrary. An absent position is not position zero.
    const inputs = async (
      computation: string,
    ): Promise<{
      read: IdentifiedArtefact[];
      bySubject: Map<ObservationsRef, IdentifiedArtefact>;
    }> => {
      const rows = await this.graph.query(
        `MATCH (:Computation {natural_id: $id})-[c:CONSUMES]->(a:Artefact) RETURN a, c`,
        {
          a: vertexProps<{ natural_id: string; logical_name: string }>(),
          c: edgeProps<{ positions?: number[] }>(),
        },
        { id: computation },
      );
      const occurrences = rows.flatMap((r) =>
        (r.c.positions ?? [Number.MAX_SAFE_INTEGER]).map((position) => ({
          position,
          a: r.a,
        })),
      );
      occurrences.sort(
        (x, y) => x.position - y.position || x.a.natural_id.localeCompare(y.a.natural_id),
      );
      const identify = (a: { natural_id: string; logical_name: string }): IdentifiedArtefact => ({
        part: ref("observations", a.natural_id),
        name: a.logical_name,
      });
      return {
        read: occurrences.map((o) => identify(o.a)),
        bySubject: new Map(rows.map((r) => [ref("observations", r.a.natural_id), identify(r.a)])),
      };
    };
    const mine = await inputs(verification);
    const theirs = await inputs(found.oldcomp.natural_id);
    const mineBy = mine.bySubject;
    const theirsBy = theirs.bySubject;

    // Absence and difference are not the same answer, and absence on BOTH sides
    // is still absence: two runs that each recorded nothing have not reproduced
    // anything, they have simply both failed to say what they read. Comparing
    // the two empty sets reported `reproduced`, contradicting the premise the
    // scenario exists for.
    const provenanceMissing = theirsBy.size === 0;
    const differs: ReproductionReport["differs"] = provenanceMissing
      ? [...mineBy.values()].map((what) => ({
          what,
          standing: "unrecorded-in-the-original" as const,
        }))
      : [
          ...[...mineBy]
            .filter(([id]) => !theirsBy.has(id))
            .map(([, what]) => ({ what, standing: "changed" as const })),
          // The other direction, which was not computed at all: an input the
          // original read and the re-run did not is a difference too, and
          // reporting `not-reproduced` with an empty `differs` named nothing.
          ...[...theirsBy]
            .filter(([id]) => !mineBy.has(id))
            .map(([, what]) => ({
              what,
              standing: "not-used-by-the-re-run" as const,
            })),
        ];
    // Sorted by name then identity: the name is what a reader scans, and the
    // identity breaks the tie when two inputs share one.
    differs.sort(
      (a, b) => a.what.name.localeCompare(b.what.name) || a.what.part.localeCompare(b.what.part),
    );

    // Which way each run cut, read from the bearing each finding was recorded
    // with -- never from comparing the two findings' wording. Both are needed:
    // reading only the re-run's made two runs that each found *against* the
    // proposition report as disagreeing with each other.
    const challenges = async (evidence: string): Promise<boolean> =>
      (
        await this.graph.query(
          `MATCH (:Evidence {natural_id: $id})-[:CHALLENGES]->(:Claim) RETURN 1`,
          { ok: scalar<number>() },
          { id: evidence },
        )
      ).length > 0;
    const newChallenges = await challenges(found.new.natural_id);
    const oldChallenges = await challenges(found.old.natural_id);
    const agrees = newChallenges === oldChallenges;

    return {
      // Identity and wording both. Method text alone leaves two runs of one
      // method indistinguishable.
      verification,
      verificationMethod: method[0]!.c.kind,
      of: ref("analysis", found.oldcomp.natural_id),
      ofMethod: found.oldcomp.kind,
      conclusion: agrees ? "agrees" : "disagrees",
      // Both lists, in order, and no verdict over them. Whether the same
      // records read in a different order is the same execution depends on what
      // the method does; the record does not know and does not guess.
      verificationRead: mine.read,
      ofRead: theirs.read,
      differs,
      // Which way the RE-RUN cuts for the claim -- a question about the
      // proposition, not about whether the two runs concur. Two runs that agree
      // on a negative finding agree with each other and lower confidence in the
      // proposition, and those are different sentences.
      bearing: newChallenges ? "lowers" : "raises",
    };
  }

  /**
   * A locked design and everything that has happened to it, oldest first.
   *
   * The order comes from the supersession chain alone — no decision carries a
   * timestamp, nothing is read from the event log, and natural-id allocation
   * order is never consulted. It does **not** order two amendments to different
   * designs relative to each other.
   */
  async designHistory(gate: GateRef): Promise<DesignHistory> {
    const conditions = await this.graph.query(
      `MATCH (c:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id})
       OPTIONAL MATCH (d:Decision)-[:CHANGES]->(c)
       RETURN c, d`,
      {
        c: vertexProps<{ natural_id: string; proposition: string }>(),
        d: optional(vertexProps<{ natural_id: string }>()),
      },
      { id: gate },
    );
    if (conditions.length === 0)
      throw new Error(
        `gate ${gate} is governed by no condition; a design history is the record of its conditions being amended, and this gate has none to amend`,
      );

    const changedBy = new Map<DecisionRef, CriterionRef>();
    const propositionOf = new Map<CriterionRef, Prose>();
    const current: CriterionRef[] = [];
    for (const row of conditions) {
      propositionOf.set(ref("criterion", row.c.natural_id), row.c.proposition);
      if (row.d)
        changedBy.set(ref("decision", row.d.natural_id), ref("criterion", row.c.natural_id));
      else current.push(ref("criterion", row.c.natural_id));
    }

    // A design history needs one condition in force. A gate governed by
    // several unamended conditions is a different shape, and guessing which one
    // is "the design" would be a confidently wrong answer.
    const inForce = [...new Set(current)];
    if (inForce.length !== 1) {
      throw new Error(
        `gate ${gate} has ${inForce.length} conditions in force; a design history needs exactly one`,
      );
    }

    const chain = await this.amendmentChain(gate);
    const rerun = await this.workGatedBy([gate]);
    const confirmatory = await this.confirmatoryResultsBehind([gate]);
    const nature = confirmatory.length > 0 ? ("scientific" as const) : ("mechanical" as const);

    const amendments: AmendmentRecord[] = chain.map((step, i) => {
      const wasCriterion = changedBy.get(step.decision);
      const nextCriterion =
        i + 1 < chain.length ? changedBy.get(chain[i + 1]!.decision) : inForce[0];
      return {
        amendment: step.decision,
        replaced: {
          criterion: ref("criterion", wasCriterion ?? ""),
          requires: (wasCriterion && propositionOf.get(wasCriterion)) ?? "",
        },
        nowRequires: {
          criterion: ref("criterion", nextCriterion ?? ""),
          requires: (nextCriterion && propositionOf.get(nextCriterion)) ?? "",
        },
        reason: step.reason,
        citing: step.citing,
        rerun,
        nature,
      };
    });

    const firstReplaced = amendments[0]?.replaced;
    return {
      gate,
      originally: firstReplaced ?? {
        criterion: ref("criterion", inForce[0]!),
        requires: propositionOf.get(inForce[0]!)!,
      },
      nowRequires: {
        criterion: ref("criterion", inForce[0]!),
        requires: propositionOf.get(inForce[0]!)!,
      },
      criterion: ref("criterion", inForce[0]!),
      amendments,
    };
  }

  /** Amendments to one design, ordered oldest-first by following supersession back to its root. */
  private async amendmentChain(
    gate: GateRef,
  ): Promise<Array<{ decision: DecisionRef; reason: Prose; citing: CitedFinding[] }>> {
    const rows = await this.graph.query(
      `MATCH (d:Decision)-[:CHANGES]->(:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id})
       OPTIONAL MATCH (d)-[:SUPERSEDES]->(older:Decision)
       OPTIONAL MATCH (d)-[:BASED_ON]->(e:Evidence)
       RETURN d, older, e`,
      {
        d: vertexProps<{ natural_id: string; reason: string }>(),
        older: optional(vertexProps<{ natural_id: string }>()),
        e: optional(vertexProps<{ statement: string } & Identified>()),
      },
      { id: gate },
    );

    // Handles are minted once, at the row, and everything downstream carries
    // them. Minting at each use instead put four `ref("decision", …)` calls in
    // this loop for one decision, which is the shape that says a conversion is
    // happening in the wrong place.
    const nodes = new Map<
      DecisionRef,
      {
        reason: Prose;
        older: DecisionRef | null;
        citing: Map<EvidenceRef, CitedFinding>;
      }
    >();
    for (const row of rows) {
      const decision = ref("decision", row.d.natural_id);
      const node = nodes.get(decision) ?? {
        reason: row.d.reason,
        older: null,
        citing: new Map<EvidenceRef, CitedFinding>(),
      };
      if (row.older) node.older = ref("decision", row.older.natural_id);
      // By id: two citations can say the same sentence and be two findings.
      if (row.e) {
        const evidence = ref("evidence", row.e.natural_id);
        node.citing.set(evidence, { evidence, states: row.e.statement });
      }
      nodes.set(decision, node);
    }

    const followedBy = new Map<DecisionRef, DecisionRef>();
    let root: DecisionRef | undefined;
    for (const [decision, node] of nodes) {
      if (node.older === null) root = decision;
      else followedBy.set(node.older, decision);
    }

    const ordered: Array<{
      decision: DecisionRef;
      reason: Prose;
      citing: CitedFinding[];
    }> = [];
    let cursor = root;
    while (cursor) {
      const node = nodes.get(cursor)!;
      ordered.push({
        decision: cursor,
        reason: node.reason,
        citing: [...node.citing.values()].sort((a, b) => a.evidence.localeCompare(b.evidence)),
      });
      cursor = followedBy.get(cursor);
    }

    // Every amendment must appear. A second chain root, or a break partway,
    // would otherwise drop amendments out of the history with no error at all
    // -- and an audit trail that quietly omits an entry is worse than one that
    // refuses to render.
    if (ordered.length !== nodes.size) {
      throw new Error(
        `gate ${gate} has ${nodes.size} amendments but only ${ordered.length} form a chain; its history is not a single line`,
      );
    }
    return ordered;
  }
  /**
   * May this gate be relied on, and on what evidence?
   *
   * Every governing condition is itemised, including the ones nobody has
   * evaluated. That is the point: a failed check must be distinguishable from
   * one never run, and an absent list entry cannot carry that difference.
   */
  async gateStatus(gate: GateRef): Promise<GateStatus> {
    const declared = await this.graph.query(
      `MATCH (g:Gate {natural_id: $id}) RETURN g`,
      { g: vertexProps<{ consequence: string }>() },
      { id: gate },
    );
    const found = declared[0];
    if (!found)
      throw new Error(
        `no gate ${gate}; a gate is declared over a criterion and the work it protects, and 'search' finds its handle by the consequence`,
      );

    // Every governing criterion with the evaluations that pertain to THIS
    // gate. Two scopes are deliberately kept apart:
    //
    //   gate-scoped  (here) -- has this condition been checked FOR this gate?
    //   criterion-scoped    -- has this check ever been shown able to fail?
    //
    // One criterion can govern several gates and be evaluated separately
    // against each (the same hash check, run against staging and against
    // release). Collapsing the two scopes made a gate nobody had evaluated
    // report as blocked because its criterion had failed somewhere else.
    //
    // OPTIONAL MATCH is load-bearing twice over: a criterion nobody evaluated
    // must still appear as a check, and `g` is bound from the first MATCH so
    // only evaluations triggering this gate count.
    // Composed from the gate-scoped verdict fact. The scope is the argument
    // rather than a paragraph: `verdictForGate` counts only evaluations
    // reached FOR this gate, where `anyVerdict` counts every evaluation of the
    // criterion. Collapsing the two made a gate nobody had evaluated report as
    // blocked because its criterion had failed somewhere else.
    const { cypher, decoders } = compose(
      `MATCH (crit:Criterion)-[:GOVERNS]->(g:Gate {natural_id: $id})`,
      checkStatusForGate,
      { crit: vertexProps<{ natural_id: string; proposition: string }>() },
    );
    const rows = (await this.graph.query(cypher, decoders, { id: gate })) as unknown as Row[];
    const checks = [...per(checkStatusForGate, rows).values()];
    // Flattened in the same order the checks were assembled in.
    const evaluations = checks.flatMap((c) => c.evaluations);
    const unmetChecks = checks.filter((c) => c.state !== "passed");
    // The same computation as `whySupported`'s, and not redundant here even
    // though the caller is holding this gate: a criterion may govern several,
    // so an unmet check on GATE_1 can be holding GATE_7 as well, and that is
    // the blast radius a reader of a blocked gate most wants.
    const blocking = await this.blockedBy(unmetChecks.map((c) => c.criterion));
    const unmet = unmetChecks.map((c) => ({
      criterion: c.criterion,
      requires: c.proposition,
      blocks: blocking.get(c.criterion) ?? [],
    }));

    const state = gateStateFrom(checks);

    // Criterion-scoped, deliberately unfiltered by gate: "has this check ever
    // been shown able to fail" is a question about the check itself.
    const criterionOutcomes = await this.graph.query(
      `MATCH (c:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id})
       MATCH (c)-[:EVALUATED_AS]->(ev:CriterionEvaluation)
       RETURN ev`,
      { ev: vertexProps<{ outcome: "pass" | "fail" }>() },
      { id: gate },
    );

    const gating = await this.graph.query(
      `MATCH (:Gate {natural_id: $id})-[:GATES]->(w) RETURN w`,
      { w: vertexProps<{ objective?: string; kind?: string } & Identified>() },
      { id: gate },
    );

    return {
      gate,
      consequence: found.g.consequence,
      state,
      checks,
      unmet,
      evaluations,
      gating: gating.map((g) => ({
        work: ref("work", g.w.natural_id),
        objective: g.w.objective ?? "",
      })),
      everFailed: criterionOutcomes.some((r) => r.ev.outcome === "fail"),
    };
  }

  /**
   * What each of these criteria is holding up.
   *
   * Walks `GOVERNS` **from the criterion**, which nothing did before — it was
   * written by `stateCriterion`/`declareGate` and read only from the gate's
   * end, so a caller holding a criterion had no way back. See
   * {@link UnmetCheck.blocks}.
   *
   * `OPTIONAL MATCH` on the protected work, because a gate that guards nothing
   * yet is a real state and must not drop the gate from the answer.
   */
  private async blockedBy(
    criteria: readonly CriterionRef[],
  ): Promise<Map<CriterionRef, BlockedWork[]>> {
    const out = new Map<CriterionRef, BlockedWork[]>();
    if (criteria.length === 0) return out;
    const rows = await this.graph.query(
      `MATCH (c:Criterion)-[:GOVERNS]->(g:Gate)
       WHERE c.natural_id IN $ids
       OPTIONAL MATCH (g)-[:GATES]->(w)
       RETURN c, g, w`,
      {
        c: vertexProps<Identified>(),
        g: vertexProps<{ consequence?: string } & Identified>(),
        w: optional(vertexProps<{ objective?: string } & Identified>()),
      },
      { ids: [...criteria] },
    );
    for (const row of rows) {
      // `ref()` rather than the raw id: the key is a handle, and
      // `check:no-stringly-typed` is right that a `Map<string, …>` here says
      // nothing about what the string is. It refuses a mismatched prefix too.
      const criterion = ref("criterion", row.c.natural_id);
      const list = out.get(criterion) ?? [];
      const existing = list.find((b) => b.gate === row.g.natural_id);
      const work = row.w
        ? [{ work: ref("work", row.w.natural_id), objective: row.w.objective ?? "" }]
        : [];
      if (existing) existing.gating.push(...work);
      else
        list.push({
          gate: ref("gate", row.g.natural_id),
          consequence: row.g.consequence ?? "",
          gating: work,
        });
      out.set(criterion, list);
    }
    return out;
  }

  /**
   * An interpretation and every narrowing behind it, oldest first.
   *
   * The chain walks claim-to-claim through the decisions that made it: each
   * revision `CHANGES` the reading it withdrew and `MOTIVATES` the one that
   * replaced it. No timestamps, nothing from the event log, and — unlike
   * `designHistory` — no `SUPERSEDES` edge, because with both halves of each
   * step recorded the order is already implied and a supersession edge would
   * be a writer with no reader.
   */
  async interpretationHistory(claim: ClaimRef): Promise<InterpretationHistory> {
    // **Walked by id.** `reinterpret` writes `Decision -MOTIVATES-> narrower`
    // and `Decision -CHANGES-> each withdrawn claim`, both carrying natural
    // ids, so every step is reachable by identity.
    //
    // Matching by NAME instead breaks on two independent chains passing through
    // one sentence: the match finds the other chain's claim and its decision,
    // and a legitimate history throws `is not a single line`. Same text is not
    // same claim.
    const proposition = await this.assertedBy(claim);
    if (proposition === undefined)
      throw new Error(
        `no claim ${claim}; a claim exists once an analysis concludes it, and its handle comes back from that act or from looking up the exact proposition it asserts`,
      );
    const steps: Revision[] = [];
    let current: ConcludedClaim[] = [{ claim, asserts: proposition }];

    // Seeded with the entry claim, which is what catches a self-loop on the
    // first step rather than the second.
    const seen = new Set<ClaimRef>([claim]);

    for (;;) {
      const rows = await this.graph.query(
        // `nxt` bound and matched by id. Lower-case RETURN names throughout: a
        // camelCase one decodes as null. See `buildAsClause`.
        `MATCH (d:Decision)-[:MOTIVATES]->(nxt:Claim)
         WHERE nxt.natural_id IN $ids
         MATCH (d)-[:CHANGES]->(was:Claim)
         RETURN d, was, nxt`,
        {
          d: vertexProps<{ natural_id: string; reason: string }>(),
          was: vertexProps<{ name: string } & Identified>(),
          nxt: vertexProps<{ name: string } & Identified>(),
        },
        { ids: current.map((c) => c.claim) },
      );
      // One decision per step. This is now a real structural statement -- the
      // history is a line rather than a merge -- where the old `replaced.size`
      // guard was about wording and fired on chains that never met.
      const decisions = new Set(rows.map((r) => r.d.natural_id));
      if (decisions.size > 1) {
        throw new Error(
          `interpretation history for "${proposition}" is not a single line at "${current.map((c) => c.asserts).join('", "')}"`,
        );
      }
      const step = rows[0];
      if (!step) break;

      // Every record the decision withdrew, not the one that came back first.
      // One decision withdraws every claim asserting the reading it replaced,
      // so this is plural by construction: two analyses reaching one reading are
      // withdrawn together.
      const withdrew: ConcludedClaim[] = [
        ...new Map(rows.map((r) => [r.was.natural_id, r.was] as const)).values(),
      ].map((was) => ({
        claim: ref("claim", was.natural_id),
        asserts: was.name,
      }));

      for (const w of withdrew) {
        if (seen.has(w.claim))
          throw new Error(
            `interpretation history for "${proposition}" loops at "${w.asserts}"; a narrowing chain must not revisit a claim, so this history cannot be walked`,
          );
        seen.add(w.claim);
      }

      steps.unshift({
        revision: ref("decision", step.d.natural_id),
        previously: withdrew,
        nowClaims: {
          claim: ref("claim", step.nxt.natural_id),
          asserts: step.nxt.name,
        },
        reason: step.d.reason,
        // Scoped to the withdrawn claim's own line of enquiry. The bare
        // proposition would ask "what was decided on the strength of this
        // SENTENCE", which reaches another chain's decisions.
        restingOnTheOldReading: await this.decidedOnTheStrengthOf(
          await this.scopeOf(withdrew[0]!.claim),
        ),
      });
      current = withdrew;
    }

    return {
      originally: steps[0]?.previously ?? [{ claim, asserts: proposition }],
      // The handle the caller asked about, not one re-found by its wording.
      nowClaims: { claim, asserts: proposition },
      revisions: steps,
    };
  }

  /**
   * Whether two findings actually conflict.
   *
   * Answered from what each claim is attached to — the question it answers and
   * the way its evidence bears — never from comparing the two sentences. Two
   * claims can be worded identically and not conflict at all.
   */
  async doTheseConflict(a: ClaimRef, b: ClaimRef): Promise<ConflictVerdict> {
    const sides = [await this.sideOf(a), await this.sideOf(b)];
    const [left, right] = sides;

    // Value equality, which a handle gives: two records wrongly told apart here
    // turn a contradiction into a dissociation, silently and with the compiler's
    // blessing, since both sides have the same type.
    const sameScope = left!.enquiry === right!.enquiry;
    if (!sameScope) {
      // Support for equivalence on one endpoint says nothing about another.
      // Identical wording does not make them one claim.
      return {
        conflict: false,
        relation: "dissociation",
        differsBy: "scope",
        sides: sides.map(({ enquiry: _enquiry, ...side }) => side),
      };
    }

    const opposed =
      (left!.supportedBy.length > 0 && right!.challengedBy.length > 0) ||
      (left!.challengedBy.length > 0 && right!.supportedBy.length > 0);

    return {
      conflict: opposed,
      relation: opposed ? "contradiction" : "corroboration",
      differsBy: null,
      sides: sides.map(({ enquiry: _enquiry, ...side }) => side),
    };
  }
  private async sideOf(conclusion: ClaimRef): Promise<ConflictSide & { enquiry: EnquiryRef }> {
    const resolved = await this.scopeOf(conclusion);
    const enquiry = resolved.enquiry!;

    const asked = await this.graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $id}) RETURN q`,
      { q: vertexProps<{ name: string } & Identified>() },
      { id: enquiry },
    );

    const scope = resolved;
    // Deduped by id. `findingsBearing` already selects natural_id and it was
    // being discarded on the mapping line, so two independent findings phrased
    // alike counted as one corroboration -- and `doTheseConflict` decides from
    // these arrays' lengths.
    const findings = async (bearing: "SUPPORTS" | "CHALLENGES") =>
      dedupeById(
        (await this.findingsBearing(scope, bearing)).map((r) => ({
          evidence: ref("evidence", r.e.natural_id),
          states: r.e.statement,
        })),
        (f) => f.evidence,
      ).sort((a, b) => a.evidence.localeCompare(b.evidence));

    const claim = conclusion;

    return {
      claim,
      question: ref("question", asked[0]?.q.natural_id ?? ""),
      proposition: resolved.proposition,
      asks: asked[0]?.q.name ?? "",
      supportedBy: await findings("SUPPORTS"),
      challengedBy: await findings("CHALLENGES"),
      enquiry,
    };
  }

  /**
   * Claims asserting a proposition — the **one** place wording is resolved.
   *
   * Every verb takes a handle; a person types a sentence. This is the seam
   * between the two, and it is a verb of its own rather than a guess buried in
   * each read: it returns *all* matches and lets the caller refuse, instead of
   * picking one and being wrong when a sentence is asserted in two lines of
   * enquiry.
   */
  async claimsAsserting(proposition: IndexedString): Promise<ConcludedClaim[]> {
    const rows = await this.graph.query(
      `MATCH (c:Claim {name: $name}) RETURN c`,
      { c: vertexProps<{ name: string } & Identified>() },
      { name: proposition },
    );
    return rows.map((r) => ({
      claim: ref("claim", r.c.natural_id),
      asserts: r.c.name,
    }));
  }

  /**
   * Every record containing the text, as `{handle, wording}` pairs grouped by
   * label — how a caller holding only wording finds the handle for it.
   *
   * **Returns every match and refuses to pick, exactly as {@link
   * claimsAsserting} does** — this is a second seam where wording is
   * resolved, not the same one widened, because the two answer different
   * questions: `claimsAsserting` finds a claim by its *exact* asserted
   * sentence (its wording behaves like a key); this finds a *substring*
   * across every kind of record that carries free text. A caller wanting
   * one specific claim by its sentence should still use that verb — it is
   * both narrower and cheaper.
   *
   * **Scans `Prose` only** — `src/db/domain.ts`'s `SEARCHABLE_PROSE`/
   * `SEARCHABLE_PROSE_ARRAYS`, derived from the string taxonomy and held to
   * it by `check:prop-classes`. `IndexedString` properties (`Claim.name`,
   * `Artefact.logical_name`) are exact-match territory — a claim's own
   * wording is already searchable by `claimsAsserting`, and this does not
   * duplicate that with a weaker substring version of it.
   *
   * Case-insensitive (`toLower` both sides — measured against AGE 2026-08-31:
   * plain `CONTAINS` works, `toLower(...) CONTAINS toLower(...)` also
   * works, `ANY(x IN list WHERE ...)` does not — a list property needs
   * `size([x IN list WHERE ...]) > 0` instead, which is why array and
   * scalar properties are two tables and two query shapes here, not one).
   */
  async search(text: Prose): Promise<SearchGroup[]> {
    const groups: SearchGroup[] = [];
    for (const label of NODE_LABELS) {
      const scalarProps = SEARCHABLE_PROSE[label] ?? [];
      const arrayProps = SEARCHABLE_PROSE_ARRAYS[label] ?? [];
      if (scalarProps.length === 0 && arrayProps.length === 0) continue;
      // Every label reachable here is a key of SEARCHABLE_PROSE or
      // SEARCHABLE_PROSE_ARRAYS, and check:prop-classes holds both to the
      // Prose annotations -- so a label with no research-concept kind would
      // be a finding worth its own sentence, not a runtime case to guard.
      const kind = KIND_BY_LABEL[label];
      if (!kind) throw new Error(`${label} is searchable but names no research-concept kind`);
      // `ref()`'s own kind<->label check is what makes the cast below safe:
      // `kind` is looked up FROM `label`, so the two cannot disagree, and
      // `ref` would throw before an actually-mismatched handle ever reached
      // `SearchMatch`. The cast narrows a dynamically-looked-up `string` to
      // the specific union `KIND_BY_LABEL`'s own type can't express without
      // a label-indexed conditional type -- more machinery than the
      // fact ("this group is one label, hence one kind") needs.
      const matches: SearchMatch[] = [];
      for (const prop of scalarProps) {
        const rows = await this.graph.query(
          `MATCH (n:${label}) WHERE toLower(n.${prop}) CONTAINS toLower($needle) RETURN n`,
          { n: vertexProps<Record<string, unknown> & Identified>() },
          { needle: text },
        );
        for (const row of rows) {
          matches.push({
            handle: ref(kind, row.n.natural_id) as SearchMatch["handle"],
            wording: String(row.n[prop]),
          });
        }
      }
      for (const prop of arrayProps) {
        const rows = await this.graph.query(
          `MATCH (n:${label}) WHERE size([x IN n.${prop} WHERE toLower(x) CONTAINS toLower($needle)]) > 0 RETURN n`,
          { n: vertexProps<Record<string, unknown> & Identified>() },
          { needle: text },
        );
        for (const row of rows) {
          const list = row.n[prop] as string[];
          const needle = text.toLowerCase();
          const wording = list.find((x) => x.toLowerCase().includes(needle)) ?? list.join("; ");
          matches.push({ handle: ref(kind, row.n.natural_id) as SearchMatch["handle"], wording });
        }
      }
      if (matches.length > 0) groups.push({ label, matches });
    }
    return groups;
  }

  /** "Why does this conclusion count as supported?" and "what did the superseded inference claim?" */
  async whySupported(claim: ClaimRef): Promise<SupportExplanation> {
    const scope = await this.scopeOf(claim);
    const proposition = scope.proposition;
    // Both bearings, each partitioned by whether its analysis output was
    // later invalidated. A withdrawn challenge is as historical as a
    // withdrawn support -- before this, challenging findings counted as
    // current forever.
    const forRows = await this.findingsBearing(scope, "SUPPORTS");
    const againstRows = await this.findingsBearing(scope, "CHALLENGES");

    // Findings that re-checked another finding rather than establishing the
    // proposition themselves. Keyed by identity, never by wording -- two runs
    // reaching the same conclusion say the same sentence by construction.
    const reverifying = new Set(
      (
        await this.graph.query(`MATCH (e:Evidence)-[:REVERIFIES]->(:Evidence) RETURN e`, {
          e: vertexProps<{ natural_id: string }>(),
        })
      ).map((r) => r.e.natural_id),
    );

    // The review each retraction actually rested on (row O). Absent for an
    // artefact invalidated by anything other than replaceAnalysis(), which is
    // why the reader still falls back rather than assuming the edge is there.
    const retractedBy = new Map(
      (
        await this.graph.query(`MATCH (a:Artefact)-[:INVALIDATED_BY]->(r:Review) RETURN a, r`, {
          a: vertexProps<{ natural_id: string }>(),
          r: vertexProps<{ verdict: string }>(),
        })
      ).map((row) => [row.a.natural_id, row.r.verdict] as const),
    );

    const support: SupportExplanation["support"] = [];
    const reverifiedBy: Reverification[] = [];
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
          method: row.comp.kind,
          analysis: ref("analysis", row.comp.natural_id),
        };
        // **Per claim, not per artefact**: a decision that changed *this*
        // claim, which is the same fact `withdrawalOf` reads. An artefact-grain
        // answer could only say why the whole *analysis* was replaced.
        //
        // Deduped, and one reason per finding rather than one per review of
        // its unit.
        if (row.d) {
          if (!superseded.some((x) => x.evidence === entry.evidence && x.bearing === bearing))
            superseded.push({
              ...entry,
              bearing,
              // **The review that caused THIS retraction first** (row O). The
              // decision's own `reason` is generated text -- useful when a
              // bare `conclude --replacing` superseded a finding with no
              // review behind it, and not an answer to "which review
              // retracted it?" when there is one.
              reason:
                row.caused?.verdict ||
                row.d.reason ||
                (row.a
                  ? (retractedBy.get(row.a.natural_id) ?? "it was superseded")
                  : "it was superseded"),
            });
        } else if (bearing === "supports" && reverifying.has(row.e.natural_id)) {
          // A re-verification is not a second independent finding: counting it
          // as one reports a proposition established once as corroborated
          // twice. See `EDGE_SCHEMA.REVERIFIES`.
          if (!reverifiedBy.some((r) => r.analysis === row.comp.natural_id))
            reverifiedBy.push({
              analysis: ref("analysis", row.comp.natural_id),
              method: row.comp.kind,
            });
        } else {
          live.push(entry);
        }
      }
    }

    // What the still-current analyses actually consumed -- one hop from the
    // computation, not a detour through the enquiry. Only currently-standing
    // findings count: a superseded analysis's inputs are not what the claim
    // rests on now.
    // Both bearings, and by handle: a claim its evidence bears *against* rests
    // on inputs exactly as one it supports does, and a one-sided walk reports
    // `restingOn: []` for it.
    const resting = (
      await Promise.all(
        (["SUPPORTS", "CHALLENGES"] as const).map((bearing) =>
          this.artefactsConsumedBy(scope, bearing),
        ),
      )
    ).flat();

    // The standard the finding was held to, if it was held to one. The criteria
    // a researcher agreed before the run are what "does this stand?" is
    // answered against; without them a finding whose own prespecified checks
    // failed reads as `supported: true`.
    //
    // Same invalidation filter as `restingOn` above: a replaced analysis's
    // checks are as historical as its findings, and applying one filter and not
    // the other makes two fields of one answer disagree.
    //
    // **Boundary: only the SUPPORTING analyses' standards are read.** An
    // analysis recorded with `heldTo` whose findings CHALLENGE the proposition
    // reads as a live challenge even if its own checks failed, so `challenged`
    // is not qualified the way `supported` is. What would settle it is a null
    // result whose robustness checks disagree, which nothing records yet.
    // The same fact the survey and a gate read, so "which checks does this
    // claim answer to" is one definition. Selected by handle: two analyses in
    // one enquiry concluding the same sentence are two claims, and matching by
    // wording makes this verb and `whatIsKnown` contradict each other.
    //
    // Both bearings, merged, and a loop rather than two hand-written anchors
    // because the one-sided version is silent: a promoted negative result
    // reports "held to no prespecified standard" while the record holds the
    // check.
    // Which of the inputs this claim rests on have been retracted outright --
    // every finding they record superseded. One query for all of them.
    const retractedInputs = await this.retractedArtefacts([
      ...new Set(resting.map((r) => ref("observations", r.a.natural_id))),
    ]);

    const byCriterion = new Map<CriterionRef, CheckStatus>();
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const { cypher, decoders } = compose(checksAnchor(bearing), checkStatus, {
        crit: vertexProps<{ natural_id: string; proposition: string }>(),
      });
      const rows = (await this.graph.query(cypher, decoders, { claim })) as unknown as Row[];
      for (const [criterion, check] of per(checkStatus, rows)) {
        byCriterion.set(ref("criterion", criterion), check);
      }
    }
    const standard = [...byCriterion.values()];
    // Never-run counts against, exactly as it does for a gate: a check nobody
    // performed has not been met. `gateStatus()` computes `unmet` the same way
    // and the two must agree, since they are the same checks.
    const unmetChecks = standard.filter((c) => c.state !== "passed");
    // One query for every unmet check rather than one per check: the number of
    // prespecified conditions on a claim is small, but a round trip each is the
    // shape that turns a report into a profiler finding.
    const blocking = await this.blockedBy(unmetChecks.map((c) => c.criterion));
    const unmet = unmetChecks.map((c) => ({
      criterion: c.criterion,
      requires: c.proposition,
      blocks: blocking.get(c.criterion) ?? [],
    }));

    // A withdrawn interpretation is not supported, however much evidence once
    // carried it. `support` stays populated deliberately: the findings are
    // fine, and blanking them would say the numbers had gone wrong when only
    // the reading moved.
    const { withdrawn, replacedBy } = await this.withdrawalOf(scope);

    // Standing, and why it was conferred. Read from the claim rather than the
    // conclusion so a promotion taken later is visible here at all.
    // By handle, and with no traversal at all. A promotion is an edge on the
    // claim, so reaching it through `<-[:SUPPORTS]-` cannot see a promoted
    // negative result, and selecting by name within an enquiry can return a
    // different claim's promotion.
    const promotion = await this.graph.query(
      `MATCH (c:Claim {natural_id: $claim})
       OPTIONAL MATCH (d:Decision)-[:PROMOTES]->(c)
       RETURN c, d`,
      {
        c: vertexProps<{ kind?: string }>(),
        d: optional(vertexProps<{ reason: string }>()),
      },
      { claim },
    );
    const confirmed = promotion.some((r) => r.c.kind === "confirmatory");
    const promotedBecause = promotion.find((r) => r.d)?.d?.reason;

    return {
      // The handle the caller asked with, echoed so the answer names its own
      // subject once it is stored or sent.
      claim,
      proposition,
      // Three ways to not be supported, and they are different states: no
      // evidence at all, the interpretation withdrawn, and evidence that exists
      // and fails the standard set for it. `support`
      // stays populated in the third case for the same reason it does in the
      // second: the numbers are fine, and blanking them would say otherwise.
      supported: support.length > 0 && !withdrawn && unmet.length === 0,
      standing: confirmed ? "confirmatory" : "exploratory",
      ...(confirmed && promotedBecause ? { promotedBecause } : {}),
      support,
      reverifiedBy,
      standard,
      unmet,
      // Re-verifying findings are excluded here for the same reason they are
      // kept out of `support`: the claim does not rest on inputs belonging to
      // something this very report says is not an independent supporting
      // finding. Filtered in TypeScript rather than in the query, because AGE
      // rejects a `NOT (pattern)` predicate outright -- `cypher_yyerror`, not a
      // decode problem.
      // Deduplicated by **identity**, never by name. Two artefacts may share a
      // `logical_name`, since a regeneration carries the name of the part it
      // replaces, so collapsing on the name reports a conclusion resting on one
      // input when it rests on two, with the vanished one indistinguishable
      // from the survivor.
      restingOn: [
        ...new Map(
          resting
            .filter((r) => !reverifying.has(r.e.natural_id))
            .map((r) => [
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
   * How much of a past construction can be rebuilt.
   *
   * The caller re-runs whatever it can and offers the hashes it got back; this
   * says which parts match, which disagree, and which nobody can check because
   * the original never recorded a hash. The one reader of `content_hash`.
   *
   * Offered per part rather than by name, deliberately. A regenerated part
   * carries the name of the part it regenerates, so a name-keyed map would
   * merge exactly the two things this scenario exists to keep apart.
   */
  async reproducibilityOf(
    analysis: AnalysisRef,
    rebuilt: Array<{ part: ObservationsRef; hash: IdentityString }>,
  ): Promise<ReproducibilityReport> {
    const offered = new Map<ObservationsRef, IdentityString>(rebuilt.map((r) => [r.part, r.hash]));

    // An absent subject and an empty one are different states: answering them
    // alike lets this report say `reproducible: true` about nothing. The
    // existence check is separate from the parts query because both return zero
    // rows and only one of them is a caller error.
    const subject = await this.graph.query(
      `MATCH (c:Computation {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ natural_id: string }>() },
      { id: analysis },
    );
    if (subject.length === 0)
      throw new Error(
        `no analysis ${analysis}; an analysis is recorded before it can be read back, and its handle comes back from the act that recorded it`,
      );

    const parts = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})-[:CONSUMES]->(a:Artefact) RETURN a`,
      {
        a: vertexProps<{
          natural_id: string;
          logical_name: string;
          content_hash?: string;
        }>(),
      },
      { id: analysis },
    );

    const exact: IdentifiedArtefact[] = [];
    const differing: IdentifiedArtefact[] = [];
    const unverifiable: IdentifiedArtefact[] = [];
    const notRebuilt: IdentifiedArtefact[] = [];
    for (const { a } of parts) {
      const candidate = offered.get(ref("observations", a.natural_id));
      // Two ways for no comparison to happen, and neither is inequality:
      // the record has no hash (permanent, about the artefact), or this
      // attempt did not rebuild the part (about the attempt). `differing` is a
      // comparison that ran and came out unequal, which is a different kind of
      // statement. Folding either absence into it claims evidence the record
      // does not have.
      //
      // Keyed by natural id, never by name: an original and its regeneration
      // legitimately share a `logical_name`, so bare names put one string in
      // `exact` and `differing` at once.
      const entry = {
        part: ref("observations", a.natural_id),
        name: a.logical_name,
      };
      if (!a.content_hash) unverifiable.push(entry);
      else if (candidate === undefined) notRebuilt.push(entry);
      else if (candidate === a.content_hash) exact.push(entry);
      else differing.push(entry);
    }

    const byName = (a: IdentifiedArtefact, b: IdentifiedArtefact) =>
      a.name.localeCompare(b.name) || a.part.localeCompare(b.part);
    return {
      analysis,
      exact: exact.sort(byName),
      differing: differing.sort(byName),
      unverifiable: unverifiable.sort(byName),
      notRebuilt: notRebuilt.sort(byName),
      // Anything not shown to match leaves the construction unshown.
      //
      // `exact.length > 0` is the conjunct three empty lists cannot supply: an
      // analysis that consumed nothing satisfies "nothing differed, nothing was
      // unverifiable, nothing went unrebuilt" vacuously, and would report that
      // a construction with no parts reproduces. Absence is still absence.
      reproducible:
        exact.length > 0 &&
        differing.length === 0 &&
        unverifiable.length === 0 &&
        notRebuilt.length === 0,
    };
  }

  /**
   * What an analysis revised, and which findings moved — {@link AnalysisRevision}.
   *
   * Three reads, because they are three different questions about one act: the
   * lineage decision (which analysis this revises, on which review), the
   * per-finding decisions (old claim to new), and the superseded analysis's
   * own conclusions (so the ones nothing named can be reported standing).
   */
  async analysisRevision(analysis: AnalysisRef): Promise<AnalysisRevision> {
    const lineage = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:MOTIVATES]-(d:Decision)-[:SUPERSEDES]->(old:Computation)
       OPTIONAL MATCH (d)-[:INVALIDATED_BY]->(rev:Review)
       RETURN old, rev, d`,
      {
        old: vertexProps<{ natural_id: string }>(),
        rev: optional(vertexProps<{ natural_id: string; verdict: string }>()),
        d: vertexProps<{ natural_id: string }>(),
      },
      { id: analysis },
    );
    const revises = lineage[0];
    if (!revises) return { analysis, changed: [], restated: [], kept: [], unpaired: [] };

    // What the successor concluded, and what the revision superseded and kept.
    // Both bearings throughout: a finding that challenges a claim is superseded
    // and carried forward exactly as a supporting one is, and reading one side
    // is silent.
    const now = await this.conclusionsIn(analysis);
    const decision = ref("decision", revises.d.natural_id);
    const fell = await this.claimsFrom(decision, "SUPERSEDES");
    const kept = await this.claimsFrom(decision, "KEEPS");

    // **Paired by proposition, and only where the proposition is unique on both
    // sides.** An analysis may assert the same sentence twice about different
    // endpoints, so a wording match can name two; this is a description rather
    // than an act and cannot refuse, so an ambiguous or absent match is
    // reported unpaired instead of guessed.
    const countBy = (cs: ConcludedClaim[], p: string) => cs.filter((c) => c.asserts === p).length;
    const changed: RevisedFinding[] = [];
    const restated: ConcludedClaim[] = [];
    const unpaired: ConcludedClaim[] = [];
    for (const was of fell) {
      const successor =
        countBy(fell, was.asserts) === 1 && countBy(now, was.asserts) === 1
          ? now.find((c) => c.asserts === was.asserts)
          : undefined;
      if (!successor) {
        unpaired.push({ claim: was.claim, asserts: was.asserts });
        continue;
      }
      const before = await this.findingText(was.claim);
      const after = await this.findingText(successor.claim);
      if (before === after) restated.push({ claim: successor.claim, asserts: successor.asserts });
      else
        changed.push({
          proposition: was.asserts,
          was: was.claim,
          before,
          claim: successor.claim,
          after,
        });
    }

    const byClaim = (a: { claim: string }, b: { claim: string }) => a.claim.localeCompare(b.claim);
    return {
      analysis,
      supersedes: ref("analysis", revises.old.natural_id),
      ...(revises.rev
        ? {
            because: {
              review: ref("review", revises.rev.natural_id),
              verdict: revises.rev.verdict,
            },
          }
        : {}),
      changed: changed.sort((a, b) => a.was.localeCompare(b.was)),
      restated: restated.sort(byClaim),
      kept: kept.sort(byClaim),
      unpaired: unpaired.sort(byClaim),
    };
  }

  /** The claims an analysis concluded, both bearings. */
  private async conclusionsIn(analysis: AnalysisRef): Promise<ConcludedClaim[]> {
    const out: ConcludedClaim[] = [];
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:PRODUCES]->(e:Evidence)
         MATCH (e)-[:${bearing}]->(c:Claim)
         RETURN c`,
        { c: vertexProps<{ natural_id: string; name: string }>() },
        { id: analysis },
      );
      for (const row of rows)
        if (!out.some((o) => o.claim === row.c.natural_id))
          out.push({ claim: ref("claim", row.c.natural_id), asserts: row.c.name });
    }
    return out;
  }

  /** The claims one decision points at over one edge. */
  private async claimsFrom(
    decision: Ref<"decision">,
    edge: "SUPERSEDES" | "KEEPS",
  ): Promise<ConcludedClaim[]> {
    const rows = await this.graph.query(
      `MATCH (:Decision {natural_id: $id})-[:${edge}]->(c:Claim)
       RETURN c`,
      { c: vertexProps<{ natural_id: string; name: string }>() },
      { id: decision },
    );
    return rows.map((r) => ({ claim: ref("claim", r.c.natural_id), asserts: r.c.name }));
  }

  /** The wording of the finding bearing on a claim. */
  private async findingText(claim: ClaimRef): Promise<Prose> {
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (e:Evidence)-[:${bearing}]->(:Claim {natural_id: $id})
         RETURN e`,
        { e: vertexProps<{ statement: string }>() },
        { id: claim },
      );
      if (rows[0]) return rows[0].e.statement;
    }
    return "";
  }

  /**
   * What is affected if this artefact turns out to be wrong?
   *
   * Deliberately the affected side only. What is *not* affected depends on what
   * a replacement rests on rather than on the invalidated record alone.
   *
   * Distinct from `whySupported()`'s `restingOn`: this asks which enquiries
   * REQUIRE the evidence held here, not what any computation read.
   *
   * **Two routes in.** An artefact reached by `Evidence -RECORDED_IN->` is an
   * analysis *output*, and the evidence recorded in it bears on claims
   * directly. An artefact a computation `CONSUMES` is an *input*, and nothing
   * recorded in it
   * bears on anything; what rests on it are the claims of every analysis that
   * read it. Walking only the first returned `claims: []` for an input a claim
   * demonstrably rested on, while still naming the enquiry — a confident,
   * populated, wrong answer, and the same verb answering one question two
   * incompatible ways depending on which end of a computation it was aimed at.
   * `Evidence` carries both senses, and a query that walks one of them answers
   * about half the record.
   *
   * `subject` is a name while a name identifies one artefact, and an explicit
   * reference when it does not: a regenerated part carries the name of the part
   * it regenerates. Given an ambiguous name this **refuses** rather than answering
   * about the union, because the union is exactly the "inferred provenance
   * silently inheriting the original's standing" the scenario exists to prevent.
   */
  async whatDependsOn(subject: IndexedString | ObservationsRef): Promise<DependencyReport> {
    // **`typeof` cannot tell these apart any more, and that is the trap.** A
    // handle is a branded string now, so `typeof subject === "string"` is true
    // for both arms of the union and sent every handle off to be looked up by
    // logical name -- which threw `no artefact named "ART_21"`. The union is
    // real to the type system and invisible at runtime, so the discrimination
    // has to read the value: `isRefOfKind` asks whether the id's own prefix
    // names an Artefact, which is the same question `ref()` asks when minting.
    const start = isRefOfKind("observations", subject)
      ? (subject as ObservationsRef)
      : await this.artefactNamed(subject);

    // Walk the pipeline downstream before asking what rests on it. An analysis
    // can read another analysis's output (row AE), so invalidating a raw input
    // reaches every stage built on top of it -- and asking only about the
    // artefact handed in stops at the first stage.
    //
    // Iterative rather than a variable-length pattern: the chain alternates
    // CONSUMES and PRODUCES, and AGE has no edge-type alternation at all.
    // Visited-set rather than a depth cap, so a
    // cycle terminates without silently truncating a legitimate long pipeline.
    const reached = new Set<ObservationsRef>([start]);
    for (let frontier = [start]; frontier.length > 0; ) {
      const next: ObservationsRef[] = [];
      for (const id of frontier) {
        const downstream = await this.graph.query(
          `MATCH (:Artefact {natural_id: $id})<-[:CONSUMES]-(:Computation)-[:PRODUCES]->(out:Artefact)
           RETURN out`,
          { out: vertexProps<{ natural_id: string }>() },
          { id },
        );
        for (const row of downstream) {
          if (reached.has(ref("observations", row.out.natural_id))) continue;
          reached.add(ref("observations", row.out.natural_id));
          next.push(ref("observations", row.out.natural_id));
        }
      }
      frontier = next;
    }

    // Deduplicated **by id**, not by wording. Two claims asserting the same
    // sentence in different lines of enquiry are two claims, and a `Set<string>`
    // of names merges them silently.
    const claims = new Map<ClaimRef, AffectedClaim>();
    const enquiries = new Map<EnquiryRef, AffectedEnquiry>();
    for (const artefact of reached) {
      const { claims: c, enquiries: e } = await this.restingOnArtefact(
        ref("observations", artefact),
      );
      for (const found of c) claims.set(found.claim, found);
      for (const found of e) enquiries.set(found.enquiry, found);
    }

    return {
      // Which record the answer is about -- and when a name was passed, which
      // record that name resolved to.
      subject: ref("observations", start),
      claims: [...claims.values()],
      enquiries: [...enquiries.values()],
      routesWalked: [
        "evidence recorded in this artefact, and the claims it bears on",
        "computations that consumed this artefact, and the claims their findings bear on",
        "the same, for every artefact downstream of this one through CONSUMES/PRODUCES",
      ],
      complete: false,
    };
  }

  /**
   * The artefacts a claim's still-current analyses consumed, for one bearing.
   *
   * The inverse of {@link restingOnArtefact}, which walks artefact → claims.
   * Named apart deliberately: `restingArtefacts` beside `restingOnArtefact` was
   * two names one letter apart for opposite traversals.
   *
   * One hop from the computation, not a detour through the enquiry. Only
   * currently-standing findings count: a superseded analysis's inputs are not
   * what the claim rests on now — and the `invalidated` filter is on the
   * evidence's **own** output, never on what the computation read, because a
   * retracted input must still be reported and marked.
   *
   * Called once per bearing: a single-bearing version reports an empty list for
   * a claim its evidence bears *against*, the same silent hole `checksAnchor`
   * exists to close.
   *
   * **Selected by proposition within the enquiry, not by handle** — the same
   * exception `findingsBearing` documents, and refuted the same way: selecting
   * by handle emptied `restingOn` for a two-stage pipeline in
   * `tests/subject-identity.test.ts`. What a claim rests on aggregates over the
   * proposition; what it was *held to* belongs to one analysis.
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
       OPTIONAL MATCH (narrowed:Decision)-[:CHANGES]->(c)
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
   *
   * **Every, not any.** An artefact holds one finding per conclusion its
   * analysis drew; replacing one leaves the rest standing, and so leaves the
   * artefact a live record a reader may still rest on. Only when nothing in it
   * stands has the record itself been retracted.
   *
   * An artefact holding no findings at all is **not** retracted: there is
   * nothing in it to have fallen.
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
       OPTIONAL MATCH (narrowed:Decision)-[:CHANGES]->(c)
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

  /** The claims and enquiries resting on one artefact, by the two direct routes. */
  private async restingOnArtefact(
    artefact: ObservationsRef,
  ): Promise<{ claims: AffectedClaim[]; enquiries: AffectedEnquiry[] }> {
    const rows = await this.graph.query(
      `MATCH (a:Artefact {natural_id: $id})
       OPTIONAL MATCH (a)<-[:RECORDED_IN]-(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(claim:Claim)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(challenged:Claim)
       OPTIONAL MATCH (loe:LineOfEnquiry)-[:REQUIRES]->(e)
       RETURN claim, challenged, loe`,
      {
        claim: optional(vertexProps<ClaimProps & Identified>()),
        challenged: optional(vertexProps<ClaimProps & Identified>()),
        loe: optional(vertexProps<{ name: string } & Identified>()),
      },
      { id: artefact },
    );

    // The input side. Separate query rather than more OPTIONAL MATCHes on the
    // same one, because the two routes share no bound variable and combining
    // them multiplies rows for no gain.
    const consumers = await this.graph.query(
      `MATCH (:Artefact {natural_id: $id})<-[:CONSUMES]-(:Computation)<-[:USES]-(u:EvidenceUnit)
       MATCH (u)-[:PRODUCES]->(e:Evidence)
       OPTIONAL MATCH (e)-[:SUPPORTS]->(claim:Claim)
       OPTIONAL MATCH (e)-[:CHALLENGES]->(challenged:Claim)
       OPTIONAL MATCH (u)-[:ADDRESSES]->(loe:LineOfEnquiry)
       RETURN claim, challenged, loe`,
      {
        claim: optional(vertexProps<ClaimProps & Identified>()),
        challenged: optional(vertexProps<ClaimProps & Identified>()),
        loe: optional(vertexProps<{ name: string } & Identified>()),
      },
      { id: artefact },
    );

    const all = [...rows, ...consumers];
    return {
      // A claim whose refutation rested on this record is affected by
      // invalidating it, exactly as a supported one is.
      claims: all.flatMap((r) =>
        [r.claim, r.challenged]
          .filter((c): c is ClaimProps & Identified => !!c)
          .map((c) => ({ claim: ref("claim", c.natural_id), asserts: c.name })),
      ),
      enquiries: all.flatMap((r) =>
        r.loe
          ? [
              {
                enquiry: ref("enquiry", r.loe.natural_id),
                pursuing: r.loe.name,
              },
            ]
          : [],
      ),
    };
  }

  /**
   * Resolves an artefact name to one artefact, or refuses.
   *
   * Two artefacts can carry one name — a regenerated part carries the name of
   * the part it regenerates — and answering about both merges a historical
   * record with an inferred one. Declining beats guessing, exactly as it does
   * for a claim asserted in two lines of enquiry.
   */
  private async artefactNamed(name: IndexedString): Promise<ObservationsRef> {
    const rows = await this.graph.query(
      `MATCH (a:Artefact {logical_name: $name}) RETURN a`,
      { a: vertexProps<{ natural_id: string }>() },
      { name },
    );
    if (rows.length === 0)
      throw new Error(
        `no artefact named "${name}"; observations are named when they are recorded, and the handle comes back from that act`,
      );
    if (rows.length > 1) {
      throw new Error(
        `${rows.length} artefacts are named "${name}"; name which, by the record that produced it`,
      );
    }
    return ref("observations", rows[0]!.a.natural_id);
  }

  /**
   * Every gate, with the state a reader is filtering on.
   *
   * **The verb that lets an agent start.** Every other gate verb takes a
   * `GateRef`, and until this existed the only way to obtain one was to already
   * hold a claim and ask `whySupported` — so an agent opening a cold record
   * could not answer *"what is blocked?"* at all, and the only thing that could
   * was `whatHappened`, which is the event log and the one place this repo
   * forbids answering a "what is true now" question from (#55, #66).
   *
   * **One query, then folded per gate.** `compose()` takes the anchor, so the
   * gate-scoped check fact `gateStatus` uses composes just as well over every
   * gate as over one. What does not carry is the **grain**: `checkStatusForGate`
   * is grained `byCriterion`, and a criterion may govern several gates — the
   * same hash check against staging and against release — so folding the whole
   * result by criterion would merge two gates' verdicts into one answer.
   *
   * So the rows are bucketed by gate first and `per()` is applied within each
   * bucket. The alternative — a composite grain — would have to change
   * `checkStatusForGate` itself, and grains are compared by reference, so it
   * would silently re-scope `gateStatus` too.
   *
   * The state comes from {@link gateStateFrom}, the same function `gateStatus`
   * calls. Not a matter of tidiness: a reader who lists blocked gates and then
   * opens one must not find it satisfied, and two copies of a four-branch
   * precedence chain is the defect shape this repo has now hit six times.
   */
  async gateList(state?: GateStatus["state"]): Promise<ListedGate[]> {
    const { cypher, decoders } = compose(
      `MATCH (crit:Criterion)-[:GOVERNS]->(g:Gate)`,
      checkStatusForGate,
      {
        crit: vertexProps<{ natural_id: string; proposition: string }>(),
        g: vertexProps<{ natural_id: string; consequence: string }>(),
      },
    );
    const rows = (await this.graph.query(cypher, decoders, {})) as unknown as Row[];

    // Bucketed on the gate the row was reached through, never on the criterion.
    const byGate = new Map<string, { consequence: string; rows: Row[] }>();
    for (const row of rows) {
      const gate = row.g as { natural_id: string; consequence: string } | undefined;
      if (!gate?.natural_id) continue;
      const bucket = byGate.get(gate.natural_id) ?? {
        consequence: gate.consequence,
        rows: [],
      };
      bucket.rows.push(row);
      byGate.set(gate.natural_id, bucket);
    }

    // **Sorted by handle, because Cypher imposes no ordering.** Without it the
    // rows come back in whatever order the query produced them, so two runs of
    // `labkit gates` can print the same record differently and an agent
    // diffing successive `gate_list` calls sees change where nothing changed.
    // `checkStatusOver` already makes this argument about evaluations; the
    // same one applies to the list itself.
    const listed = [...byGate.entries()]
      .map(([id, { consequence, rows: forGate }]) => ({
        gate: ref("gate", id),
        consequence,
        state: gateStateFrom([...per(checkStatusForGate, forGate).values()]),
      }))
      .sort((a, b) => a.gate.localeCompare(b.gate));

    // Filtering here rather than in Cypher, because the state is computed and
    // there is nothing in the graph to filter on -- which is the same reason
    // there is no `Gate.status` column to maintain.
    return state ? listed.filter((g) => g.state === state) : listed;
  }

  /**
   * Every planned piece of work, with the state a reader is filtering on.
   *
   * The other half of what an agent needs to orient, and **not redundant with
   * {@link gateList}**: a gate reaches only the work it protects, and
   * `planWork` requires no gate. Work that is planned and ungated — the
   * commonest thing in a standup — is reachable from nowhere else.
   *
   * **Three states, derived rather than chosen.** `Gate -[:GATES]-> Task` and
   * `Task -[:IMPLEMENTS]-> EvidenceUnit` are everything the record holds about
   * a task, so they are everything a state can be computed from. `observed` and
   * `closed` were candidates and neither survived — see {@link WorkState},
   * which carries the argument and the two that died.
   *
   * **Nothing is stored.** There is no `is_open` flag to set, because a stored
   * flag is the first place a work queue rots.
   *
   * **`OPTIONAL MATCH` twice, and both are load-bearing.** A task with no gate
   * and no analysis is the *most* interesting row here — it is the ready work —
   * so a plain `MATCH` on either edge would silently drop precisely what a
   * standup is asking for.
   */
  async workList(state?: WorkState): Promise<ListedWork[]> {
    const rows = await this.graph.query(
      `MATCH (t:Task)
       OPTIONAL MATCH (g:Gate)-[:GATES]->(t)
       OPTIONAL MATCH (t)-[:IMPLEMENTS]->(u:EvidenceUnit)
       RETURN t, g, u`,
      {
        t: vertexProps<{ natural_id: string; objective: string }>(),
        // Both wrapped, because both MATCHes are OPTIONAL and the row that
        // matters most -- ungated, unimplemented, ready to start -- is exactly
        // the one where both are NULL.
        g: optional(vertexProps<{ natural_id: string }>()),
        u: optional(vertexProps<{ natural_id: string }>()),
      },
      {},
    );

    // One row per (task, gate, unit) combination, so a task with two gates
    // arrives twice. Collected before anything is decided.
    const tasks = new Map<
      string,
      { objective: string; gates: Set<string>; implemented: boolean }
    >();
    for (const row of rows) {
      const id = row.t.natural_id;
      const entry = tasks.get(id) ?? {
        objective: row.t.objective ?? "",
        gates: new Set<string>(),
        implemented: false,
      };
      if (row.g?.natural_id) entry.gates.add(row.g.natural_id);
      if (row.u?.natural_id) entry.implemented = true;
      tasks.set(id, entry);
    }

    // A gate's state is the gate's own answer, asked once for all of them
    // rather than per task: several tasks commonly share one gate.
    const gateStates = new Map((await this.gateList()).map((g) => [g.gate as string, g.state]));

    // Sorted by handle, for the reason given in `gateList`.
    const listed = [...tasks.entries()]
      .map(([id, t]) => ({
        work: ref("work", id),
        objective: t.objective,
        state: workStateFrom(t, gateStates),
        gates: [...t.gates].map((g) => ref("gate", g)),
      }))
      .sort((a, b) => a.work.localeCompare(b.work));

    return state ? listed.filter((w) => w.state === state) : listed;
  }

  /**
   * "What am I blocked on right now, what are my priorities?" — see
   * `Standing`'s own doc comment for the shape and why there is no `at=`.
   *
   * With no `since`, the full standing. With one, every section narrowed to
   * what a touched handle appears in since that cursor — `whatHappened`'s
   * `created`/`edges`/`subject` on every act since it, never a snapshot of
   * what things *were*.
   *
   * **A task is moved if its own id was touched, or any gate governing it
   * was.** `evaluateCriterion` touches the criterion, the evaluation and the
   * gate (`TRIGGERS`) — never the task a gate protects — so a task newly
   * blocked (or newly unblocked) by an evaluation would otherwise be
   * invisible. `ListedWork.gates` is what `workStateFrom` already reads to
   * compute `state`; checking those ids against the same touched set is one
   * more membership test, not a new query.
   *
   * **A question is moved if its own id was touched, or the claim answering
   * it was.** `closeEnquiry`/`acceptAsUnresolved` both write an edge landing
   * on the question itself (`RESOLVES`/`DEFERS`), so those show up from the
   * question id alone — but `promote`/`reinterpret`/`reverify` touch only the
   * claim, never the question they move into `established` or out of
   * `provisional`. `AnsweredQuestion.claim` is `whatIsKnown()`'s own
   * resolution of the same fact, so the check is a membership test too.
   *
   * **What is still not caught, after both joins**: a question moving
   * `unresolved` ↔ `untested` has no claim to check and no edge landing on
   * the question either — `unresolved`/`untested`/`accepted` can only be
   * marked moved by their own id. Not fixed with more traversal; named so
   * the gap is a documented one rather than a discovered one.
   */
  async now(since?: number): Promise<Standing> {
    const [events, gates, work, known] = await Promise.all([
      this.whatHappened(since === undefined ? {} : { since }),
      this.gateList(),
      this.workList(),
      this.whatIsKnown(),
    ]);
    const last = events.at(-1);
    const seq = last?.seq ?? since ?? 0;

    if (since === undefined) {
      return {
        blocked: {
          gates: gates.filter((g) => g.state === "blocked"),
          work: work.filter((w) => w.state === "blocked"),
        },
        unevaluated: gates.filter((g) => g.state === "never-evaluated" || g.state === "incomplete"),
        untouched: work.filter((w) => w.state === "planned"),
        known,
        seq,
      };
    }

    const touched = touchedHandles(events);
    const movedWork = (w: ListedWork) => touched.has(w.work) || w.gates.some((g) => touched.has(g));
    const movedById = (h: { question: string }) => touched.has(h.question);
    const movedByIdOrClaim = (h: { question: string; claim: string }) =>
      touched.has(h.question) || touched.has(h.claim);

    return {
      blocked: {
        gates: gates.filter((g) => g.state === "blocked" && touched.has(g.gate)),
        work: work.filter((w) => w.state === "blocked" && movedWork(w)),
      },
      unevaluated: gates.filter(
        (g) => (g.state === "never-evaluated" || g.state === "incomplete") && touched.has(g.gate),
      ),
      untouched: work.filter((w) => w.state === "planned" && movedWork(w)),
      known: {
        established: known.established.filter(movedByIdOrClaim),
        provisional: known.provisional.filter(movedByIdOrClaim),
        unresolved: known.unresolved.filter(movedById),
        untested: known.untested.filter(movedById),
        accepted: known.accepted.filter(movedById),
      },
      seq,
      since,
    };
  }

  /**
   * `why <handle>` — dispatches on the handle's own kind, over the report that
   * already exists for it, and renders it as `{subject, is, because}`. Also
   * takes a proposition: text resolves through `claimsAsserting` and refuses an
   * ambiguous match rather than picking.
   *
   * **The dispatch table lives at module scope, not as a switch here.** `Kind`
   * is closed (see `LABEL_BY_KIND`), so `EXPLAINERS satisfies Record<Kind, …>`
   * makes a kind nobody explains a compile error rather than a runtime branch.
   */
  async why(subject: AnyRef | IndexedString): Promise<Explanation> {
    const kind = kindOf(subject);
    if (kind) return EXPLAINERS[kind](this, subject);

    const found = await this.claimsAsserting(subject);
    if (found.length === 0) throw new Error(`nothing on the record claims "${subject}"`);
    if (found.length > 1)
      throw new Error(
        `"${subject}" is claimed ${found.length} times; name one: ${found
          .map((c) => c.claim)
          .join(", ")}`,
      );
    return EXPLAINERS.claim(this, found[0]!.claim);
  }
}

/**
 * Every handle a batch of events created or touched — `now({since})`'s only
 * new machinery, and it reads three fields `DomainEvent` already carries
 * (`subject`, `created`, `edges`), adding no query of its own.
 */
function touchedHandles(events: readonly DomainEvent[]): Set<string> {
  const touched = new Set<string>();
  for (const e of events) {
    touched.add(e.subject);
    for (const id of e.created) touched.add(id);
    for (const edge of e.edges) {
      touched.add(edge.from);
      touched.add(edge.to);
    }
  }
  return touched;
}

/**
 * One record's `why`, over the report that already exists for its kind — the
 * table `ReadSurface.why` dispatches through.
 *
 * **Module-level functions, not private methods.** `check:no-stringly-typed`
 * scans class members only (its own doc comment says so), so a class method
 * taking `subject: string` before it is known which kind's `Ref` that string
 * names would need an allowlist entry there; a free function does not. It also
 * keeps the table itself a plain value — `satisfies Record<Kind, Explainer>`
 * checks totality once, here, rather than at every call site.
 */
type Explainer = (self: ReadSurface, subject: string) => Promise<Explanation>;

/** The `Claim` case: `whySupported`, plus the derived `{is, because}` envelope. */
async function explainClaim(self: ReadSurface, subject: string): Promise<ClaimExplanation> {
  const report = await self.whySupported(ref("claim", subject));
  // Exhaustive over the same three-way split `renderWhy` prints, in the same
  // priority order: supported first, since `supported` and
  // `withdrawn`/`challenged` are not mutually exclusive fields on the type.
  const state: "supported" | "withdrawn" | "challenged" | "unsupported" = report.supported
    ? "supported"
    : report.withdrawn
      ? "withdrawn"
      : report.challenged
        ? "challenged"
        : "unsupported";
  let is: string;
  let because: Cause[];
  switch (state) {
    case "supported":
      is = "supported";
      because = report.support.map((s) => ({ handle: s.evidence, wording: s.finding }));
      break;
    case "withdrawn":
      is = "withdrawn";
      because = report.replacedBy
        ? [{ handle: report.replacedBy.claim, wording: report.replacedBy.asserts }]
        : [];
      break;
    case "challenged":
      is = "challenged";
      because = report.against.map((a) => ({ handle: a.evidence, wording: a.finding }));
      break;
    case "unsupported":
      is = "unsupported — nothing has examined it";
      because = [];
      break;
    default: {
      const check: never = state;
      throw new Error(`unreached claim state: ${check}`);
    }
  }
  return { kind: "claim", subject: report.claim, is, because, report };
}

/** The `Work` case: `contractFor`'s `addressing`, with an honest sentence when there is none (#98). */
async function explainWork(self: ReadSurface, subject: string): Promise<WorkExplanation> {
  const work = ref("work", subject);
  const report = await self.contractFor(work);
  if (!report.addressing) {
    return {
      kind: "work",
      subject: work,
      is: "planned with no question named -- plan --enquiry records one",
      because: [],
      report,
    };
  }
  const a = report.addressing;
  return {
    kind: "work",
    subject: work,
    is: "planned to advance",
    because: [
      { handle: a.enquiry, wording: a.pursuing },
      { handle: a.question, wording: a.asks },
    ],
    report,
  };
}

/** The `LineOfEnquiry` case: `enquiryInContext` -- what `--in-context` computed, before the redesign folded it in here. */
async function explainEnquiry(self: ReadSurface, subject: string): Promise<EnquiryExplanation> {
  const enquiry = ref("enquiry", subject);
  const report = await self.enquiryInContext(enquiry);
  const q = report.enquiry.question;
  // Exhaustive over `QuestionClosure.closure`'s four values (three literals
  // plus `null`), the same union `renderEnquiry` branches on.
  let is: string;
  if (!q) {
    is = "pursuing nothing on the record";
  } else {
    switch (q.closure) {
      case "answered":
        is = `closed — answered${q.answer ? ` ${q.answer}` : ""}`;
        break;
      case "abandoned":
        is = "closed — abandoned";
        break;
      case "accepted-as-unresolved":
        is = "open — accepted as unresolved, deliberately";
        break;
      case null:
        is = "open";
        break;
      default: {
        const check: never = q.closure;
        throw new Error(`unreached enquiry closure: ${check}`);
      }
    }
  }
  const because: Cause[] = report.standing
    ? [
        {
          handle: report.standing.question,
          wording: `${report.standing.asks} — currently ${report.standing.bucket}`,
        },
      ]
    : [];
  return { kind: "enquiry", subject: enquiry, is, because, report };
}

/**
 * One governing condition's cause, worded by its own state — the same
 * `CheckStatus.state` four-way split `renderGate` colours, turned into prose
 * instead: `blocked` and `incomplete` both cite whichever of these are not
 * `passed`, so the wording (not just `when`) is what tells a failed check
 * apart from one nobody has run.
 */
function causeForCheck(c: CheckStatus): Cause {
  switch (c.state) {
    case "passed":
      return { handle: c.criterion, wording: `${c.proposition} — passed`, when: c.decidedBy?.at };
    case "failed":
      return { handle: c.criterion, wording: `${c.proposition} — failed`, when: c.decidedBy?.at };
    case "never-run":
      return { handle: c.criterion, wording: `${c.proposition} — has never been run` };
    case "no-standing-verdict":
      // Evaluated, and every evaluation has since been withdrawn -- not the
      // same fact as never-run, and `renderGate` keeps the two apart under this
      // exact name.
      return { handle: c.criterion, wording: `${c.proposition} — no standing verdict` };
    default: {
      const check: never = c.state;
      throw new Error(`unreached check state: ${check}`);
    }
  }
}

/**
 * The `Computation` case: what this analysis revised, and which findings moved.
 *
 * An analysis that revises nothing answers so. That is the ordinary case — most
 * analyses are a first run — and reporting it as "revises nothing" is an
 * answer, where a refusal would say the question does not apply.
 */
async function explainAnalysis(self: ReadSurface, subject: string): Promise<AnalysisExplanation> {
  const analysis = ref("analysis", subject);
  const report = await self.analysisRevision(analysis);
  if (report.supersedes === undefined)
    return { kind: "analysis", subject: analysis, is: "a first run", because: [], report };

  const because: Cause[] = [];
  if (report.because)
    because.push({ handle: report.because.review, wording: report.because.verdict });
  for (const c of report.changed)
    because.push({ handle: c.was, wording: `${c.proposition}: ${c.before} → ${c.after}` });
  for (const s of report.kept)
    because.push({ handle: s.claim, wording: `${s.asserts} — kept, on its original evidence` });
  for (const u of report.unpaired)
    because.push({ handle: u.claim, wording: `${u.asserts} — superseded, no successor named` });

  // **Every finding that fell, not just the reworded ones.** Counting only
  // `changed` loses the restated and the unpaired, so a revision that moved one
  // of two could report "0 of 1" while `because` listed both.
  const fell = report.changed.length + report.restated.length + report.unpaired.length;
  const stood = report.kept.length;
  return {
    kind: "analysis",
    subject: analysis,
    is:
      stood === 0
        ? `a revision of ${report.supersedes}`
        : `a partial revision of ${report.supersedes}, ${fell} of ${fell + stood} findings`,
    because,
    report,
  };
}

/**
 * The `Gate` case: `gateStatus`, exhaustive over `GateStatus.state` — the same
 * four-way split `gateStateFrom` computes, worded rather than coloured.
 * `blocked` and `incomplete` both cite every condition not currently passing,
 * since a blocked gate can carry a never-run condition beside its failed one;
 * `satisfied` and `never-evaluated` cite every condition, all of them sharing
 * one state there.
 */
async function explainGate(self: ReadSurface, subject: string): Promise<GateExplanation> {
  const gate = ref("gate", subject);
  const report = await self.gateStatus(gate);
  let is: string;
  let because: Cause[];
  switch (report.state) {
    case "blocked":
      is = "blocked";
      because = report.checks.filter((c) => c.state !== "passed").map(causeForCheck);
      break;
    case "incomplete":
      is = "incomplete";
      because = report.checks.filter((c) => c.state !== "passed").map(causeForCheck);
      break;
    case "satisfied":
      is = "satisfied";
      because = report.checks.map(causeForCheck);
      break;
    case "never-evaluated":
      is = "never evaluated";
      because = report.checks.map(causeForCheck);
      break;
    default: {
      const check: never = report.state;
      throw new Error(`unreached gate state: ${check}`);
    }
  }
  return { kind: "gate", subject: gate, is, because, report };
}

/**
 * The kinds `why` actually explains, and their cases.
 *
 * Every other kind gets a refusal built from **this** object, below, so a kind
 * added here is one the refusal stops claiming for itself. Naming the explained
 * kinds twice — once in a hand-written list, once in the table — is drift in
 * the direction that fails silently.
 */
const EXPLAINED = {
  claim: explainClaim,
  work: explainWork,
  enquiry: explainEnquiry,
  gate: explainGate,
  analysis: explainAnalysis,
} satisfies Partial<Record<Kind, Explainer>>;

const EXPLAINED_KINDS = Object.keys(EXPLAINED) as Kind[];

/** Every kind `EXPLAINED` does not already have a case for. */
type UnexplainedKind = Exclude<Kind, keyof typeof EXPLAINED>;

/**
 * The refusal every kind outside {@link EXPLAINED} gets — two parts, per the
 * discipline this file states above `ReadSurface`: **what was asked** (the
 * kind) and **what `why` explains instead**. There is deliberately no third
 * part naming where else to look: the domain does not know which surface is
 * calling, so it cannot name a command (that comment's own rule) — and a
 * blanket "this record has no other verb for it yet either" is false for most
 * of these: `gate`/`criteria`/`design` all read a gate, `origin`/`pursuits` a
 * question, `reproducibility` an analysis. Naming a false absence is what the
 * refusal discipline above exists to prevent, so this says only what is true.
 */
function refuseToExplain(kind: UnexplainedKind): Explainer {
  return async () => {
    throw new Error(
      `why does not yet explain a ${kind}; it explains ${EXPLAINED_KINDS.join(", ")}`,
    );
  };
}

/**
 * One refusal per {@link UnexplainedKind} — still a literal object, so
 * `satisfies` checks it totally over exactly the kinds `EXPLAINED` has not
 * claimed. That cuts both ways: moving a kind into `EXPLAINED` drops it from
 * `UnexplainedKind`, and this object's entry for it becomes an *excess*
 * property `satisfies` refuses — the compiler forces its removal rather than
 * leaving a dead refusal nobody's dispatch can reach.
 */
const REFUSED = {
  question: refuseToExplain("question"),
  unit: refuseToExplain("unit"),
  evidence: refuseToExplain("evidence"),
  decision: refuseToExplain("decision"),
  criterion: refuseToExplain("criterion"),
  evaluation: refuseToExplain("evaluation"),
  review: refuseToExplain("review"),
  observations: refuseToExplain("observations"),
} satisfies Record<UnexplainedKind, Explainer>;

/**
 * The total table `why` dispatches through — one entry per {@link Kind}, so
 * a kind added to `LABEL_BY_KIND` without a matching entry in `EXPLAINED` or
 * `REFUSED` is a `tsc` failure, not a runtime "unknown kind".
 */
const EXPLAINERS = { ...EXPLAINED, ...REFUSED } satisfies Record<Kind, Explainer>;

/**
 * A gate's state, from the checks governing it.
 *
 * **Extracted because a second reader arrived.** It was inline in
 * `gateStatus` until `gateList` needed the same answer for every gate at once,
 * and that is the condition this repository already applies to a fact: a
 * computation earns a name when more than one reader has to reach the same
 * answer about the same subject. Two copies of a four-branch precedence chain
 * is the six-occurrence defect shape — written once, forgotten the second time,
 * and silently disagreeing thereafter.
 *
 * Order matters and neither branch is cosmetic. Absence is checked before
 * satisfaction so a gate nobody evaluated can never fall through to
 * `satisfied`; failure is checked before incompleteness because a failure is
 * decisive.
 *
 * **`satisfied` requires positive proof — every check passed — rather than
 * being the branch left over once the others are ruled out.** As an `else` it
 * catches any state the branches above do not name: a criterion whose only
 * evaluations were retracted matches neither `failed` nor `never-run` and
 * would fall through to `satisfied`, disagreeing with the itemised per-check
 * report in the same object. Requiring a positive `passed` means a new
 * `CheckState` lands in `incomplete` by construction, rather than by whoever
 * edits this function next remembering to add a branch for it.
 *
 * **A gate with no criteria at all reports `never-evaluated`.** `every` over an
 * empty list is `true`, which is the right answer for the wrong-looking reason:
 * a gate governing nothing has certainly not been shown to hold. `declareGate`
 * refuses to mint one anyway, so this is a defence rather than a case.
 */
function gateStateFrom(checks: readonly { state: CheckState }[]): GateStatus["state"] {
  return checks.every((c) => c.state === "never-run")
    ? "never-evaluated"
    : checks.some((c) => c.state === "failed")
      ? "blocked"
      : checks.every((c) => c.state === "passed")
        ? "satisfied"
        : "incomplete";
}

/**
 * A task's state, from the edges that reach it.
 *
 * **`blocked` first, and that is the one real decision in this enum.** A task
 * can be both carried out and protected by a gate that has not been satisfied,
 * and the two readings are both defensible: *the work happened*, or *its result
 * cannot be built on*. This picks the second, on the same rule
 * `GateStatus.state` already applies to `blocked` over `incomplete` — a reader
 * scanning for what needs attention must see the blockage, because a state that
 * hides it is a state nobody can act on.
 *
 * The other reading is real and is why the overlap has a test of its own rather
 * than being left to fall out of the branch order below.
 *
 * **A gate that is merely unevaluated does not block.** Only `blocked` counts —
 * `never-evaluated` and `incomplete` mean nobody has finished checking, which is
 * a fact about the gate rather than an obstruction to the work. Treating them as
 * blocking would report every freshly gated task as blocked on the day it was
 * planned — a queue that can never be emptied, and is therefore never read.
 */
function workStateFrom(
  task: { gates: Set<string>; implemented: boolean },
  gateStates: ReadonlyMap<string, GateStatus["state"]>,
): WorkState {
  const held = [...task.gates].some((g) => gateStates.get(g) === "blocked");
  if (held) return "blocked";
  return task.implemented ? "carried-out" : "planned";
}
