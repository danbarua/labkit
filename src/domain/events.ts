/**
 * The temporal seam.
 *
 * Every state-changing domain operation flows through one choke point that
 * stamps it with a time and records what it did. The hard part to retrofit is
 * the API discipline rather than the field: once callers can mutate research
 * state without leaving a temporal trace, *what evidence existed when this
 * decision was amended?* is unanswerable for everything already recorded.
 *
 * **The graph, not this log, answers what is true now.** Both of the hardest
 * historical questions the corpus asks — what was known when a question was
 * sharpened, which amendment happened first — are answered from durable graph
 * state, each asserted with a second reader whose event log is provably empty.
 * `sharpen()` freezes the findings an act was taken in light of; `SUPERSEDES`
 * orders one design's amendments structurally.
 *
 * Attribution is the other aspect of a command's execution context, recorded by
 * `AttributionContext` below.
 */

import type { MintedEdge, MintedNode, PropertySet } from "../db/domain";

export type { MintedEdge, MintedNode, PropertySet };

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
 * That is not an *empty* answer: a missing field manufactures an empty result,
 * where this is the record claiming something it cannot support.
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
 * Time and attribution both, for the same reason: the part that is hard to
 * retrofit is the API discipline, not the field. Once callers can mutate
 * research state without leaving a trace of *who*, "which agent recorded this
 * analysis?" is unanswerable for everything already written, exactly as "what
 * evidence existed when this was amended?" would have
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
 * One recorded domain operation. `subject` is the natural id of whatever the
 * operation was primarily about; `detail` carries the operation-specific
 * payload a later query would need to reconstruct what happened.
 */
export interface DomainEvent {
  /**
   * Position in this tenant's stream — **assigned by the store, so absent until
   * one has it.**
   *
   * Optional because an event *on its way to* a sink has no position yet —
   * `EventSink.record` takes one without a `seq` and the store assigns it.
   * Anything read back out of either sink has one.
   *
   * **Both sinks must assign it.** The filter below reads `(e.seq ?? 0)`, so a
   * sink that leaves it undefined scores every event 0 and `select({since})`
   * returns nothing for every value, while the other answers correctly.
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
  /**
   * The verb this event records.
   *
   * **A string, because that is what the record holds** — it comes back out of
   * Postgres as one, and nothing on the read side narrows on it. The set of
   * valid names is `Operation` in `./write.ts`, derived from the surface, and
   * it does its work at the point of emission where a typo would otherwise
   * write an event nobody can filter for.
   */
  operation: string;
  subject: string;
  /**
   * Every node this act created, with everything needed to create it again.
   *
   * `subject` says what the act was *about*; this says what came into
   * existence, and for most verbs they differ.
   */
  created: readonly MintedNode[];
  /** Every edge this act created. */
  edges: readonly MintedEdge[];
  /**
   * Every property this act set in place, on a node it did not create.
   *
   * `is` sets `Claim.kind` and writes no node and no edge, so without this the
   * delta cannot reproduce a record in which anything was ever confirmed.
   */
  sets: readonly PropertySet[];
  detail?: Record<string, unknown>;
}

/** Builds a `DomainEvent`, defaulting the three delta lists to empty. */
export function domainEvent(
  fields: Omit<DomainEvent, "created" | "edges" | "sets"> &
    Partial<Pick<DomainEvent, "created" | "edges" | "sets">>,
): DomainEvent {
  return {
    ...fields,
    created: fields.created ?? [],
    edges: fields.edges ?? [],
    sets: fields.sets ?? [],
  };
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
  /** Returns the stored event, `seq` included -- the caller built one without it. */
  record(event: DomainEvent): Promise<DomainEvent>;
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
 * Asserted rather than asserted-about: the scenarios that touch the log check
 * it is **empty** at the moment a historical answer is read, which is what
 * makes the answer durable rather than replayed.
 */
export function inMemoryEventLog(): EventSink {
  const events: DomainEvent[] = [];
  // **Numbered, because `matches` below reads `(e.seq ?? 0) > f.since`.**
  // Leaving it undefined scores every event 0, so `select({since})` returns
  // nothing for every value of `since` while `pgEventLog` answers the same
  // filter correctly: two sinks behind one interface, disagreeing.
  //
  // Per-sink and gapless, where Postgres's is a `bigserial` shared across
  // tenants and therefore gappy within one. Neither property matters to the
  // only thing `seq` is used for: it is a cursor, and monotonic is the whole
  // requirement.
  let n = 0;
  const matches = (e: DomainEvent, f: EventFilter): boolean =>
    // `?? 0` survives for a hand-built fixture that never went through
    // `record` — every event this sink stores has a `seq`.
    (f.since === undefined || (e.seq ?? 0) > f.since) &&
    (f.by === undefined || e.attribution.attribution_id === f.by) &&
    (f.operation === undefined || e.operation === f.operation) &&
    (f.touching === undefined ||
      e.subject === f.touching ||
      e.created.some((n) => n.id === f.touching));
  return {
    // Copied rather than mutated: `WriteSurface.emit` builds the object and
    // still holds it, and a sink that writes back into its caller's argument is
    // a surprise nobody asked for.
    record: async (event) => {
      const stored = { ...event, seq: ++n };
      events.push(stored);
      return stored;
    },
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
