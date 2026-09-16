/**
 * The temporal seam.
 */

import type { EdgeCreated, GraphChange, NodeCreated, Prose, PropsChanged } from "../db/domain";
import type { Command } from "./commands";
import type { EventFilter } from "./queries";

export type { EventFilter };

export type { EdgeCreated, GraphChange, NodeCreated, PropsChanged };

/** Injected so scenario tests can assert on exact timestamps instead of racing the wall clock. */
export interface Clock {
  now(): string;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

/**
 * Who ran a command, and from what code state.
 */
export interface AttributionContext {
  attribution_label: string;
  attribution_id: string;
  /**
   * Required, not optional, and required on the **write** side specifically.
   */
  attribution_how: AttributionHow;
  /** The commit this act ran against, or `null` when that was not captured. */
  git_hash: string | null;
}

/**
 * How LabKit came by the actor's name — the grade of the claim, not the claim.
 */
export type AttributionHow = "observed" | "claimed" | "unattributed";

/**
 * Attribution as it comes back out of the store.
 */
export type RecordedAttribution = Omit<AttributionContext, "attribution_how"> & {
  attribution_how: AttributionHow | null;
};

/**
 * What a command executes in.
 */
export interface CommandContext {
  clock: Clock;
  attribution: AttributionContext;
  /**
   * What the act was read off, when it was not performed — a paper, a colleague's notebook, a
   * commit history. **The test is whether you did the work, not when you wrote it down**: your
   * own run, recorded a week later, was performed and takes nothing here. Absent means nobody
   * said, and not that anything was witnessed: no process can observe that a researcher watched
   * the work happen.
   */
  reconstructedFrom?: Prose;
}

/**
 * The attribution of a command nobody claimed.
 */
export const UNATTRIBUTED: AttributionContext = {
  attribution_label: "unattributed",
  attribution_id: "",
  // The grade is its own value rather than an absence, for the reason the
  // label is: *this ran unattributed* is a positive statement, and a reader
  // meeting an empty field cannot tell it from one nobody filled in.
  attribution_how: "unattributed",
  git_hash: null,
};

/**
 * One recorded domain operation: the command that was issued, and every change
 * it made. `subject` is the natural id of whatever the operation was primarily
 * about.
 */
export interface DomainEvent {
  /**
   * Position in this tenant's stream — **assigned by the store, so absent until one has it.**
   */
  seq?: number;
  at: string;
  /**
   * Required, not optional, and that is the enforcement. `WriteSurface.emit` is the only caller
   * of `record`, so a required field means the type system — not a convention — is what stops
   * an event reaching the sink without saying who caused it.
   */
  attribution: RecordedAttribution;
  /**
   * The verb this event records.
   */
  operation: string;
  subject: string;
  /** Every change this act made to the graph, in the order it made them. */
  changes: readonly GraphChange[];
  /**
   * What the caller asked for, verbatim.
   */
  command: Command;
  /**
   * What this act was read off, or `null` if nobody said. See {@link CommandContext}.
   */
  reconstructedFrom: Prose | null;
}

/** What `domainEvent` needs: an act, minus the two fields it defaults. */
type EventFields = Omit<DomainEvent, "changes" | "reconstructedFrom"> &
  Partial<Pick<DomainEvent, "changes" | "reconstructedFrom">>;

/**
 * Builds a `DomainEvent`, defaulting `changes` to empty. Given a `seq` it hands
 * back a {@link RecordedEvent}, so a fixture built with one is the same type a
 * sink returns.
 */
export function domainEvent(fields: EventFields & { seq: number }): RecordedEvent;
export function domainEvent(fields: EventFields): DomainEvent;
export function domainEvent(fields: EventFields): DomainEvent {
  return {
    ...fields,
    changes: fields.changes ?? [],
    // An empty source is not a source. Left as `""` it passes the
    // `reconstructed` filter, which tests for non-null, and fails the view,
    // which tests for text — one act counted as sourced and rendered as
    // unsourced.
    reconstructedFrom: fields.reconstructedFrom || null,
  };
}

/** Every handle an act created. */
export const createdIn = (event: DomainEvent): string[] =>
  event.changes.flatMap((c) => (c.change === "NodeCreated" ? [c.id] : []));

/** Every edge an act created. */
export const edgesIn = (event: DomainEvent): EdgeCreated[] =>
  event.changes.flatMap((c) => (c.change === "EdgeCreated" ? [c] : []));

/**
 * Every handle an act touched: what it minted, both ends of every edge it
 * wired, and anything whose properties it changed.
 *
 * Wider than {@link createdIn} on purpose. `touching` is asked as "what
 * happened to this record", and the acts that connected to a handle, or set a
 * property on it, never name it as their subject and never mint it.
 */
export const touchedIn = (event: DomainEvent): string[] => [
  ...new Set(
    event.changes.flatMap((c) =>
      c.change === "NodeCreated" ? [c.id] : c.change === "EdgeCreated" ? [c.from, c.to] : [c.id],
    ),
  ),
];

/** Every handle an act retracted. `undo` writes these and nothing else. */
export const retractedIn = (event: DomainEvent): string[] =>
  event.changes.flatMap((c) =>
    c.change === "PropsChanged" && (c.props as { retracted?: boolean }).retracted === true
      ? [c.id]
      : [],
  );

/**
 * An event a sink has taken: the same act, and now with its position.
 *
 * `seq` is optional on the way in because the caller cannot know it, and
 * present on the way out because assigning it is what a sink does. Readers
 * that took `DomainEvent` were carrying a fallback for an act no sink can
 * return.
 */
export type RecordedEvent = DomainEvent & { seq: number };

/**
 * Where events go.
 */
export interface EventSink {
  /** Returns the stored event, `seq` included -- the caller built one without it. */
  record(event: DomainEvent): Promise<RecordedEvent>;
  /** Everything recorded so far, oldest first. */
  all(): Promise<readonly RecordedEvent[]>;
  /** The subset a caller asked for, oldest first. */
  select(filter: EventFilter): Promise<readonly RecordedEvent[]>;
}

/**
 * Non-durable sink, and the only one — see this file's header. Every scenario exercises the
 * seam and none has needed the log to answer anything; every historical question so far is
 * answered from the graph.
 */
export function inMemoryEventLog(): EventSink {
  const events: RecordedEvent[] = [];
  // **Numbered, because `matches` below reads `(e.seq ?? 0) > f.since`.** Leaving it undefined
  // scores every event 0, so `select({since})` returns nothing for every value of `since` while
  // `pgEventLog` answers the same filter correctly: two sinks behind one interface,
  // disagreeing.
  let n = 0;
  const matches = (e: RecordedEvent, f: EventFilter): boolean =>
    (f.since === undefined || e.seq > f.since) &&
    (f.by === undefined || e.attribution.attribution_id === f.by) &&
    (f.operation === undefined || e.operation === f.operation) &&
    (f.reconstructed === undefined || (e.reconstructedFrom !== null) === f.reconstructed) &&
    (f.touching === undefined || e.subject === f.touching || touchedIn(e).includes(f.touching));
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
