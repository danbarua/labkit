/**
 * S-28: where a question came from, when it came from a note.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;

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
  session = new ResearchSession(await scenario.begin(), { clock });
});
afterEach(async () => {
  await scenario.end();
});

const afterwards = async () => new ResearchSession(await scenario.current(), { clock });

const HUNCH = "something about how the edge is handled matters — I keep seeing it";
const SHARP = "does the edge padding change the reconstruction error?";

describe("S-28: a hunch became a question", () => {
  test("Afterward 1: the question says which note it came out of", async () => {
    const { note } = await session.note({ text: HUNCH });
    const { question } = await session.pose({ question: SHARP, from: note });

    const origin = await (await afterwards()).originOf(question);
    expect(origin?.kind).toBe("noted");
    expect(origin?.from).toBe(note);
    // The note's own words, not a restatement: a hunch is worth reading back
    // exactly as it was written down.
    expect(origin?.said).toBe(HUNCH);
  });

  test("Afterward 2: opening an enquiry from a hunch keeps it too", async () => {
    const { note } = await session.note({ text: HUNCH });
    const { question } = await session.openEnquiry(SHARP, note);

    // The compound act records what the primitive would have. Otherwise the
    // common case is the one that loses the provenance.
    const origin = await (await afterwards()).originOf(question);
    expect(origin?.kind).toBe("noted");
    expect(origin?.from).toBe(note);
  });

  test("Afterward 3: a sharpened question still reads as sharpened", async () => {
    const { question: broad } = await session.pose({ question: "does the edge matter?" });
    const { question: sharp } = await session.sharpen({
      from: broad,
      into: SHARP,
      because: "which edge, and measured how",
    });

    const origin = await (await afterwards()).originOf(sharp);
    expect(origin?.kind).toBe("sharpened");
    expect(origin?.from).toBe(broad);
    expect(origin?.said).toBe("does the edge matter?");
    expect(origin?.reason).toBe("which edge, and measured how");
  });

  test("Afterward 4: a question asked outright still has no origin", async () => {
    const { question } = await session.pose({ question: SHARP });
    expect(await (await afterwards()).originOf(question)).toBeNull();
  });

  test("Afterward 5: `why` on the question names the note that prompted it", async () => {
    const { note } = await session.note({ text: HUNCH });
    const { question } = await session.pose({ question: SHARP, from: note });

    // The generic walk, not a second special-cased read: the edge is one the
    // existing reader already renders, and this is the check that it does.
    const why = await (await afterwards()).why(question);
    expect(why.because).toEqual([{ handle: note, wording: `was prompted by ${HUNCH}` }]);
  });

  test("posing from a note nobody wrote is refused, and the message says what to do", async () => {
    await expect(session.pose({ question: SHARP, from: "NOTE_404" as never })).rejects.toThrow(
      /no note NOTE_404/,
    );
  });
});
