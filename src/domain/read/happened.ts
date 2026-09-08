import { SessionCore } from "../core";
import type { DomainEvent, EventFilter } from "../events";

export class HappenedGroup extends SessionCore {
  /**
   * What was done, in order — the one read that answers from the event log rather than the
   * graph.
   */
  async whatHappened(filter: EventFilter = {}): Promise<readonly DomainEvent[]> {
    return this.events.select(filter);
  }
}
