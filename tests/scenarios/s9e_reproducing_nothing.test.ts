/**
 * S-9e — "Did it reproduce?" asked about nothing. docs/consumer-
 * contract/037_reproducibility_of_nothing_predictions.md
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { ref } from "../../src/domain/report";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;
const clock: Clock = { now: () => "2026-08-21T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  session = new ResearchSession(await scenario.begin(), {
    clock,
    events: inMemoryEventLog(),
  });
});
afterEach(async () => {
  await scenario.end();
});

async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

const HOLDS = "the simulation converges";

/**
 * Researcher: "That one was a pure simulation — it didn't read anything of ours. Can we say it
 * reproduces?"
 */
async function anAnalysisThatConsumedNothing(s: ResearchSession) {
  const { enquiry } = await s.openEnquiry("does the simulation converge?");
  const { analysis, claims: analysisClaims } = await recordAnalysis(s, {
    enquiry,
    method: "pure-sim",
    from: [],
    concludes: [{ proposition: HOLDS, finding: "it converges" }],
  });
  return { enquiry, analysis, analysisClaims };
}

describe("S-9e: reproducing nothing", () => {
  /**
   * **The defect.** Nothing was rebuilt, because there was nothing to rebuild, and the report
   * said the construction reproduces.
   */
  test("an analysis that consumed nothing has not been shown to reproduce", async () => {
    const { analysis } = await anAnalysisThatConsumedNothing(session);

    const report = await session.reproducibilityOf(analysis, []);
    expect(report.reproducible).toBe(false);
    expect(report.exact).toEqual([]);
    expect(report.differing).toEqual([]);
    expect(report.unverifiable).toEqual([]);
    expect(report.notRebuilt).toEqual([]);

    // Afterward, from a second reader over the same graph.
    const again = await (await afterwards()).reproducibilityOf(analysis, []);
    expect(again.reproducible).toBe(false);
  });

  /**
   * **The other half, and a different answer.** A caller naming an analysis that was never
   * created is not asking an unanswerable question — it is naming nothing. Every other read on
   * the surface throws when its subject is absent.
   */
  test("an analysis that does not exist is refused, not reported on", async () => {
    await expect(session.reproducibilityOf(ref("analysis", "COMP_999999"), [])).rejects.toThrow(
      /COMP_999999/,
    );
  });

  /**
   * The distinction is the point, so it is asserted rather than left in prose -- where a prose
   * guard can be an assertion, it should be.
   */
  test("an absent subject and an empty one are not the same answer", async () => {
    const { analysis } = await anAnalysisThatConsumedNothing(session);
    const read = await afterwards();

    const empty = await read.reproducibilityOf(analysis, []);
    let ghost = "(no throw)";
    try {
      await read.reproducibilityOf(ref("analysis", "COMP_999999"), []);
    } catch (e) {
      ghost = (e as Error).message;
    }

    expect(empty.reproducible).toBe(false);
    expect(ghost).not.toBe("(no throw)");
  });
});
