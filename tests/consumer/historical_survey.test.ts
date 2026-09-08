/**
 * The historical survey, put under a wound clock.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { windableClock, days } from "../helpers/clock";
import { claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let graph: Awaited<ReturnType<Scenario["begin"]>>;

beforeAll(async () => {
  scenario = await openScenario();
});
// `begin()` in a hook, not a test body: bun runs beforeEach/afterEach OUTSIDE
// the 5000ms per-test budget, so setup paid here does not count against the
// ceiling. `end()` was already off-budget for the same reason.
beforeEach(async () => {
  graph = await scenario.begin();
});
afterEach(async () => {
  await scenario.end();
});
afterAll(async () => {
  await scenario.close();
});

const asked = (survey: {
  established: Array<{ asks: string }>;
  provisional: Array<{ asks: string }>;
  accepted: Array<{ asks: string }>;
  open: Array<{ asks: string }>;
}) => ({
  established: survey.established.map((q) => q.asks),
  provisional: survey.provisional.map((q) => q.asks),
  accepted: survey.accepted.map((q) => q.asks),
  open: survey.open.map((q) => q.asks),
});

describe("what was known, as of an instant", () => {
  /**
   * **A question posed in April was not open in March. It did not exist.**
   */
  test("a question posed after the instant is not reported as open at it", async () => {
    const clock = windableClock("2026-03-01T09:00:00.000Z");
    const s = new ResearchSession(graph, { clock, events: inMemoryEventLog() });

    await s.openEnquiry("does the schedule move convergence?");
    clock.wind(days(31));
    await s.openEnquiry("does batch size interact with it?");

    const march = await s.whatWasKnown("2026-03-15T00:00:00.000Z");
    expect(asked(march).open).toEqual(["does the schedule move convergence?"]);
    expect(asked(march).open).not.toContain("does batch size interact with it?");
  });

  /**
   * **`at` is compared as a string, so a valid instant with an offset orders wrongly.**
   */
  test("an instant given with a UTC offset is compared as a moment, not as text", async () => {
    const clock = windableClock("2026-03-01T08:00:00.000Z");
    const s = new ResearchSession(graph, { clock, events: inMemoryEventLog() });

    const { enquiry } = await s.openEnquiry("does the schedule move convergence?");
    const { observations } = await s.recordObservations({
      enquiry,
      name: "sweep readings",
      finding: "twelve runs",
    });
    const { claims: analysisClaims } = await recordAnalysis(s, {
      enquiry,
      from: [observations],
      method: "paired comparison",
      concludes: [
        {
          proposition: "the schedule moves convergence",
          finding: "moves by ~3 steps",
        },
      ],
    });
    clock.windTo("2026-03-01T10:00:00.000Z");
    await s.closeEnquiry({
      enquiry,
      answeredBy: claimOf(analysisClaims, "the schedule moves convergence"),
    });

    // 14:00Z, four hours after the close — but "09" sorts before "10".
    const offset = await s.whatWasKnown("2026-03-01T09:00:00-05:00");
    expect(asked(offset).provisional).toEqual(["does the schedule move convergence?"]);
    expect(asked(offset).open).toEqual([]);
  });
});
