/**
 * S-28: where a question came from, when it came from a note.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

let tick = 0;
const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 8, 8, 9, tick++)).toISOString(),
};

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  tick = 0;
  events = inMemoryEventLog();
  session = new ResearchSession(await scenario.begin(), {
    clock,
    events,
    attribution: as("Researcher"),
  });
});
afterEach(async () => {
  await scenario.end();
});

const afterwards = async () => new ResearchSession(await scenario.current(), { clock });

const HUNCH = "something about how the edge is handled matters — I keep seeing it";
const SHARP = "does the edge padding change the reconstruction error?";

describe("S-28: a hunch became a question", () => {
  test("Afterward 1: `why` on the question names the note it came out of", async () => {
    const { note } = await session.writes.note({ text: HUNCH });
    const { question } = await session.writes.pose({ question: SHARP, from: note });

    // The note's own words, not a restatement: a hunch is worth reading back
    // exactly as it was written down.
    const why = await (await afterwards()).reads.why({ subject: question });
    expect(why.because).toEqual([{ handle: note, wording: `was prompted by ${HUNCH}` }]);

    await captureConversation(
      {
        id: "S-28",
        title: "A hunch became a question",
        about:
          "A vague hunch is written down, later sharpens into a precise question, and the question still says which note it came out of.",
      },
      events,
    );
  });

  test("Afterward 2: opening an enquiry from a hunch keeps it too", async () => {
    const { note } = await session.writes.note({ text: HUNCH });
    const { question } = await session.writes.openEnquiry(SHARP, note);

    // The compound act records what the primitive would have. Otherwise the
    // common case is the one that loses the provenance.
    const why = await (await afterwards()).reads.why({ subject: question });
    expect(why.because).toContainEqual({ handle: note, wording: `was prompted by ${HUNCH}` });
  });

  test("Afterward 3: a question asked outright names no origin", async () => {
    const { question } = await session.writes.pose({ question: SHARP });
    const why = await (await afterwards()).reads.why({ subject: question });
    expect(why.because).toEqual([]);
  });

  test("posing from a note nobody wrote is refused, and the message says what to do", async () => {
    await expect(
      session.writes.pose({ question: SHARP, from: "NOTE_404" as never }),
    ).rejects.toThrow(/NOTE_404 not found/);
  });
});
