/**
 * The verbs that answer questions about the record, and change nothing.
 */

import { vertexProps } from "@labkit/core-db/cypher";
import { createdIn, edgesIn } from "../events";
import type {
  EnquiryRef,
  Learned,
  ListedAnalysis,
  ListedClaim,
  ListedCriterion,
  ListedEnquiry,
} from "../report";
import type {
  AnalysisRevision,
  AnyRef,
  ConcludedClaim,
  ConflictVerdict,
  CriterionRef,
  CriterionStanding,
  DependencyReport,
  DesignHistory,
  EnquiryInContext,
  EnquiryStatus,
  Explanation,
  How,
  GateStatus,
  HistoricalSurvey,
  InterpretationHistory,
  KnowledgeSurvey,
  ListedGate,
  ListedWork,
  QuestionOrigin,
  ReproducibilityReport,
  ReproductionReport,
  SearchGroup,
  EventPage,
  ListedNote,
  Standing,
  Transcription,
  SupportExplanation,
  StoppedReason,
  TaskContract,
} from "../report";
import { kindOf } from "../report";
import { DomainRefusal } from "../refusal";
import type { Neighbour } from "./explain";
import { SessionCore, type Methods } from "../core";
import type { DomainEvent, EventFilter } from "../events";
import type {
  AnalysisRevisionQuery,
  ClaimsAssertingQuery,
  ContractForQuery,
  CriteriaGoverningQuery,
  CriterionStandingQuery,
  DesignHistoryQuery,
  DoTheseConflictQuery,
  EnquiryInContextQuery,
  EnquiryStatusQuery,
  GateListQuery,
  GateStatusQuery,
  InterpretationHistoryQuery,
  KnownAtQuery,
  NeighboursOfQuery,
  NotesQuery,
  NowQuery,
  OriginOfQuery,
  ProseForQuery,
  PursuitsOfQuery,
  ReachableQuery,
  ReproducibilityOfQuery,
  ReproductionOfQuery,
  SearchQuery,
  StoppedWorkQuery,
  WhatDependsOnQuery,
  WhyQuery,
  HowQuery,
  WhySupportedQuery,
  ResourceQuery,
  WorkListQuery,
} from "../queries";
import { HappenedGroup } from "./happened";
import { FindingGroup } from "./finding";
import { StandingGroup } from "./standing";
import { BlockedGroup } from "./blocked";
import { InventoryGroup } from "./inventory";
import { LearnedGroup } from "./learned";
import { StoryGroup } from "./story";
import { ExplainGroup, EXPLAINERS, enquiryInContext as enquiryInContextOf } from "./explain";

/**
 * The read verbs a research session answers — the read half of {@link ResearchWrites}, and
 * derived the same way (see {@link Methods}).
 */
export type ResearchReads = Pick<ReadSurface, Methods<ReadSurface>>;

/**
 * **What a refusal may point a caller at, and what it may not.**
 */
export class ReadSurface extends SessionCore {
  readonly #happened: HappenedGroup;
  readonly #finding: FindingGroup;
  readonly #standing: StandingGroup;
  readonly #blocked: BlockedGroup;
  readonly #inventory: InventoryGroup;
  readonly #learned: LearnedGroup;
  readonly #story: StoryGroup;
  readonly #explain: ExplainGroup;

  constructor(...args: ConstructorParameters<typeof SessionCore>) {
    super(...args);
    // The sink this surface settled on, not the one it was handed — see
    // `WriteSurface`'s constructor for what taking the default twice cost.
    const [graph, options] = args;
    const shared: ConstructorParameters<typeof SessionCore> = [
      graph,
      { ...options, events: this.events },
    ];
    this.#happened = new HappenedGroup(...shared);
    this.#finding = new FindingGroup(...shared);
    this.#standing = new StandingGroup(...shared);
    this.#blocked = new BlockedGroup(...shared);
    this.#inventory = new InventoryGroup(...shared);
    this.#learned = new LearnedGroup(...shared);
    this.#story = new StoryGroup(...shared);
    this.#explain = new ExplainGroup(...shared);
  }

  /**
   * What was done, in order — the one read that answers from the event log
   * rather than the graph. See `HappenedGroup.whatHappened`.
   */
  async whatHappened(filter: EventFilter): Promise<readonly DomainEvent[]> {
    return this.#happened.whatHappened(filter);
  }

