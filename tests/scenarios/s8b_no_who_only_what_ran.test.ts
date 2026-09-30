/**
 * S-8b — "There is no who."
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf, whyOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let graph: Awaited<ReturnType<Scenario["begin"]>>;
const clock: Clock = { now: () => "2026-08-21T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
beforeEach(async () => {
  graph = await scenario.begin();
});
afterEach(async () => {
  await scenario.end();
});
afterAll(async () => {
  await scenario.close();
});

async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

/**
 * Scopes a session over the world the hooks opened. The world's lifecycle
 * lives in `beforeEach`/`afterEach`, outside bun's 5000ms per-test ceiling,
 * since the test here opens exactly one world.
 */
async function inOneWorld<T>(build: (s: ResearchSession) => Promise<T>): Promise<T> {
  return build(new ResearchSession(graph, { clock, events: inMemoryEventLog() }));
}

describe("S-8b: there is no who, only what ran", () => {
  /**
   * *"On what projected cost?"*
   */
  test("approval is a decision on evidence against a condition, with no signer", async () => {
    const answer = await inOneWorld(async (s) => {
      const { enquiry } = await s.writes.openEnquiry("should the run be scaled up?");
      const { criterion: budget } = await s.writes.stateCriterion(
        "projected cost under 40 GPU-hours",
      );
      const { observations: readings } = await s.writes.recordObservations({
        enquiry,
        name: "cost projection",
        finding: "projected 31 GPU-hours at target scale",
      });
      const { claims: analysisClaims } = await recordAnalysis(s.writes, {
        enquiry,
        method: "cost-projection",
        from: [readings],
        concludes: [
          {
            proposition: "the scale-up fits the budget",
            finding: "31 GPU-hours projected",
          },
        ],
        heldTo: [budget],
      });
      await s.writes.evaluateCriterion({
        criterion: budget,
        value: "31 GPU-hours",
        outcome: "pass",
        citing: [claimOf(analysisClaims, "the scale-up fits the budget")],
      });
      await s.writes.closeEnquiry({
        enquiry,
        answeredBy: claimOf(analysisClaims, "the scale-up fits the budget"),
      });
      return whyOf((await afterwards()).reads, "the scale-up fits the budget");
    });

    // The approval is fully accounted for without anyone signing it: what was
    // concluded, on what evidence, against which prespecified condition, and
    // whether that condition was met.
    expect(answer.verdict).toBe("supported");
    expect(answer.standard.map((c) => c.proposition)).toEqual([
      "projected cost under 40 GPU-hours",
    ]);
    expect(answer.unmet).toEqual([]);
    expect(answer.support.map((x) => x.finding)).toEqual(["31 GPU-hours projected"]);
  });
});
