/**
 * S-29: the measurement that made somebody ask, written down after they asked.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;

let tick = 0;
const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 8, 8, 11, tick++)).toISOString(),
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

const ASKS = "does the coating slow corrosion at temperature?";
const PROBE =
  "a throwaway run before any of this: 2shapes cc 0.160 against 0.062, MNIST_shapes 0.016 " +
  "against 0.143. Same code, opposite verdicts. Why the question exists, not evidence for it.";

describe("S-29: the note came after the question", () => {
  test("Afterward 1: a note written later can still say it is why the question was asked", async () => {
    const { question } = await session.pose({ question: ASKS });
    const { note } = await session.note({ text: PROBE, prompted: question });

    const origin = await (await afterwards()).originOf(question);
    expect(origin?.kind).toBe("noted");
    expect(origin?.from).toBe(note);
    expect(origin?.said).toBe(PROBE);
  });

  /**
   * The distinction the edge is for. `--on` says *this note is about that*; `--prompted` says
   * *this note is why that exists*, and a reader gets different words for them.
   */
  test("Afterward 2: `why` tells a note that prompted it from a note about it", async () => {
    const { question } = await session.pose({ question: ASKS });
    const { note: because } = await session.note({ text: PROBE, prompted: question });
    const { note: about } = await session.note({
      text: "the val split is 50 images",
      on: question,
    });

    const why = await (await afterwards()).why(question);
    const said = new Map(why.because.map((c) => [c.handle, c.wording]));
    expect(said.get(because)).toContain("was prompted by");
    expect(said.get(about)).toContain("has a note on it");
  });

  test("Afterward 3: the same note can do both, and each edge keeps its own reading", async () => {
    const { question } = await session.pose({ question: ASKS });
    const { note } = await session.note({ text: PROBE, on: question, prompted: question });

    const why = await (await afterwards()).why(question);
    const wordings = why.because.filter((c) => c.handle === note).map((c) => c.wording);
    expect(wordings.some((w) => w.includes("was prompted by"))).toBe(true);
    expect(wordings.some((w) => w.includes("has a note on it"))).toBe(true);
  });

  /**
   * A question has one origin. Two would leave a reader with two answers to *why was this
   * asked* and nothing saying which holds — the rule `stopWork` and `closeEnquiry` already
   * apply to an act that has already happened.
   */
  test("a question that was sharpened refuses a second origin, and says what it has", async () => {
    const { question: broad } = await session.pose({ question: "does the coating hold?" });
    const { question: sharp } = await session.sharpen({
      from: broad,
      into: ASKS,
      because: "at temperature is the part nobody measured",
    });

    await expect(session.note({ text: PROBE, prompted: sharp })).rejects.toThrow(
      /already came from/,
    );
  });

  test("a second note prompting one question is refused", async () => {
    const { question } = await session.pose({ question: ASKS });
    await session.note({ text: PROBE, prompted: question });

    await expect(
      session.note({ text: "another hunch entirely", prompted: question }),
    ).rejects.toThrow(/already came from/);
  });

  test("prompting a question nobody posed is refused, and the message says what to do", async () => {
    await expect(session.note({ text: PROBE, prompted: "Q_404" as never })).rejects.toThrow(
      /no question Q_404/,
    );
  });
});
