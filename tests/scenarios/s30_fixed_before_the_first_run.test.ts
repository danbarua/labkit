/**
 * S-30: a prespecified condition made precise before any number exists.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;

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
  session = new ResearchSession(await scenario.begin(), { clock, events: inMemoryEventLog() });
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
  const { work } = await session.planWork({
    objective: "the 27-cell sweep over alpha and sigma",
    acceptance: "a number per cell on val",
  });
  const { criterion } = await session.stateCriterion(VAGUE);
  const { gate } = await session.declareGate({
    governedBy: [criterion],
    consequence: "the sweep is not reported",
    protecting: [work],
  });
  return { work, criterion, gate };
}

describe("S-30: fixed before the first run", () => {
  test("Afterward 1: an amendment before any evaluation needs no diagnosis, and says so", async () => {
    const { criterion, gate } = await aLockedDesign();

    const amended = await session.amendDesign({
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
    const history = await (await afterwards()).designHistory(gate);
    const wordings = history.conditions.flatMap((c) =>
      c.amendments.map((a) => a.replaced.requires),
    );
    expect(wordings).toContain(VAGUE);
  });

  test("Afterward 2: once a number exists, the diagnosis is required again", async () => {
    const { criterion, gate } = await aLockedDesign();
    await session.evaluateCriterion({
      criterion,
      gate,
      value: "the gap is 1.8 sd on the sparse set",
      outcome: "fail",
    });

    await expect(
      session.amendDesign({ criterion, nowRequires: PRECISE, because: WHY }),
    ).rejects.toThrow(/has been evaluated/);
  });

  /**
   * An undone evaluation still blocks prespecification. Not because `undo` retracts the
   * verdict — `stateOf` folds over the findings a verdict cited, and this one cited none, so it
   * still reads `failed` — but because a number existed and somebody saw it.
   */
  test("Afterward 3: an evaluation that was undone does not reopen prespecification", async () => {
    const { criterion, gate } = await aLockedDesign();
    const evaluated = await session.evaluateCriterion({
      criterion,
      gate,
      value: "the gap is 1.8 sd on the sparse set",
      outcome: "fail",
    });
    await session.undo({
      event: evaluated.events[0]!.seq!,
      because: "the sparse set was the wrong split to judge it on",
    });

    await expect(
      session.amendDesign({ criterion, nowRequires: PRECISE, because: WHY }),
    ).rejects.toThrow(/has been evaluated/);
  });

  /**
   * A verdict whose cited claim was later superseded still blocks prespecification. Measured
   * rather than assumed: the criterion reads `passed` here, not `no-standing-verdict` —
   * superseding the claim does not fell the finding the verdict rested on. Either way a number
   * was reached and read, which is the fact the rule turns on.
   */
  test("Afterward 4: a verdict whose claim was superseded is still a verdict", async () => {
    const { criterion, gate } = await aLockedDesign();
    const { question } = await session.pose({ question: "what did the pilot show?" });
    const { enquiry } = await session.pursue({ question, approach: "the pilot run" });
    const { analysis } = await session.recordAnalysis({ enquiry, method: "the pilot", from: [] });
    const pilot = await session.conclude({
      analysis,
      finding: "the gap is 2.4 sd on the pilot split",
      proposition: "the gap clears two standard deviations",
      bearing: "supports",
    });
    const claim = pilot.claims[0]!.claim;

    await session.evaluateCriterion({
      criterion,
      gate,
      value: "2.4 sd on the pilot split",
      outcome: "pass",
      citing: [claim],
    });

    // Everything the verdict rested on is superseded, so it has no standing
    // basis left — `no-standing-verdict`, not `never-run`.
    await session.reinterpret({
      of: claim,
      as: "the gap clears two standard deviations on the pilot split only",
      because: "the pilot split is not the reporting split",
    });

    await expect(
      session.amendDesign({ criterion, nowRequires: PRECISE, because: WHY }),
    ).rejects.toThrow(/has been evaluated/);
  });

  test("a diagnosis is still accepted before the first run, and still classified by its blast radius", async () => {
    const { criterion } = await aLockedDesign();
    const { question } = await session.pose({ question: "does ddof matter here?" });
    const { enquiry } = await session.pursue({ question, approach: "read the two definitions" });
    const { analysis } = await session.recordAnalysis({
      enquiry,
      method: "compared the two conventions at n=10",
      from: [],
    });
    const concluded = await session.conclude({
      analysis,
      finding: "at n=10 the two conventions differ by sqrt(10/9)",
      proposition: "the two standard-deviation conventions differ enough to flip a verdict",
      bearing: "supports",
    });

    const amended = await session.amendDesign({
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
