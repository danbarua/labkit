/**
 * The temporal seam.
 *
 * Every state-changing domain operation flows through one choke point that
 * stamps it with a time and records what it did. This exists now, before any
 * scenario forces it, because the hard part to retrofit is the API discipline
 * — once callers can mutate research state without leaving a temporal trace,
 * questions like "what evidence existed when this decision was amended?"
 * (S-7) or "what was the state of knowledge when this question was
 * sharpened?" (S-1) become unanswerable for everything already recorded.
 *
 * Where these events durably live is still not decided, and the trigger that
 * was supposed to decide it has now been tested and did not fire.
 *
 * PJ-009 named S-1 and S-7 as the first real consumers of durable chronology.
 * Both were built. Both answer their hardest historical question — "what was
 * known when this question was sharpened?", "which amendment happened first?"
 * — from durable graph state, each asserted with a second reader whose event
 * log is provably empty. `sharpen()` freezes the findings an act was taken in
 * light of; `SUPERSEDES` orders one design's amendments structurally. Neither
 * needed a log.
 *
 * The successor trigger, stated so the next reader can check it rather than
 * assume it: a store is earned when a scenario needs an ordering between two
 * decisions that share no supersession chain — row Z's residue — and cannot
 * get it from graph state. Natural-id allocation order is not an answer; ids
 * happen to be issued in sequence, which is an accident of the sequence and
 * not a modelled fact.
 *
 * When that does happen, the answer is still **in memory**. The only consumer
 * of this layer is the test suite, so persistence and dispatch are decided
 * after the scenario corpus is complete, not before. An earned store gets an
 * implementation behind `EventSink` and its own test file, separate from the
 * scenarios — that suite becomes the specification a later PGlite-backed
 * implementation has to satisfy, and its shape is whatever the domain turns
 * out to require. `inMemoryEventLog()` below is therefore a decision, not an
 * unfinished edge.
 *
 * **A second trigger now stands beside that one, and it is nearer.** Time was
 * one aspect of a command's execution context; who ran it is another, and
 * `AttributionContext` below records it. Attribution is *written* here and read
 * by nothing — the shape CLAUDE.md calls dead code after PJ-007's
 * `buildAsClause`. It ships that way deliberately, and the trigger is a
 * consumer asking who did something: an audit read, a "what has this session
 * been doing" report, an MCP notification. Until one exists, attribution
 * reaches the end of this process and stops. See PJ-031.
 */

