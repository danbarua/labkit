/**
 * The verbs that answer questions about the record, and change nothing.
 *
 * The larger half, and the half the consumer contract is about.
 * `docs/consumer-contract/024_vertical_slice_results.md` demonstrated three gaps
 * here at bar 4 — rows Z, F and S. **All three have since landed**: Z resolved
 * with `Decision.decided_at` and `Question.posed_at`, F closed `boundary`, S
 * refuted. The sentence used to say "this is where the next three builds land"
 * and pointed a new reader at finished work.
 *
 * Nothing in this file may emit. `emit` is not reachable from `SessionCore`, so
 * that is enforced by construction rather than by review.
 */

import { edgeProps, optional, scalar, vertexProps } from "../db/cypher";
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
  ConflictSide,
  ConflictVerdict,
  AnalysisRef,
  CheckStatus,
  EnquiryStatus,
  EvaluationRecord,
  CriterionRef,
  BlockedWork,
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
} from "./report";
import { ref, isRefOfKind } from "./report";
import { compose, per, type Row } from "./facts";
import { answeringClaim, checksMet, readOutcomes } from "./survey-facts";
import { SessionCore } from "./core";
import type { DomainEvent, EventFilter } from "./events";

/** Every node carries a natural id; this is how a projection asks for it. */
type Identified = { natural_id: string };

/**
 * Deduplicate by identity, never by wording.
 *
 * The reason this helper exists rather than a `Set` of strings: two records can
 * say the same sentence and be different records (S-5), so collapsing on text
 * reports one where there are two. `whatDependsOn` was doing exactly that until
 * PJ-030 §5.
 */
function dedupeById<T>(items: T[], id: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [id(item), item])).values()];
}

