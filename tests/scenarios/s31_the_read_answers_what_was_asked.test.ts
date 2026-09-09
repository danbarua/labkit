/**
 * S-31: three reads that succeeded and told the caller nothing.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;

let tick = 0;
const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 8, 9, 12, tick++)).toISOString(),
};

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  tick = 0;
  session = new ResearchSession(await scenario.begin(), { clock, events: inMemoryEventLog() });
});
afterEach(async () => {
  await scenario.end();
});

const afterwards = async () => new ResearchSession(await scenario.current(), { clock });

describe("S-31: the read answers what was asked", () => {
  /**
   * `close` returned only the decision it minted. A caller scripting it could not tell a
   * success from a no-op without a second read — the rule the repo already applies to every
   * verb that mints something, applied to its return type.
   */
  test("closing names the enquiry, the question and which kind of close it was", async () => {
    const { enquiry } = await session.openEnquiry("does the coating slow corrosion?");
    const closed = await session.closeEnquiry({ enquiry });

    expect(closed.enquiry).toBe(enquiry);
    expect(closed.question).toMatch(/^Q_/);
    expect(closed.closure).toBe("abandoned");
    expect(closed.answered).toBeUndefined();
  });

  test("a close with a result behind it says so, and names the claim", async () => {
    const { enquiry } = await session.openEnquiry("does the coating slow corrosion?");
    const { analysis } = await session.recordAnalysis({
      enquiry,
      method: "a salt-spray run",
      from: [],
    });
    const concluded = await session.conclude({
      analysis,
      finding: "no pitting at 500 hours",
      proposition: "the coating slows corrosion",
      bearing: "supports",
    });
    const claim = concluded.claims[0]!.claim;

    const closed = await session.closeEnquiry({ enquiry, answeredBy: claim });
    expect(closed.closure).toBe("answered");
    expect(closed.answered?.claim).toBe(claim);
    expect(closed.answered?.asserts).toBe("the coating slows corrosion");
  });

  /**
   * The bug as it was hit: a filter over the result of a limited read. A full page and an empty
   * record produce the same empty answer, and nothing said which this was.
   */
  test("a page that is not the whole answer says so", async () => {
    for (let i = 0; i < 4; i++) await session.pose({ question: `question ${i}` });
    // This session, not a second reader: the event log is per-session here, and
    // a fresh one would be empty by design.
    const later = session;

    const page = await later.whatHappenedPage({ limit: 2 });
    expect(page.acts).toHaveLength(2);
    expect(page.more).toBe(true);

    // The boundary: exactly as many acts as the limit, and no more behind them.
    expect((await later.whatHappenedPage({ limit: 4 })).more).toBe(false);
    // No limit at all is always the whole answer.
    expect((await later.whatHappenedPage({})).more).toBe(false);
  });

  /**
   * `search` reaches a note only by words somebody already remembers, and `why <handle>` shows
   * the ones attached to that handle. A note attached to nothing was unreachable.
   */
  test("every note is listable, with what it concerns and what it prompted", async () => {
    const { note: loose } = await session.note({ text: "the val split is the first 50 images" });
    const { question } = await session.pose({ question: "does the edge padding matter?" });
    const { note: why } = await session.note({
      text: "a throwaway run: cc 0.160 against 0.062",
      prompted: question,
    });
    const { note: about } = await session.note({ text: "seeds 1..10", on: question });

    const listed = await (await afterwards()).notes();
    // Newest first.
    expect(listed.map((n) => n.note)).toEqual([about, why, loose]);

    const byId = new Map(listed.map((n) => [n.note, n]));
    expect(byId.get(loose)!.concerns).toEqual([]);
    expect(byId.get(loose)!.prompted).toBeUndefined();
    expect(byId.get(why)!.prompted).toBe(question);
    expect(byId.get(about)!.concerns).toEqual([question]);
    expect(byId.get(about)!.prompted).toBeUndefined();
  });
});
