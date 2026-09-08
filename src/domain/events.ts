/**
 * The temporal seam.
 */

import type { EdgeCreated, GraphChange, NodeCreated, Prose, PropsChanged } from "../db/domain";
import type { Command } from "./commands";

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
  git_hash: string;
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
  git_hash: "",
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

/** Builds a `DomainEvent`, defaulting `changes` to empty. */
export function domainEvent(
  fields: Omit<DomainEvent, "changes" | "reconstructedFrom"> &
    Partial<Pick<DomainEvent, "changes" | "reconstructedFrom">>,
): DomainEvent {
  return {
    ...fields,
    changes: fields.changes ?? [],
    reconstructedFrom: fields.reconstructedFrom ?? null,
  };
}

/** Every handle an act created. */
export const createdIn = (event: DomainEvent): string[] =>
  event.changes.flatMap((c) => (c.change === "NodeCreated" ? [c.id] : []));

/** Every edge an act created. */
export const edgesIn = (event: DomainEvent): EdgeCreated[] =>
  event.changes.flatMap((c) => (c.change === "EdgeCreated" ? [c] : []));

/**
 * What a caller wants out of the stream.
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
 * Non-durable sink, and the only one — see this file's header. Every scenario exercises the
 * seam and none has needed the log to answer anything; every historical question so far is
 * answered from the graph.
 */
export function inMemoryEventLog(): EventSink {
  const events: DomainEvent[] = [];
  // **Numbered, because `matches` below reads `(e.seq ?? 0) > f.since`.** Leaving it undefined
  // scores every event 0, so `select({since})` returns nothing for every value of `since` while
  // `pgEventLog` answers the same filter correctly: two sinks behind one interface,
  // disagreeing.
  let n = 0;
  const matches = (e: DomainEvent, f: EventFilter): boolean =>
    // `?? 0` survives for a hand-built fixture that never went through
    // `record` — every event this sink stores has a `seq`.
    (f.since === undefined || (e.seq ?? 0) > f.since) &&
    (f.by === undefined || e.attribution.attribution_id === f.by) &&
    (f.operation === undefined || e.operation === f.operation) &&
    (f.touching === undefined || e.subject === f.touching || createdIn(e).includes(f.touching));
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