export class ReadSurface extends SessionCore {
  /**
   * What was done, in order — the one read that answers from the event log
   * rather than the graph.
   *
   * **This is not the exception to CLAUDE.md's rule, it is the rule's other
   * half.** *Events explain how state changed; the graph explains what the
   * current research state is.* Every other read here answers "what is true
   * now" and must never consult the log. This one asks "what happened", which
   * the graph cannot answer at all: the graph holds the result of every act and
   * no record of the acts themselves, and after PJ-031 the log is the only
   * place that says **who** did any of it.
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
    if (Number.isNaN(parsed)) throw new Error(`whatWasKnown: "${at}" is not a parseable instant`);
    const asOf = new Date(parsed).toISOString();

    const rows = await this.graph.query(
      `MATCH (q:Question)
       WHERE q.posed_at <= $at
       OPTIONAL MATCH (resolving:Decision)-[:RESOLVES]->(q)
       OPTIONAL MATCH (resolving)-[:BASED_ON]->(cited:Evidence)
       OPTIONAL MATCH (cited)-[:SUPPORTS]->(settled:Claim)
       OPTIONAL MATCH (cited)-[:CHALLENGES]->(against:Claim)
       OPTIONAL MATCH (promoting:Decision)-[:PROMOTES]->(settled)
       OPTIONAL MATCH (denying:Decision)-[:PROMOTES]->(against)
       OPTIONAL MATCH (accepting:Decision)-[:DEFERS]->(q)
       RETURN q, resolving, cited, settled, against, promoting, denying, accepting`,
      {
        q: vertexProps<{ natural_id: string; name: string }>(),
        resolving: optional(vertexProps<{ decided_at: string }>()),
        cited: optional(vertexProps<{ natural_id: string }>()),
        settled: optional(vertexProps<{ natural_id: string }>()),
        // The claim the closing evidence bears AGAINST, and its promotion.
        // A question answered *no* is settled that way and matched nothing
        // above, so a promoted negative result read as scratch (S-18b). Two
        // OPTIONAL MATCHes because AGE has no edge alternation, and the names
        // are lower-case because a camelCase RETURN name decodes as null.
        against: optional(vertexProps<{ natural_id: string }>()),
        promoting: optional(vertexProps<{ decided_at: string }>()),
        denying: optional(vertexProps<{ decided_at: string }>()),
        accepting: optional(vertexProps<{ decided_at: string }>()),
      },
      { at: asOf },
    );

    // The decision cutoffs stay in TypeScript while the question cutoff is in
    // the query, and the split is not arbitrary. `posed_at` decides whether a
    // row belongs in the answer at all, so filtering it in Cypher means the
    // rows that arrive are already the right set. The decision stamps only
    // decide which *bucket* a row lands in, and there are three of them across
    // five OPTIONAL MATCHes — pushing those down would mean an OPTIONAL MATCH
    // per predicate for no change in the result.
    const by = new Map<
      QuestionRef,
      { asks: Prose; resolved: boolean; promoted: boolean; accepted: boolean }
    >();
    for (const row of rows) {
      const entry = by.get(ref("question", row.q.natural_id)) ?? {
        asks: row.q.name,
        resolved: false,
        promoted: false,
        accepted: false,
      };
      const resolvedByThen = row.resolving !== null && row.resolving.decided_at <= asOf;
      entry.resolved ||= resolvedByThen && row.cited !== null;
      // A promotion only counts toward *this* question if the resolution it
      // qualifies had also happened -- otherwise a claim promoted early would
      // establish a question resolved later.
      // Either promotion, and still read from the PROMOTES decision rather than
      // the claim's current `kind` -- `kind` is right for now and wrong for any
      // past instant, which is what this whole method is about.
      const vouched = row.promoting ?? row.denying;
      entry.promoted ||= resolvedByThen && vouched !== null && vouched.decided_at <= asOf;
      entry.accepted ||= row.accepting !== null && row.accepting.decided_at <= asOf;
      by.set(ref("question", row.q.natural_id), entry);
    }

    // The canonical instant, not the caller's text: it is what every comparison
    // above actually used, and echoing back a form that was not compared would
    // describe an answer nobody computed.
    const survey: HistoricalSurvey = {
      at: asOf,
      established: [],
      provisional: [],
      accepted: [],
      open: [],
    };
    for (const [question, e] of by) {
      const standing: QuestionStanding = {
        question: ref("question", question),
        asks: e.asks,
      };
      if (e.resolved && e.promoted) survey.established.push(standing);
      else if (e.resolved) survey.provisional.push(standing);
      else if (e.accepted) survey.accepted.push(standing);
      else survey.open.push(standing);
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
    const anchor = `MATCH (q:Question)
       OPTIONAL MATCH (accepting:Decision)-[:DEFERS]->(q)
       OPTIONAL MATCH (q)-[:MOTIVATES]->(:LineOfEnquiry)<-[:ADDRESSES]-(work:EvidenceUnit)`;
    const { cypher, decoders } = compose(anchor, checksMet, {
      q: vertexProps<{ natural_id: string; name: string }>(),
      accepting: optional(vertexProps<{ natural_id: string }>()),
      work: optional(vertexProps<{ natural_id: string }>()),
    });
    // `answering` is the fact's own grain and is not matched by any clause:
    // it is the claim `answeringClaim` resolves to, projected onto each row so
    // the claim-grained facts have a subject to group by.
    const rows = (await this.graph.query(cypher, decoders, {})) as unknown as Row[];
    readOutcomes(rows);

    const answering = per(answeringClaim, rows);
    const withSubject = rows.map((row) => ({
      ...row,
      answering: answering.get((row.q as { natural_id: string }).natural_id) ?? null,
    }));
    const met = per(checksMet, withSubject);

    const survey: KnowledgeSurvey = {
      established: [],
      provisional: [],
      unresolved: [],
      untested: [],
      accepted: [],
    };
    const seen = new Map<string, { asks: string; accepted: boolean; worked: boolean }>();
    for (const row of rows) {
      const q = row.q as { natural_id: string; name: string };
      const entry = seen.get(q.natural_id) ?? { asks: q.name, accepted: false, worked: false };
      entry.accepted ||= row.accepting !== null;
      entry.worked ||= row.work !== null;
      seen.set(q.natural_id, entry);
    }

    for (const [question, entry] of seen) {
      const standing: QuestionStanding = { question: ref("question", question), asks: entry.asks };
      const claim = answering.get(question);
      // Settled beats accepted: a question answered after being accepted is
      // answered. Accepted beats worked, because a reader scanning for what
      // still needs doing must not find a deliberately-parked question there.
      //
      // `established` is the strongest word this survey has and means the
      // answer rests on promoted work **that met the standard it was held to**.
      // Promotion alone is not enough — a claim held to a check that failed, or
      // that nobody ran, is S-3b's case: a prespecified check nobody performed
      // counts against the finding it qualifies (issue #62, S-19). A claim held
      // to nothing is vacuously met, which keeps S-18's promoted scratch in
      // `established`.
      if (claim && claim.kind === "confirmatory" && met.get(claim.natural_id) !== false)
        survey.established.push(standing);
      else if (claim) survey.provisional.push(standing);
      else if (entry.accepted) survey.accepted.push(standing);
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
    if (!loe) throw new Error(`no enquiry ${enquiry}`);

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
    // Accepted, not closed. `open` stays TRUE, which is the correction S-14
    // forced: the previous branch reported `open: false`, so a question left
    // open on purpose read as shut. The question has not been answered and
    // nobody claims it has; what changed is that leaving it open is now a
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
      // Only the challenging bearing is fetched. An earlier version also
      // returned the supporting claim as `forClaim` and never read it: polarity
      // is "no" when something challenges and "yes" otherwise, so the
      // supporting side is the default rather than an input. Dead the same way
      // PJ-007's `buildAsClause` branch was -- and silently broken besides,
      // since a camelCase column decodes as null (see `buildAsClause`, which
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
    // and look (S-18).
    // **Both bearings.** A question answered *no* is settled by evidence that
    // CHALLENGES the claim, and walking only SUPPORTS found no claim at all --
    // so a negative result somebody had vouched for reported itself as resting
    // on scratch, which tells a reader not to build on it (S-18b). Third time
    // this assumption has been found in a query path: `scopeOf` and
    // `closeEnquiry`'s ownership check were the first two. No edge alternation
    // in AGE, so it is two OPTIONAL MATCHes, exactly as `conclusionsOf` does.
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
   * Findings bearing on a proposition one way or the other.
   *
   * `bearing` is interpolated because pglite-age rejects edge-type
   * alternation outright — `[:SUPPORTS|CHALLENGES]` is a syntax error, not
   * merely unsupported for variable-length patterns. The value comes from a
   * closed set of literals here, never from a caller.
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
       RETURN e, comp, a, r`,
      {
        e: vertexProps<EvidenceProps & { natural_id: string }>(),
        comp: vertexProps<ComputationProps & Identified>(),
        a: optional(vertexProps<ArtefactProps & { natural_id: string }>()),
        r: optional(vertexProps<{ verdict: string }>()),
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
      `MATCH (t:Task {natural_id: $id}) RETURN t`,
      {
        t: vertexProps<{
          objective: string;
          acceptance: string;
          mayRead: string[];
        }>(),
      },
      { id: work },
    );
    const task = rows[0]?.t;
    if (!task) throw new Error(`no planned work ${work}`);

    // No fallback, and that is checked rather than assumed. `planWork` writes
    // `mayRead: input.mayRead ?? []`, so the property is always present and an
    // empty contract round-trips as a real empty array -- confirmed by putting
    // a sentinel in a `?? []` here and watching it never appear. A `JSON.parse`
    // in a try/catch and two runtime type guards used to stand here, all of
    // them guarding a shape the writer cannot produce. Adding a fresh guard in
    // their place would have been the same defect wearing shorter code.
    return {
      work,
      objective: task.objective,
      acceptance: task.acceptance,
      mayRead: task.mayRead,
      enforced: false,
    };
  }

  /**
   * Which criterion governs this gate?
   *
   * The reviewer in S-17 asks for evidence that the guard fails when the
   * protected artefact is wrong. That is a question about the criterion, and
   * answering it requires knowing which criterion a gate enforces.
   *
   * Answered via `GOVERNS`, which exists from the moment the gate is
   * declared. Before that edge, the only route ran through a
   * CriterionEvaluation and so returned null for exactly the gates S-17 is
   * about — see EDGE_SCHEMA.GOVERNS.
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
   * What a re-run did and did not establish (S-10).
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
    if (!found) throw new Error(`analysis ${verification} re-verifies nothing`);

    const method = await this.graph.query(
      `MATCH (c:Computation {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ kind: string }>() },
      { id: verification },
    );

    // Keyed by natural id, never by `logical_name`. Two runs can each record
    // something called "initial conditions" and mean different data; comparing
    // the names made those the same execution input. That is the identity-
    // versus-wording mistake this project has now found in four unrelated
    // places (S-5, S-12, S-3b, and here, by external review).
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
    // identity is what breaks the tie when two inputs share one (S-10c).
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
      // Identity and wording both. These were the computations' METHOD text
      // only, so two runs of one method were indistinguishable -- the same
      // `via` defect PJ-030 §4 caught one function away.
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
   * order is never consulted. What that does *not* order is two amendments to
   * different designs; see PJ-008 row Z.
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
    if (conditions.length === 0) throw new Error(`gate ${gate} is governed by no condition`);

    // The two maps used to say `Map<string, string>` with `// decision ->
    // criterion it replaced` beside one of them. The comment was a type written
    // as prose; it is a type now.
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
    // several unamended conditions is a different shape -- see S-3 -- and
    // guessing which one is "the design" would be a confidently wrong answer.
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
   * S-17/S-3: may this gate be relied on, and on what evidence?
   *
   * Every governing condition is itemised, including the ones nobody has
   * evaluated. That is the point: S-3 requires a failed check to be
   * distinguishable from a check never run, and an absent list entry cannot
   * carry that difference.
   */
  async gateStatus(gate: GateRef): Promise<GateStatus> {
    const declared = await this.graph.query(
      `MATCH (g:Gate {natural_id: $id}) RETURN g`,
      { g: vertexProps<{ consequence: string }>() },
      { id: gate },
    );
    const found = declared[0];
    if (!found) throw new Error(`no gate ${gate}`);

    // Every governing criterion with the evaluations that pertain to THIS
    // gate. Two scopes are deliberately kept apart, and S-17 plus S-3
    // together are what force the distinction:
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
    const rows = await this.graph.query(
      `MATCH (c:Criterion)-[:GOVERNS]->(g:Gate {natural_id: $id})
       OPTIONAL MATCH (c)-[:EVALUATED_AS]->(ev:CriterionEvaluation)-[:TRIGGERS]->(g)
       OPTIONAL MATCH (ev)-[:BASED_ON]->(basis:Evidence)
       OPTIONAL MATCH (basis)-[:RECORDED_IN]->(basisout:Artefact)
       RETURN c, ev, basis, basisout`,
      {
        c: vertexProps<{ natural_id: string; proposition: string }>(),
        ev: optional(
          vertexProps<{
            natural_id: string;
            value: string;
            outcome: "pass" | "fail";
            evaluated_at: string;
          }>(),
        ),
        basis: optional(vertexProps<{ statement: string } & Identified>()),
        basisout: optional(vertexProps<{ invalidated?: boolean }>()),
      },
      { id: gate },
    );

    const checks = this.checksFrom(rows);
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

    // Order matters. Absence is checked before satisfaction so a gate nobody
    // evaluated can never fall through to "satisfied" (S-17); failure is
    // checked before incompleteness because a failure is decisive (S-3).
    const state: GateStatus["state"] = checks.every((c) => c.state === "never-run")
      ? "never-evaluated"
      : checks.some((c) => c.state === "failed")
        ? "blocked"
        : checks.some((c) => c.state === "never-run")
          ? "incomplete"
          : "satisfied";

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
      // `?? g.w.kind ?? "unknown"` used to sit here. Dead now: `work` carries
      // the handle, so a caller with an odd objective can go and look rather
      // than being handed a placeholder.
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
   * Groups (criterion, evaluation, basis) rows into itemised checks.
   *
   * Shared by the two jobs a criterion does, which S-3 fused and S-3b took
   * apart: gating work (`gateStatus`) and qualifying a finding
   * (`whySupported`). The traversals that reach the criteria differ; how a
   * check is reported must not, or the same condition would read one way
   * through a gate and another through the finding it qualifies.
   */
  private checksFrom(
    rows: Array<{
      c: { natural_id: string; proposition: string };
      ev: {
        natural_id: string;
        value: string;
        outcome: "pass" | "fail";
        evaluated_at: string;
      } | null;
      basis: ({ statement: string } & Identified) | null;
      /**
       * The artefact the cited finding was recorded in, carrying whether that
       * analysis has since been replaced.
       *
       * Lower-case deliberately, and enforced: `basisOut` here returns present
       * and NULL for every row, silently, because the AS clause AGE requires
       * is unquoted SQL and Postgres folds it. See `buildAsClause`.
       */
      basisout: { invalidated?: boolean } | null;
    }>,
  ): CheckStatus[] {
    // Keyed by natural id, not by proposition text. Two criteria worded
    // identically are two criteria; whether they SHOULD be one is an identity
    // question, and a read-side query must not settle it by string equality.
    // `standing` counts the cited findings that have NOT been withdrawn. It
    // is kept alongside `basis` rather than derived from it because `basis`
    // is display text, and two withdrawn findings can share a sentence.
    // `id` used to live here separately and be discarded by `strip`. It is
    // `EvaluationRecord.evaluation` now, so there is one field rather than two
    // and nothing to drop on the way out.
    type TimedEvaluation = EvaluationRecord & {
      cited: number;
      standing: number;
    };
    const byCriterion = new Map<string, { proposition: string; evaluations: TimedEvaluation[] }>();
    for (const row of rows) {
      const id = row.c.natural_id;
      const entry = byCriterion.get(id) ?? {
        proposition: row.c.proposition,
        evaluations: [],
      };
      if (row.ev) {
        // One row per (evaluation, basis) pair, so an evaluation citing several
        // findings arrives more than once. Accumulate rather than push.
        const seen = entry.evaluations.find((e) => e.evaluation === row.ev!.natural_id);
        const record = seen ?? {
          evaluation: ref("evaluation", row.ev.natural_id),
          criterion: ref("criterion", id),
          value: row.ev.value,
          outcome: row.ev.outcome,
          at: row.ev.evaluated_at,
          basis: [] as CitedFinding[],
          cited: 0,
          standing: 0,
        };
        if (row.basis) {
          // By id, not by statement: two findings can say the same sentence.
          if (!record.basis.some((b) => b.evidence === row.basis!.natural_id))
            record.basis.push({
              evidence: ref("evidence", row.basis.natural_id),
              states: row.basis.statement,
            });
          record.cited += 1;
          if (!row.basisout?.invalidated) record.standing += 1;
        }
        if (!seen) entry.evaluations.push(record);
      }
      byCriterion.set(id, entry);
    }

    /**
     * A verdict is withdrawn when everything it was reached against has
     * been. A verdict that cited nothing cannot be withdrawn at all — there
     * is nothing to retract — which is what keeps S-8's asserted-versus-
     * measured distinction (row W) from becoming a loophole.
     */
    const isWithdrawn = (e: TimedEvaluation): boolean => e.cited > 0 && e.standing === 0;

    const strip = (e: TimedEvaluation): EvaluationRecord => ({
      evaluation: e.evaluation,
      criterion: e.criterion,
      value: e.value,
      outcome: e.outcome,
      at: e.at,
      basis: [...e.basis].sort((x, y) => x.evidence.localeCompare(y.evidence)),
      // Present only when true, so a record that stands is byte-identical to
      // what it was before this field existed.
      ...(isWithdrawn(e) ? { withdrawn: true as const } : {}),
    });

    const checks: CheckStatus[] = [];
    for (const [id, entry] of byCriterion) {
      // Cypher imposes no ordering, so sort explicitly: by time, then by
      // identity. Without this, which evaluation gets reported as "the" value
      // of a check is not a stable contract between runs.
      const ordered = entry.evaluations.sort(
        (a, b) => a.at.localeCompare(b.at) || a.evaluation.localeCompare(b.evaluation),
      );

      // A failure sticks -- among verdicts that still stand. One failing
      // evaluation is decisive even if a later run passed, so re-running
      // until green is not evidence (S-3, and the case that earned this).
      //
      // S-3c narrowed it, and only here: a verdict whose entire basis has
      // been reviewed and withdrawn is not a failure that stands, it is a
      // failure that was retracted. Before this the two were the same state,
      // so a check found to be defective, corrected and re-run went on
      // disqualifying the finding and blocking the work for ever -- the same
      // answer as re-rolling the dice, which is the one thing S-3 set out to
      // prevent. Ledger row X.
      //
      // What did NOT change: the withdrawn verdict stays in `evaluations`,
      // marked. Erasing it would leave no record of why the finding was ever
      // in doubt, and re-running a check that nobody faulted still cannot
      // clear it, because nothing withdraws it.
      const standing = ordered.filter((e) => !isWithdrawn(e));
      const decisive = standing.find((e) => e.outcome === "fail") ?? standing[0];
      // Three ways to have no decisive verdict, and only one of them is
      // "nobody ran this". A check every one of whose verdicts has been
      // withdrawn *ran*, and saying `never-run` contradicted the evaluations
      // listed beside it -- external review of S-3c.
      const state: CheckStatus["state"] =
        decisive !== undefined
          ? decisive.outcome === "fail"
            ? "failed"
            : "passed"
          : ordered.length > 0
            ? "no-standing-verdict"
            : "never-run";
      checks.push({
        criterion: ref("criterion", id),
        proposition: entry.proposition,
        state,
        evaluations: ordered.map(strip),
        ...(decisive ? { decidedBy: strip(decisive) } : {}),
      });
    }

    return checks;
  }

  // -------------------------------------------------------------------------
  // Revision
  // -------------------------------------------------------------------------

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
    // **Walked by id.** Every step of a revision chain is already reachable by
    // identity -- `reinterpret` writes `Decision -MOTIVATES-> narrower` and
    // `Decision -CHANGES-> each withdrawn claim`, both carrying natural ids --
    // so this needed a different query and no new structure. It used to find
    // each step by the NAME of the one after it, which S-12b breaks: two
    // independent chains passing through one sentence made a legitimate
    // history throw `is not a single line`, because the by-name match found
    // the other chain's claim and its decision. Same text is not same claim,
    // which is this repo's oldest lesson arriving from an external review.
    const proposition = await this.assertedBy(claim);
    if (proposition === undefined) throw new Error(`no claim ${claim}`);
    const steps: Revision[] = [];
    let current: ConcludedClaim[] = [{ claim, asserts: proposition }];

    // Seeded with the entry claim now that it holds ids. It could not be while
    // it held wording -- a set of names cannot be primed with a claim -- so a
    // self-loop was caught one step late.
    const seen = new Set<ClaimRef>([claim]);

    for (;;) {
      const rows = await this.graph.query(
        // `nxt` bound and matched by id. Lower-case names throughout: a
        // camelCase RETURN name decodes as null (CLAUDE.md).
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
      // so this is plural by construction -- S-12's two analyses reaching one
      // reading are withdrawn together.
      const withdrew: ConcludedClaim[] = [
        ...new Map(rows.map((r) => [r.was.natural_id, r.was] as const)).values(),
      ].map((was) => ({
        claim: ref("claim", was.natural_id),
        asserts: was.name,
      }));

      for (const w of withdrew) {
        if (seen.has(w.claim))
          throw new Error(`interpretation history for "${proposition}" loops at "${w.asserts}"`);
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
        // Scoped to the withdrawn claim's own line of enquiry. Passing the
        // bare proposition asked "what was decided on the strength of this
        // SENTENCE", which in S-12b reaches the other chain's decisions.
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
   * the way its evidence bears — never from comparing the two sentences. In
   * S-5 the sentences are identical and the answer is "no".
   */
  async doTheseConflict(a: ClaimRef, b: ClaimRef): Promise<ConflictVerdict> {
    const sides = [await this.sideOf(a), await this.sideOf(b)];
    const [left, right] = sides;

    // `.id`, not the handles. `EnquiryRef` is an object, so `===` between two
    // of them is reference equality and is false even for the same enquiry --
    // which read as "different lines of enquiry" and turned a contradiction
    // into a dissociation, silently. The compiler accepts it: both sides have
    // the same type. Caught by S-5, which exists to catch exactly the class of
    // error where two records are wrongly told apart or run together.
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
   * enquiry (S-5).
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
        if (row.a?.invalidated) {
          // Deduped, and the reason comes from INVALIDATED_BY rather than from
          // whichever review the OPTIONAL MATCH happened to return. Two defects
          // in one line before row O: a finding superseded once was reported
          // once per review of its unit, each with a different reason, and the
          // reasons contradicted each other.
          if (!superseded.some((x) => x.evidence === entry.evidence && x.bearing === bearing))
            superseded.push({
              ...entry,
              bearing,
              reason: retractedBy.get(row.a.natural_id) ?? "its analysis was replaced",
            });
        } else if (bearing === "supports" && reverifying.has(row.e.natural_id)) {
          // A re-verification is not a second independent finding. Counting it
          // as one reported a proposition established once as corroborated
          // twice -- S-10, and the reason `REVERIFIES` exists.
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
    const resting = await this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(e:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       ${this.withinScope(scope)}
       MATCH (u)-[:USES]->(comp:Computation)
       MATCH (comp)-[:CONSUMES]->(a:Artefact)
       MATCH (e)-[:RECORDED_IN]->(out:Artefact)
       WHERE out.invalidated IS NULL OR out.invalidated = false
       RETURN a, e`,
      {
        // `natural_id` because `restingOn` deduplicates by identity, not by
        // name -- see where it is built below, and S-9d. `invalidated` rides
        // along on the same row: the filter above is on the evidence's OWN
        // output, never on what the computation read, so a retracted input was
        // reported with nothing marking it (S-11e).
        a: vertexProps<ArtefactProps & { natural_id: string }>(),
        e: vertexProps<{ natural_id: string }>(),
      },
      {
        name: proposition,
        ...this.scopeParams(scope),
      },
    );

    // The standard the finding was held to, if it was held to one. S-3b: the
    // criteria a researcher agreed before the run are what "does this stand?"
    // is answered against, and before `QUALIFIES` there was no path from a
    // claim to them at all -- so a finding whose own prespecified checks had
    // failed reported `supported: true`. See ledger row V.
    //
    // Same invalidation filter as `restingOn` above: a replaced analysis's
    // checks are as historical as its findings, and applying one filter and
    // not the other would make two fields of one answer disagree. Load-bearing,
    // not tidy -- see the superseded-analysis test in S-3b.
    //
    // Boundary: only the SUPPORTING analyses' standards are read. An analysis
    // recorded with `heldTo` whose findings CHALLENGE the proposition still
    // reads as a live challenge even if its own checks failed, so `challenged`
    // is not qualified the way `supported` now is. Nothing in the corpus holds
    // a challenging analysis to a prespecified standard; the scenario that
    // would settle it is a null result whose robustness checks disagree.
    const standardRows = await this.graph.query(
      `MATCH (cl:Claim {natural_id: $claim})<-[:SUPPORTS]-(e:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       MATCH (e)-[:RECORDED_IN]->(out:Artefact)
       WHERE out.invalidated IS NULL OR out.invalidated = false
       MATCH (crit:Criterion)-[:QUALIFIES]->(u)
       OPTIONAL MATCH (crit)-[:EVALUATED_AS]->(ev:CriterionEvaluation)
       OPTIONAL MATCH (ev)-[:BASED_ON]->(basis:Evidence)
       OPTIONAL MATCH (basis)-[:RECORDED_IN]->(basisout:Artefact)
       RETURN crit AS c, ev, basis, basisout`,
      {
        c: vertexProps<{ natural_id: string; proposition: string }>(),
        ev: optional(
          vertexProps<{
            natural_id: string;
            value: string;
            outcome: "pass" | "fail";
            evaluated_at: string;
          }>(),
        ),
        basis: optional(vertexProps<{ statement: string } & Identified>()),
        basisout: optional(vertexProps<{ invalidated?: boolean }>()),
      },
      { claim },
    );
    const standard = this.checksFrom(standardRows);
    // Never-run counts against, exactly as it does for a gate: a check nobody
    // performed has not been met. `gateStatus()` computes `unmet` the same way
    // and the two must agree, since in S-3 they are the same checks.
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
    // fine and always were, and blanking them would say the numbers had gone
    // wrong -- which is the one thing S-12 exists to deny.
    const { withdrawn, replacedBy } = await this.withdrawalOf(scope);

    // Standing, and why it was conferred. Read from the claim rather than the
    // conclusion so a promotion taken later is visible here at all.
    const promotion = await this.graph.query(
      `MATCH (c:Claim {name: $name})<-[:SUPPORTS]-(e:Evidence)<-[:PRODUCES]-(u:EvidenceUnit)
       ${this.withinScope(scope)}
       OPTIONAL MATCH (d:Decision)-[:PROMOTES]->(c)
       RETURN c, d`,
      {
        c: vertexProps<{ kind?: string }>(),
        d: optional(vertexProps<{ reason: string }>()),
      },
      { name: proposition, ...this.scopeParams(scope) },
    );
    const confirmed = promotion.some((r) => r.c.kind === "confirmatory");
    const promotedBecause = promotion.find((r) => r.d)?.d?.reason;

    return {
      // The handle the caller asked with, echoed so the answer names its own
      // subject once it is stored or sent.
      claim,
      proposition,
      // Three ways to not be supported, and they are different states: no
      // evidence at all, the interpretation withdrawn, and -- since S-3b --
      // evidence that exists and fails the standard set for it. `support`
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
      // finding (external review of S-10). Filtered in TypeScript rather than
      // in the query because AGE rejects a `NOT (pattern)` predicate outright
      // -- `cypher_yyerror`, not a decode problem.
      // Deduplicated by **identity**, never by name. Two artefacts may share a
      // `logical_name` -- a regeneration carries the name of the part it
      // replaces (S-9) -- and collapsing on the name reported a conclusion
      // resting on one input when it rested on two, with the vanished one
      // indistinguishable from the survivor (S-9d). Same defect S-9c fixed in
      // `reproducibilityOf()`, in the read researchers actually use.
      restingOn: [
        ...new Map(
          resting
            .filter((r) => !reverifying.has(r.e.natural_id))
            .map((r) => [
              r.a.natural_id,
              {
                part: ref("observations", r.a.natural_id),
                name: r.a.logical_name,
                ...(r.a.invalidated ? { invalidated: true as const } : {}),
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
   * How much of a past construction can be rebuilt (S-9).
   *
   * The caller re-runs whatever it can and offers the hashes it got back; this
   * says which parts match, which disagree, and which nobody can check because
   * the original never recorded a hash. `content_hash` had been written and
   * never read since PJ-004 — declared, carried through every tenant, and
   * consulted by nothing. This is its first reader.
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

    // An absent subject and an empty one are different states, and answering
    // them alike is what let this report say `reproducible: true` about nothing
    // (S-9e). The existence check is separate from the parts query because both
    // return zero rows and only one of them is a caller error -- there is a real
    // analysis to refuse a report about, so this is not a manufactured refusal.
    const subject = await this.graph.query(
      `MATCH (c:Computation {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ natural_id: string }>() },
      { id: analysis },
    );
    if (subject.length === 0) throw new Error(`no analysis ${analysis}`);

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
      // does not have -- external review found exactly that, in the function
      // written to respect the distinction.
      // Keyed by natural id, never by name. An original and its regeneration
      // legitimately share a `logical_name` (S-9), and reporting bare names put
      // that one string in `exact` and `differing` at once -- see S-9c.
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
      // Anything not shown to match leaves the construction unshown. Saying
      // otherwise is the quiet inheritance S-9 forbids.
      //
      // `exact.length > 0` is the conjunct three empty lists cannot supply: an
      // analysis that consumed nothing satisfies "nothing differed, nothing was
      // unverifiable, nothing went unrebuilt" vacuously, and reported that a
      // construction with no parts reproduces (S-9e). The rule was already
      // written out one function away -- `reproductionOf()`'s "absence on BOTH
      // sides is still absence: two runs that each recorded nothing have not
      // reproduced anything" -- and never travelled to the function whose own
      // docstring says that rule was learned here.
      reproducible:
        exact.length > 0 &&
        differing.length === 0 &&
        unverifiable.length === 0 &&
        notRebuilt.length === 0,
    };
  }

  /**
   * "What is affected if this record is invalidated?" -- PJ-001's MVP
   * propagation query. Deliberately the affected side only; what is *not*
   * affected is reported by replaceAnalysis, because it depends on what the
   * replacement rests on rather than on the invalidated record alone.
   *
   * Unrelated to whySupported()'s `restingOn`, which moved to CONSUMES: this
   * asks which enquiries REQUIRE the evidence held here, not what any
   * computation read.
   *
   * What is affected if this artefact turns out to be wrong?
   *
   * Two routes in, and S-9 is what forced the second. An artefact reached by
   * `Evidence -RECORDED_IN->` is an analysis *output*, and the evidence
   * recorded in it bears on claims directly — that is the path S-11 walks. An
   * artefact a computation `CONSUMES` is an *input*, and nothing recorded in it
   * bears on anything; what rests on it are the claims of every analysis that
   * read it. Walking only the first returned `claims: []` for an input a claim
   * demonstrably rested on, while still naming the enquiry — a confident,
   * populated, wrong answer, and the same verb answering one question two
   * incompatible ways depending on which end of a computation it was aimed at.
   * That is ledger row P surfacing: `Evidence` carries two senses, and this
   * query knew only one of them.
   *
   * `subject` is a name while a name identifies one artefact, and an explicit
   * reference when it does not — S-5's rule, and S-9 is where artefacts needed
   * it: a regenerated part naturally carries the name of the part it
   * regenerates. Given an ambiguous name this **refuses** rather than answering
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
    // artefact handed in stopped at the first stage, which is the other half of
    // S-11c's omission.
    //
    // Iterative rather than a variable-length pattern: the chain alternates
    // CONSUMES and PRODUCES, and AGE has no edge-type alternation at all
    // (see CLAUDE.md's gotchas). Visited-set rather than a depth cap, so a
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
    // sentence in different lines of enquiry are two claims (S-5), and the
    // previous version -- a `Set<string>` of names -- silently merged them, so
    // invalidating a record under one reported one affected claim where there
    // were two.
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
   * Two artefacts can carry one name — a regenerated part is the case S-9 is
   * about — and answering about both would merge a historical record with an
   * inferred one. Declining beats guessing, exactly as it does for a claim
   * asserted in two lines of enquiry (S-5).
   */
  private async artefactNamed(name: IndexedString): Promise<ObservationsRef> {
    const rows = await this.graph.query(
      `MATCH (a:Artefact {logical_name: $name}) RETURN a`,
      { a: vertexProps<{ natural_id: string }>() },
      { name },
    );
    if (rows.length === 0) throw new Error(`no artefact named "${name}"`);
    if (rows.length > 1) {
      throw new Error(
        `${rows.length} artefacts are named "${name}"; name which, by the record that produced it`,
      );
    }
    return ref("observations", rows[0]!.a.natural_id);
  }
}