  /** Every note on the record, newest first, or only those concerning one handle. */
  async notes(query: NotesQuery): Promise<ListedNote[]> {
    return this.#happened.notes(query);
  }

  /** The same acts, and whether that was all of them. See `HappenedGroup.whatHappenedPage`. */
  async whatHappenedPage(filter: EventFilter): Promise<EventPage> {
    return this.#happened.whatHappenedPage(filter);
  }

  /** How much of the record was read off something rather than performed. */
  async howMuchWasTranscribed(): Promise<Transcription> {
    return this.#happened.howMuchWasTranscribed();
  }

  /** Every line of enquiry pursuing this question. */
  async pursuitsOf(query: PursuitsOfQuery): Promise<EnquiryRef[]> {
    return this.#finding.pursuitsOf(query);
  }

  /** Where a question came from, if it came from sharpening an earlier one. */
  async originOf(query: OriginOfQuery): Promise<QuestionOrigin | null> {
    return this.#finding.originOf(query);
  }

  /** Claims asserting a proposition — the one place wording is resolved. */
  async claimsAsserting(query: ClaimsAssertingQuery): Promise<ConcludedClaim[]> {
    return this.#finding.claimsAsserting(query);
  }

  /** Every record containing the text, as `{handle, wording}` pairs grouped by label. */
  async search(query: SearchQuery): Promise<SearchGroup[]> {
    return this.#finding.search(query);
  }

  /** What the record held at a stated moment. */
  async whatWasKnown(query: KnownAtQuery): Promise<HistoricalSurvey> {
    return this.#standing.whatWasKnown(query);
  }

  /** What the programme knows: settled, unsettled, and never looked at. */
  async whatIsKnown(): Promise<KnowledgeSurvey> {
    return this.#standing.whatIsKnown();
  }

  /** Why a piece of work is not being done, if somebody said so. */
  async stoppedWork(query: StoppedWorkQuery): Promise<StoppedReason | undefined> {
    return this.#blocked.stoppedWork(query);
  }

  /** What a planned task is permitted to touch, and whether anyone is enforcing it. */
  async contractFor(query: ContractForQuery): Promise<TaskContract> {
    return this.#blocked.contractFor(query);
  }

  /** Which criterion governs this gate? */
  async criteriaGoverning(query: CriteriaGoverningQuery): Promise<CriterionRef[]> {
    return this.#blocked.criteriaGoverning(query);
  }

  /** A locked design and everything that has happened to it, oldest first. */
  async designHistory(query: DesignHistoryQuery): Promise<DesignHistory> {
    return this.#blocked.designHistory(query);
  }

  /** May this gate be relied on, and on what evidence? */
  async gateStatus(query: GateStatusQuery): Promise<GateStatus> {
    return this.#blocked.gateStatus(query);
  }

  /** Every gate, with the state a reader is filtering on. */
  async gateList(query: GateListQuery): Promise<ListedGate[]> {
    return this.#blocked.gateList(query);
  }

  /** Every planned piece of work, with the state a reader is filtering on. */
  async workList(query: WorkListQuery): Promise<ListedWork[]> {
    return this.#blocked.workList(query);
  }
  /** What the programme found out, under the question it was asked for. */
  async learned(): Promise<Learned> {
    return this.#learned.learned();
  }

  /** Every claim on the record, with what bears on it. */
  async claimList(): Promise<ListedClaim[]> {
    return this.#inventory.claimList();
  }

  /** Every line of enquiry, with the question it pursues. */
  async enquiryList(): Promise<ListedEnquiry[]> {
    return this.#inventory.enquiryList();
  }

  /** Every analysis, with what it produced. */
  async analysisList(): Promise<ListedAnalysis[]> {
    return this.#inventory.analysisList();
  }

  /** Every condition, with what it governs and how it stands. */
  async criterionList(): Promise<ListedCriterion[]> {
    return this.#inventory.criterionList();
  }

  /** Is this enquiry open, and if not, how did it close? */
  async enquiryStatus(query: EnquiryStatusQuery): Promise<EnquiryStatus> {
    return this.#story.enquiryStatus(query);
  }

  /** What a re-run did and did not establish. */
  async reproductionOf(query: ReproductionOfQuery): Promise<ReproductionReport> {
    return this.#story.reproductionOf(query);
  }

