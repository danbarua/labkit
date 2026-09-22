/**
 * S-30: a prespecified condition made precise before any number exists.
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
  now: () => new Date(Date.UTC(2026, 8, 9, 9, tick++)).toISOString(),
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

const VAGUE = "the gap exceeds two standard deviations over seeds";
const PRECISE = "the gap exceeds two standard deviations over seeds, ddof=1";
const WHY = "we never said which standard deviation, and at ten seeds the two differ by sqrt(10/9)";

/** A locked design nobody has evaluated: the state a prespecification fix happens in. */
async function aLockedDesign() {
  const { work } = await session.writes.planWork({
    objective: "the 27-cell sweep over alpha and sigma",
    acceptance: "a number per cell on val",
  });
  const { criterion } = await session.writes.stateCriterion(VAGUE);
  const { gate } = await session.writes.declareGate({
    governedBy: [criterion],
    consequence: "the sweep is not reported",
    protecting: [work],
  });
  return { work, criterion, gate };
}

describe("S-30: fixed before the first run", () => {
  test("Afterward 1: an amendment before any evaluation needs no diagnosis, and says so", async () => {
    const { criterion, gate } = await aLockedDesign();

    const amended = await session.writes.amendDesign({
      criterion,
      nowRequires: PRECISE,
      because: WHY,
    });

    // Not mechanical and not scientific: nothing has run, so there is nothing
    // to re-run and nothing was learned that prompted it.
    expect(amended.nature).toBe("prespecification");
    // Nothing was cited, and nothing could have been.
    expect(amended.confirmatoryAffected).toEqual([]);

    // And it is a real amendment, not a note beside the condition.
    const history = await (await afterwards()).reads.designHistory({ gate });
    const wordings = history.conditions.flatMap((c) =>
      c.amendments.map((a) => a.replaced.requires),
    );
    expect(wordings).toContain(VAGUE);

    await captureConversation(
      {
        id: "S-30",
        title: "Fixed before the first run",
        about:
          "A condition agreed in advance is worded too loosely, and is made precise before any number exists — so the amendment is prespecification rather than a change made in light of a result.",
      },
      events,
    );
  });

  test("a diagnosis is still accepted before the first run, and still classified by its blast radius", async () => {
    const { criterion } = await aLockedDesign();
    const { question } = await session.writes.pose({ question: "does ddof matter here?" });
    const { enquiry } = await session.writes.pursue({
      question,
      approach: "read the two definitions",
    });
    const { analysis } = await session.writes.recordAnalysis({
      enquiry,
      method: "compared the two conventions at n=10",
      from: [],
    });
    const concluded = await session.writes.conclude({
      analysis,
      finding: "at n=10 the two conventions differ by sqrt(10/9)",
      proposition: "the two standard-deviation conventions differ enough to flip a verdict",
      bearing: "supports",
    });

    const amended = await session.writes.amendDesign({
      criterion,
      nowRequires: PRECISE,
      because: WHY,
      citing: concluded.claims[0]!.claim,
    });
    // Cited, so it is judged the way every cited amendment is -- the caller
    // does not get to call their own amendment prespecification.
    expect(amended.nature).toBe("mechanical");
  });
});
