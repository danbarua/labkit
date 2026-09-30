/**
 * S-10 — "Rerunning is not reproducing." and
 * rows E, P
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

let tick = 0;
const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 7, 19, 9, tick++)).toISOString(),
};

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  tick = 0;
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events, attribution: as("Researcher") });
});
afterEach(async () => {
  await scenario.end();
});

/** A second reader over the same graph — see tests/helpers/scenario.ts. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

const PROPOSITION = "the annealed protocol converges below tolerance";

/**
 * Researcher: "There's a result from the old study saying the annealed protocol converges.
 * Nobody wrote down what it started from."
 */
async function aHistoricalResultWithNoRecordedInputs() {
  const { enquiry } = await session.writes.openEnquiry(
    "does the annealed protocol converge below tolerance?",
  );
  const { analysis: historical, claims: historicalClaims } = await recordAnalysis(session.writes, {
    enquiry,
    method: "annealing-v1",
    from: [],
    concludes: [{ proposition: PROPOSITION, finding: "converged, residual 3.1e-4" }],
  });
  return { enquiry, historical, historicalClaims };
}

describe("S-10: rerunning is not reproducing", () => {
  /**
   * A re-run recorded as a second analysis: `whySupported` lists both findings alike, with
   * nothing saying one re-checked the other.
   */
  test("recorded as two analyses, the re-run reads as independent confirmation", async () => {
    const { enquiry, historicalClaims } = await aHistoricalResultWithNoRecordedInputs();

    const { observations: conditions } = await session.writes.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    await recordAnalysis(session.writes, {
      enquiry,
      method: "annealing-v1, re-run",
      from: [conditions],
      concludes: [{ proposition: PROPOSITION, finding: "converged, residual 2.9e-4" }],
    });

    const why = await (await afterwards()).reads.whySupported({
      claim: claimOf(historicalClaims, PROPOSITION),
    });
    expect(why.verdict).toBe("supported");
    // Two findings, presented alike, with nothing saying one re-checked the
    // other or that their executions differ.
    expect(why.support).toHaveLength(2);
    expect(why.support.map((s) => s.method).sort()).toEqual([
      "annealing-v1",
      "annealing-v1, re-run",
    ]);

    await captureConversation(
      {
        id: "S-10",
        title: "Rerunning is not reproducing",
        about:
          "An old result says the protocol converges, but nobody wrote down what it started from. Running it again and recording the new result as a second analysis makes the two look like independent confirmation of each other.",
      },
      events,
    );
  });
});