  /** An interpretation and every narrowing behind it, oldest first. */
  async interpretationHistory(query: InterpretationHistoryQuery): Promise<InterpretationHistory> {
    return this.#story.interpretationHistory(query);
  }

  /** Whether two findings actually conflict. */
  async doTheseConflict(query: DoTheseConflictQuery): Promise<ConflictVerdict> {
    return this.#story.doTheseConflict(query);
  }

  /**
   * One record and its neighbours within `depth` hops, as the resource the HTTP API serves.
   *
   * Every other read here answers a researcher's question. This one answers "what is
   * actually stored under this handle", which is what you want open when a read disagrees
   * with the record. Its links are relative; the API rewrites them.
   */
  async resource(query: ResourceQuery): Promise<unknown> {
    return this.graph.entityAsHal(query.handle, query.depth);
  }

  /** "Why does this conclusion count as supported?" and "what did the superseded inference claim?" */
  async whySupported(query: WhySupportedQuery): Promise<SupportExplanation> {
    return this.#story.whySupported(query);
  }

  /** How much of a past construction can be rebuilt. */
  async reproducibilityOf(query: ReproducibilityOfQuery): Promise<ReproducibilityReport> {
    return this.#story.reproducibilityOf(query);
  }

  /** What is affected if this artefact turns out to be wrong? */
  async whatDependsOn(query: WhatDependsOnQuery): Promise<DependencyReport> {
    return this.#story.whatDependsOn(query);
  }

  /** One condition: what it requires, what has been said about it, and what it holds up. */
  async criterionStanding(query: CriterionStandingQuery): Promise<CriterionStanding> {
    return this.#explain.criterionStanding(query);
  }

  /** What one record is joined to, both directions — reached only through `why`. */
  async neighboursOf(query: NeighboursOfQuery): Promise<Neighbour[]> {
    return this.#explain.neighboursOf(query);
  }

  /** A record's own text, whatever kind it is — reached only through `why`. */
  async proseFor(query: ProseForQuery): Promise<string | null> {
    return this.#explain.proseFor(query);
  }

  /** Is this handle on the record and not retracted — reached only through `why`. */
  async reachable(query: ReachableQuery): Promise<boolean> {
    return this.#explain.reachable(query);
  }

  /** What an analysis revised, and which findings moved. */
  async analysisRevision(query: AnalysisRevisionQuery): Promise<AnalysisRevision> {
    return this.#explain.analysisRevision(query);
  }

  /**
   * `enquiryStatus`, alongside where this enquiry's own question sits in the overall survey.
   */
  async enquiryInContext(query: EnquiryInContextQuery): Promise<EnquiryInContext> {
    return enquiryInContextOf(this, query.enquiry);
  }

