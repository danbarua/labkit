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
 * What is deliberately NOT decided yet: where these events durably live. A
 * relational table and a graph label are both plausible, and S-11 — the
 * scenario driving this build — answers all five of its questions from the
 * graph alone. The first real consumer of durable chronology is S-1/S-7, so
 * the sink stays an interface until one of those needs it.
 */

/** Injected so scenario tests can assert on exact timestamps instead of racing the wall clock. */
export interface Clock {
  now(): string;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

/**
 * One recorded domain operation. `subject` is the natural id of whatever the
 * operation was primarily about; `detail` carries the operation-specific
 * payload a later query would need to reconstruct what happened.
 */
export interface DomainEvent {
  at: string;
  operation: string;
  subject: string;
  detail?: Record<string, unknown>;
}

export interface EventSink {
  record(event: DomainEvent): void;
  /** Everything recorded so far, oldest first. */
  all(): readonly DomainEvent[];
}

/**
 * Non-durable sink. Adequate for S-11, which needs the seam exercised rather
 * than persisted — see this file's header for why the durable sink is still
 * an open decision.
 */
export function inMemoryEventLog(): EventSink {
  const events: DomainEvent[] = [];
  return {
    record: (event) => void events.push(event),
    all: () => events,
  };
}
