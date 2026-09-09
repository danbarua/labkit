import { optional, vertexProps } from "../../db/cypher";
import { SessionCore } from "../core";
import { ref } from "../report";
import type { DomainEvent, EventFilter } from "../events";
import type { AnyRef, EventPage, ListedNote, Transcription } from "../report";

/** The number in a handle, for ordering ids minted in sequence. */
const numberIn = (handle: string): number => Number(handle.slice(handle.indexOf("_") + 1)) || 0;

export class HappenedGroup extends SessionCore {
  /**
   * What was done, in order — the one read that answers from the event log rather than the
   * graph.
   */
  async whatHappened(filter: EventFilter = {}): Promise<readonly DomainEvent[]> {
    return this.events.select(filter);
  }

  /**
   * The same acts, and whether that was all of them. A caller filtering the result of a limited
   * read — `.seq > 52` over a default page of 50 — gets an empty answer from a full page and
   * cannot tell it from an empty record.
   */
  async whatHappenedPage(filter: EventFilter = {}): Promise<EventPage> {
    if (filter.limit === undefined) {
      const acts = await this.events.select(filter);
      return { acts, more: false };
    }
    // One past the limit, then dropped: exact rather than inferred from
    // `length === limit`, which calls a page that happens to end on the
    // boundary truncated.
    const overshot = await this.events.select({ ...filter, limit: filter.limit + 1 });
    return { acts: overshot.slice(0, filter.limit), more: overshot.length > filter.limit };
  }

  /**
   * Every note on the record, newest first — what each says, what it concerns, and the question
   * it prompted where it prompted one. `search` reaches a note only by words somebody already
   * remembers; this is the read for the ones nobody does.
   */
  async notes(): Promise<ListedNote[]> {
    const rows = await this.graph.query(
      `MATCH (n:Note)
       OPTIONAL MATCH (n)-[:CONCERNS]->(about)
       OPTIONAL MATCH (n)-[:MOTIVATES]->(q:Question)
       RETURN n, about, q`,
      {
        n: vertexProps<{ natural_id: string; text: string }>(),
        about: optional(vertexProps<{ natural_id: string }>()),
        q: optional(vertexProps<{ natural_id: string }>()),
      },
      {},
    );
    // Folded by id: a note concerning one thing and prompting another arrives
    // as two rows, and AGE returns them in no order of its own.
    const byId = new Map<string, ListedNote>();
    for (const row of rows) {
      const id = row.n.natural_id;
      const found = byId.get(id) ?? { note: ref("note", id), says: row.n.text, concerns: [] };
      const about = row.about?.natural_id;
      if (about && !found.concerns.includes(about as AnyRef)) found.concerns.push(about as AnyRef);
      if (row.q) found.prompted = ref("question", row.q.natural_id);
      byId.set(id, found);
    }
    // Newest first, by the id's own number — notes carry no timestamp of their
    // own, and the natural id is minted in order.
    return [...byId.values()].sort((a, b) => numberIn(b.note) - numberIn(a.note));
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
