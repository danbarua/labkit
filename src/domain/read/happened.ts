import { SessionCore } from "../core";
import type { DomainEvent, EventFilter } from "../events";

export class HappenedGroup extends SessionCore {
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
}