/** Injected so scenario tests can assert on exact timestamps instead of racing the wall clock. */
export interface Clock {
  now(): string;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

/**
 * Who ran a command, and from what code state.
 *
 * Three fields, and each answers a different question a reader of the record
 * actually asks. `attribution_label` is for a human scanning ("claude-opus-5",
 * "dan"); `attribution_id` is the stable handle two events can be compared on,
 * because labels collide and get renamed; `git_hash` is the code the command
 * ran against, which is the difference between "this was decided" and "this was
 * decided by a version that had the bug".
 *
 * Empty strings rather than optional fields: an unattributed command should
 * say so — see {@link UNATTRIBUTED} — rather than arrive with the question
 * unasked. A missing key and a known-absent value read the same at a call site
 * and mean different things.
 */
export interface AttributionContext {
  attribution_label: string;
  attribution_id: string;
  /**
   * Required, not optional, and required on the **write** side specifically.
   *
   * A writer that could omit this would be a writer whose grade nobody
   * recorded, which is the state this field exists to end. The read side is
   * where `null` is possible — see `DomainEvent`, and the column comment in
   * `src/db/schema.ts` for the one thing that produces it.
   */
  attribution_how: AttributionHow;
  git_hash: string;
}

/**
 * How LabKit came by the actor's name — the grade of the claim, not the claim.
 *
 * **The record could not tell an observation from an assertion**, and that is
 * what this exists for. Measured on `main` at `427fa7f`: `labkit pose` and
 * `labkit --author dan pose` wrote **byte-identical** attribution, one read off
 * the operating system and one taken from whoever typed it. The field was
 * populated and uniform while the underlying facts differed, so a reader
 * trusting both equally was misled about exactly one and could not tell which.
 *
 * That is not an *empty* answer, which is the distinction PJ-011 §5 turns on: a
 * missing feature manufactures an empty result, and only a confidently wrong
 * one shows the model claiming something it cannot support.
 *
 * | | means | producers |
 * | --- | --- | --- |
 * | `observed` | this process looked | `personContext()` with no override, reading the OS |
 * | `claimed` | a caller asserted it and LabKit stored it | `--author`, `register_session`, the MCP stub |
 * | `unattributed` | positively nobody — this ran unclaimed | {@link UNATTRIBUTED} |
 *
 * **Three values because three have producers.** `corroborated` — a party that
 * is not the caller vouching for the id — is the grade the `agent-bus whoami`
 * handshake would write, and it arrives with the code that writes it.
 * `no_handshake` is a real distinction and has no producer while the MCP write
 * gate refuses an unregistered write at all. Both are named on #81 and neither
 * is declared: a value nothing writes is one whose absence a reader cannot
 * interpret.
 *
 * **This is not authentication and grading it does not make it so.** A
 * `claimed` id is still whatever the caller said. What the grade buys is a
 * *precise* weak claim in place of a vague one — a dashboard can stop merging
 * "the OS said so" with "a script asserted this", which is a merge #81 warned
 * about before it had a name for it.
 */
export type AttributionHow = "observed" | "claimed" | "unattributed";

/**
 * Attribution as it comes back out of the store.
 *
 * Identical to {@link AttributionContext} but for the grade, which may be
 * `null` for a row written before 2026-08-28. Splitting the type is what stops
 * that `null` leaking backwards into the writers: if one type served both, a
 * writer could omit the grade and the field would mean nothing again.
 */
export type RecordedAttribution = Omit<AttributionContext, "attribution_how"> & {
  attribution_how: AttributionHow | null;
};

/**
 * What a command executes in.
 *
 * `Clock` was here first and alone, because PJ-009 §3 built the temporal seam
 * before a scenario forced it: the part that is hard to retrofit is the API
 * discipline, not the field. That argument was never specific to time. Once
 * callers can mutate research state without leaving a trace of *who*, "which
 * agent recorded this analysis?" is unanswerable for everything already
 * written, exactly as "what evidence existed when this was amended?" would have
 * been.
 *
 * So this is the temporal seam generalised one level, and the clock keeps its
 * name and position inside it. {@link ResearchSessionOptions} extends
 * `Partial<CommandContext>` rather than nesting it under a `ctx` key — nesting
 * would have moved 110 call sites across 38 files and changed no behaviour.
 */
export interface CommandContext {
  clock: Clock;
  attribution: AttributionContext;
}

/**
 * The attribution of a command nobody claimed.
 *
 * Named rather than written inline at the default, so it appears in an event
 * as a positive statement — *this ran unattributed* — instead of as three empty
 * strings a reader has to interpret. Every direct construction of a surface in
 * the test suite gets this, which is correct: a scenario is a research
 * conversation, not an agent doing work.
 */
export const UNATTRIBUTED: AttributionContext = {
  attribution_label: "unattributed",
  attribution_id: "",
  // The grade is its own value rather than an absence, for the reason the
  // label is: *this ran unattributed* is a positive statement, and a reader
  // meeting an empty field cannot tell it from one nobody filled in.
  attribution_how: "unattributed",
  git_hash: "",
};

/**
 * The verb an event records — one name per public write verb, and the same name.
 *
 * **Not a hand-kept copy of the verb list.** Checked when this was written: the
 * eighteen `emit` operations and the eighteen public verbs on `WriteSurface` are
 * the same eighteen strings, because CLAUDE.md requires it — *"a verb that
 * composes others records **one** event, not one per step"*, and that one event
 * is named for the act the researcher took. `openEnquiry` is `pose` + `pursue`
 * and emits only `openEnquiry`.
 *
 * Written as a union rather than `string` so a typo is a compile error.
 * `this.emit("recordAnalyis", …)` used to compile and would have written an
 * event nobody could ever filter for.
 */
export type Operation =
  | "pose"
  | "pursue"
  | "openEnquiry"
  | "sharpen"
  | "recordObservations"
  | "recordAnalysis"
  | "recordReview"
  | "closeEnquiry"
  | "planWork"
  | "stateCriterion"
  | "declareGate"
  | "evaluateCriterion"
  | "reverify"
  | "acceptAsUnresolved"
  | "promote"
  | "amendDesign"
  | "replaceAnalysis"
  | "reinterpret";

/**
 * One recorded domain operation. `subject` is the natural id of whatever the
 * operation was primarily about; `detail` carries the operation-specific
 * payload a later query would need to reconstruct what happened.
 */
export interface DomainEvent {
  /**
   * Position in this tenant's stream — **assigned by the store, so absent until
   * one has it.**
   *
   * Optional for that reason and no other: an event on its way to a sink has no
   * position yet, and `inMemoryEventLog()` never gives it one because a process
   * -lifetime array has nothing to number. Anything read back out of
   * `pgEventLog()` has it.
   *
   * It is the stream's order, not `at`. A frozen clock — which most of the
   * suite runs — stamps every event in a scenario with one instant, and this
   * file already refuses natural-id allocation order as "an accident of the
   * sequence and not a modelled fact". A sequence on the event table is that
   * modelled fact.
   */
  seq?: number;
  at: string;
  /**
   * Required, not optional, and that is the enforcement.
   * `WriteSurface.emit` is the only caller of `record`, so a required field
   * means the type system — not a convention — is what stops an event reaching
   * the sink without saying who caused it.
   *
   * **`attribution_how` is nullable here and required on the write side**, and
   * the two are not the same type by accident. A writer that could omit the
   * grade is the state the field exists to end; a *reader* meets rows written
   * before the column existed, whose grade is genuinely unknown. `null` says
   * that and nothing else — see the column comment in `src/db/schema.ts`.
   */
  attribution: RecordedAttribution;
  operation: Operation;
  subject: string;
  /**
   * Every handle this act minted.
   *
   * `subject` says what the act was *about*; this says what came into
   * existence, and for most verbs they differ. Six verbs mint a `Decision` and
   * only `amendDesign` names that decision as its subject — the others name the
   * enquiry or the claim, because that is what the researcher was doing. So
   * "which act created this record?" is answerable from here and not from
   * `subject`.
   *
   * Optional, and only because an event that predates the collector or comes
   * from a hand-built fixture has none. `WriteSurface.emit` always supplies it,
   * empty if the act minted nothing.
   */
  created?: readonly string[];
  detail?: Record<string, unknown>;
}

/**
 * What a caller wants out of the stream.
 *
 * Every field narrows; omitting all of them asks for everything. `since` is a
 * `seq`, not an instant — see {@link DomainEvent.seq} for why an instant cannot
 * order this stream.
 */
export interface EventFilter {
  /** Strictly after this `seq`. */
  since?: number;
  /** One agent's acts, by `attribution_id`. */
  by?: string;
  operation?: string;
  /** Acts about, or minting, this handle. */
  touching?: string;
  limit?: number;
}

/**
 * Where events go.
 *
 * **Asynchronous, which it was not until the store existed.** `record` returned
 * `void` while the only implementation pushed onto an array; a SQL insert
 * cannot, and pretending otherwise would mean either losing the write's errors
 * or letting an event land outside the transaction it belongs to.
 */
export interface EventSink {
  record(event: DomainEvent): Promise<void>;
  /** Everything recorded so far, oldest first. */
  all(): Promise<readonly DomainEvent[]>;
  /** The subset a caller asked for, oldest first. */
  select(filter: EventFilter): Promise<readonly DomainEvent[]>;
}

/**
 * Non-durable sink, and the only one — see this file's header. Every scenario
 * exercises the seam and none has needed the log to answer anything; every
 * historical question so far is answered from the graph.
 *
 * Stronger than it sounds, and asserted rather than asserted-about: the
 * scenarios that touch the log at all check that it is **empty** at the moment
 * a historical answer is read (S-1, S-7, S-11, S-12), which is what makes the
 * answer durable rather than replayed.
 *
 * No count here on purpose. It said "eight scenarios" through sixteen more —
 * a number in a comment is a maintenance claim nobody checks, and the argument
 * never needed one (PJ-028).
 */
export function inMemoryEventLog(): EventSink {
  const events: DomainEvent[] = [];
  const matches = (e: DomainEvent, f: EventFilter): boolean =>
    (f.since === undefined || (e.seq ?? 0) > f.since) &&
    (f.by === undefined || e.attribution.attribution_id === f.by) &&
    (f.operation === undefined || e.operation === f.operation) &&
    (f.touching === undefined ||
      e.subject === f.touching ||
      (e.created ?? []).includes(f.touching));
  return {
    record: async (event) => void events.push(event),
    all: async () => events,
    // Filtered in TypeScript, which is the whole difference between the two
    // sinks: this one holds every event it has ever seen, so `select` is a
    // `filter`, where `pgEventLog` turns the same shape into a WHERE clause.
    select: async (filter) => {
      const found = events.filter((e) => matches(e, filter));
      return filter.limit === undefined ? found : found.slice(0, filter.limit);
    },
  };
}
