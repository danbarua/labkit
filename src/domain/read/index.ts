/**
 * The verbs that answer questions about the record, and change nothing.
 *
 * Nothing in this module tree may emit. `emit` is not reachable from
 * `SessionCore`, so that is enforced by construction rather than by review.
 */

import type { IdentityString, IndexedString, Prose, Timestamp } from "../../db/domain";
import type { ClaimRef, EnquiryRef, GateRef, WorkRef } from "../report";
import type {
  AnalysisRef,
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
  GateStatus,
  HistoricalSurvey,
  InterpretationHistory,
  KnowledgeSurvey,
  ListedGate,
  ListedWork,
  ObservationsRef,
  QuestionOrigin,
  QuestionRef,
  ReproducibilityReport,
  ReproductionReport,
  SearchGroup,
  Standing,
  SupportExplanation,
  TaskContract,
  WorkState,
} from "../report";
import { kindOf } from "../report";
import { SessionCore, type Methods } from "../core";
import type { DomainEvent, EventFilter } from "../events";
import { HappenedGroup } from "./happened";
import { FindingGroup } from "./finding";
import { StandingGroup } from "./standing";
import { BlockedGroup } from "./blocked";
import { StoryGroup } from "./story";
import { ExplainGroup, EXPLAINERS, enquiryInContext as enquiryInContextOf } from "./explain";

/**
 * The read verbs a research session answers — the read half of
 * {@link ResearchWrites}, and derived the same way (see {@link Methods}).
 *
 * Its whole job is the assertion in `../session.ts`: a `ResearchSession`
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
 * {@link SEARCHABLE_TEXT}, and `Computation`, `Claim` and `Artefact` are
 * absent from that table — so *"'search' finds its handle by the method"* sends
 * a caller to a search that returns nothing.
 *
 * **A taught remedy that fails is worse than the opacity it replaced**, because
 * the caller believes it and spends the trust before finding out.
 */
export class ReadSurface extends SessionCore {
  readonly #happened: HappenedGroup;
  readonly #finding: FindingGroup;
  readonly #standing: StandingGroup;
  readonly #blocked: BlockedGroup;
  readonly #story: StoryGroup;
  readonly #explain: ExplainGroup;

  constructor(...args: ConstructorParameters<typeof SessionCore>) {
    super(...args);
    this.#happened = new HappenedGroup(...args);
    this.#finding = new FindingGroup(...args);
    this.#standing = new StandingGroup(...args);
    this.#blocked = new BlockedGroup(...args);
    this.#story = new StoryGroup(...args);
    this.#explain = new ExplainGroup(...args);
  }

  /**
   * What was done, in order — the one read that answers from the event log
   * rather than the graph. See `HappenedGroup.whatHappened`.
   */
  async whatHappened(filter: EventFilter = {}): Promise<readonly DomainEvent[]> {
    return this.#happened.whatHappened(filter);
  }

  /** Every line of enquiry pursuing this question. */
  async pursuitsOf(question: QuestionRef): Promise<EnquiryRef[]> {
    return this.#finding.pursuitsOf(question);
  }

  /** Where a question came from, if it came from sharpening an earlier one. */
  async originOf(question: QuestionRef): Promise<QuestionOrigin | null> {
    return this.#finding.originOf(question);
  }

  /** Claims asserting a proposition — the one place wording is resolved. */
  async claimsAsserting(proposition: IndexedString): Promise<ConcludedClaim[]> {
    return this.#finding.claimsAsserting(proposition);
  }

  /** Every record containing the text, as `{handle, wording}` pairs grouped by label. */
  async search(text: Prose): Promise<SearchGroup[]> {
    return this.#finding.search(text);
  }

  /** What the record held at a stated moment. */
  async whatWasKnown(at: Timestamp): Promise<HistoricalSurvey> {
    return this.#standing.whatWasKnown(at);
  }

  /** What the programme knows: settled, unsettled, and never looked at. */
  async whatIsKnown(): Promise<KnowledgeSurvey> {
    return this.#standing.whatIsKnown();
  }