  /**
   * "What am I blocked on right now, what are my priorities?" — see `Standing`'s own doc
   * comment for the shape and why there is no `at=`.
   */
  async now({ since }: NowQuery): Promise<Standing> {
    const [events, gates, work, known, transcribed] = await Promise.all([
      this.whatHappened(since === undefined ? {} : { since }),
      this.gateList({}),
      this.workList({}),
      this.whatIsKnown(),
      // Not derived from `events` above: with a cursor that list is the window,
      // and this answer is about the record.
      this.howMuchWasTranscribed(),
    ]);
    const last = events.at(-1);
    const seq = last?.seq ?? since ?? 0;

    if (since === undefined) {
      return {
        blocked: {
          gates: gates.filter((g) => g.state === "blocked"),
          work: work.filter((w) => w.state === "blocked"),
        },
        unevaluated: {
          gates: gates.filter((g) => g.state === "never-evaluated" || g.state === "incomplete"),
          work: work.filter((w) => w.state === "waiting"),
        },
        untouched: work.filter((w) => w.state === "planned"),
        known,
        transcribed,
        seq,
      };
    }

    const touched = touchedHandles(events);
    const touchedEnquiries = [...touched].filter((handle) => kindOf(handle) === "enquiry");
    if (touchedEnquiries.length > 0) {
      const affected = await this.graph.query(
        `MATCH (q:Question)-[:MOTIVATES]->(loe:LineOfEnquiry)
         WHERE loe.natural_id IN $ids
         RETURN q`,
        { q: vertexProps<{ natural_id: string }>() },
        { ids: touchedEnquiries },
      );
      for (const row of affected) touched.add(row.q.natural_id);
    }
    const movedWork = (w: ListedWork) => touched.has(w.work) || w.gates.some((g) => touched.has(g));
    const movedById = (h: { question: string }) => touched.has(h.question);
    const movedAnswer = (h: KnowledgeSurvey["established"][number]) =>
      touched.has(h.question) ||
      h.answers.some((answer) => touched.has(answer.enquiry) || touched.has(answer.claim));
    const movedPursuit = (pursuit: KnowledgeSurvey["closedPursuits"][number]) =>
      touched.has(pursuit.question) ||
      touched.has(pursuit.enquiry) ||
      touched.has(pursuit.decision) ||
      (pursuit.answered !== undefined && touched.has(pursuit.answered.claim));

    return {
      blocked: {
        gates: gates.filter((g) => g.state === "blocked" && touched.has(g.gate)),
        work: work.filter((w) => w.state === "blocked" && movedWork(w)),
      },
      unevaluated: {
        gates: gates.filter(
          (g) => (g.state === "never-evaluated" || g.state === "incomplete") && touched.has(g.gate),
        ),
        work: work.filter((w) => w.state === "waiting" && movedWork(w)),
      },
      untouched: work.filter((w) => w.state === "planned" && movedWork(w)),
      known: {
        established: known.established.filter(movedAnswer),
        provisional: known.provisional.filter(movedAnswer),
        unresolved: known.unresolved.filter(movedById),
        untested: known.untested.filter(movedById),
        accepted: known.accepted.filter(movedById),
        closedPursuits: known.closedPursuits.filter(movedPursuit),
      },
      transcribed,
      seq,
      since,
    };
  }

  /**
   * `why <handle>` — dispatches on the handle's own kind, over the report that already exists
   * for it, and renders it as `{subject, is, because}`. Also takes a proposition: text resolves
   * through `claimsAsserting` and refuses an ambiguous match rather than picking.
   *
   * The handle test is case-insensitive and wording keeps the caller's casing, so `why task_8`
   * resolves rather than falling through to wording and reporting that nothing claims it.
   */
  async why({ subject }: WhyQuery): Promise<Explanation> {
    const asHandle = subject.toUpperCase() as AnyRef;
    const kind = kindOf(asHandle);
    if (kind) {
      if (!(await this.reachable({ subject: asHandle })))
        throw new DomainRefusal({
          kind: "not-found",
          message: `${subject} not found`,
          subject: asHandle,
        });
      return EXPLAINERS[kind](this, asHandle);
    }

    const found = await this.claimsAsserting({ proposition: subject });
    if (found.length === 0)
      throw new DomainRefusal({
        kind: "not-found",
        message: `nothing on the record claims "${subject}"`,
      });
    if (found.length > 1)
      throw new DomainRefusal({
        kind: "ambiguous",
        message: `"${subject}" is claimed ${found.length} times; name one: ${found
          .map((c) => c.claim)
          .join(", ")}`,
      });
    return EXPLAINERS.claim(this, found[0]!.claim);
  }
  /**
   * `how <handle>` — ordered steps behind the current state of any handle.
   * Refuses unknown like `why`. Walks SUPERSEDES/CHANGES (Notes and Decisions) and
   * MOTIVATES pairings in StoryGroup; marks superseded with successor when present.
   */
  async how(query: HowQuery): Promise<How> {
    const subject = query.subject;
    const asHandle = subject.toUpperCase() as AnyRef;
    if (!(await this.reachable({ subject: asHandle })))
      throw new DomainRefusal({
        kind: "not-found",
        message: `${subject} not found`,
        subject: asHandle,
      });
    return this.#story.how(query);
  }
}

/**
 * Every handle a batch of events created or touched — `now({since})`'s only
 * new machinery, and it reads what `DomainEvent` already carries (`subject`
 * and `changes`), adding no query of its own.
 */
function touchedHandles(events: readonly DomainEvent[]): Set<string> {
  const touched = new Set<string>();
  for (const e of events) {
    touched.add(e.subject);
    for (const handle of createdIn(e)) touched.add(handle);
    for (const edge of edgesIn(e)) {
      touched.add(edge.from);
      touched.add(edge.to);
    }
  }
  return touched;
}
