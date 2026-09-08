import { SessionCore } from "../core";
import type { DomainEvent, EventFilter } from "../events";
import type { Transcription } from "../report";

export class HappenedGroup extends SessionCore {
  /**
   * What was done, in order — the one read that answers from the event log rather than the
   * graph.
   */
  async whatHappened(filter: EventFilter = {}): Promise<readonly DomainEvent[]> {
    return this.events.select(filter);
  }

  /**
   * How much of the record was read off something rather than performed.
   */
  async howMuchWasTranscribed(): Promise<Transcription> {
    const all = await this.events.all();
    return {
      transcribed: all.filter((e) => e.reconstructedFrom !== null).length,
      acts: all.length,
    };
  }
}
