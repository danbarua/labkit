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
  return {
    record: (event) => void events.push(event),
    all: () => events,
  };
}