  /** What a planned task is permitted to touch, and whether anyone is enforcing it. */
  async contractFor(work: WorkRef): Promise<TaskContract> {
    return this.#blocked.contractFor(work);
  }

  /** Which criterion governs this gate? */
  async criteriaGoverning(gate: GateRef): Promise<CriterionRef[]> {
    return this.#blocked.criteriaGoverning(gate);
  }

  /** A locked design and everything that has happened to it, oldest first. */
  async designHistory(gate: GateRef): Promise<DesignHistory> {
    return this.#blocked.designHistory(gate);
  }

  /** May this gate be relied on, and on what evidence? */
  async gateStatus(gate: GateRef): Promise<GateStatus> {
    return this.#blocked.gateStatus(gate);
  }

  /** Every gate, with the state a reader is filtering on. */
  async gateList(state?: GateStatus["state"]): Promise<ListedGate[]> {
    return this.#blocked.gateList(state);
  }

  /** Every planned piece of work, with the state a reader is filtering on. */
  async workList(state?: WorkState): Promise<ListedWork[]> {
    return this.#blocked.workList(state);
  }

  /** Is this enquiry open, and if not, how did it close? */
  async enquiryStatus(enquiry: EnquiryRef): Promise<EnquiryStatus> {
    return this.#story.enquiryStatus(enquiry);
  }

  /** What a re-run did and did not establish. */
  async reproductionOf(verification: AnalysisRef): Promise<ReproductionReport> {
    return this.#story.reproductionOf(verification);
  }

  /** An interpretation and every narrowing behind it, oldest first. */
  async interpretationHistory(claim: ClaimRef): Promise<InterpretationHistory> {
    return this.#story.interpretationHistory(claim);
  }

  /** Whether two findings actually conflict. */
  async doTheseConflict(a: ClaimRef, b: ClaimRef): Promise<ConflictVerdict> {
    return this.#story.doTheseConflict(a, b);
  }

  /** "Why does this conclusion count as supported?" and "what did the superseded inference claim?" */
  async whySupported(claim: ClaimRef): Promise<SupportExplanation> {
    return this.#story.whySupported(claim);
  }

  /** How much of a past construction can be rebuilt. */
  async reproducibilityOf(
    analysis: AnalysisRef,
    rebuilt: Array<{ part: ObservationsRef; hash: IdentityString }>,
  ): Promise<ReproducibilityReport> {
    return this.#story.reproducibilityOf(analysis, rebuilt);
  }

  /** What is affected if this artefact turns out to be wrong? */
  async whatDependsOn(subject: IndexedString | ObservationsRef): Promise<DependencyReport> {
    return this.#story.whatDependsOn(subject);
  }

  /** One condition: what it requires, what has been said about it, and what it holds up. */
  async criterionStanding(criterion: CriterionRef): Promise<CriterionStanding> {
    return this.#explain.criterionStanding(criterion);
  }

  /** What an analysis revised, and which findings moved. */
  async analysisRevision(analysis: AnalysisRef): Promise<AnalysisRevision> {
    return this.#explain.analysisRevision(analysis);
  }

  /**
   * `enquiryStatus`, alongside where this enquiry's own question sits in the
   * overall survey. See `./explain.ts`'s `enquiryInContext` for why this is a
   * function taking the composed surface rather than a group method: it reads
   * both `enquiryStatus` (`./story.ts`) and `whatIsKnown` (`./standing.ts`).
   */
  async enquiryInContext(enquiry: EnquiryRef): Promise<EnquiryInContext> {
    return enquiryInContextOf(this, enquiry);
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
 * new machinery, and it reads what `DomainEvent` already carries (`subject`
 * and `changes`), adding no query of its own.
 */
function touchedHandles(events: readonly DomainEvent[]): Set<string> {
  const touched = new Set<string>();
  for (const e of events) {
    touched.add(e.subject);
    for (const change of e.changes) {
      if (change.change === "EdgeCreated") {
        touched.add(change.from);
        touched.add(change.to);
      } else {
        touched.add(change.id);
      }
    }
  }
  return touched;
}
