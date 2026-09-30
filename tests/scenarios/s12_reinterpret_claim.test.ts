/**
 * S-12 — a claim asserted twice, then challenged: challenged is not withdrawn.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";
import { as } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

const FIXED_NOW = "2026-08-19T10:00:00.000Z";
const clock: Clock = { now: () => FIXED_NOW };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events, attribution: as("Researcher") });
});
afterEach(async () => {
  await scenario.end();
});

const PREFERENTIAL = "the encoding preferentially preserves discriminative signal";

/**
 * One proposition, asserted twice from two independent runs.
 */
async function assertedTwice() {
  const { enquiry } = await session.writes.openEnquiry(
    "does the encoding preferentially preserve discriminative signal?",
  );

  const { observations: firstReadings } = await session.writes.recordObservations({
    enquiry,
    name: "attenuation readings, cohort A",
    finding: "signal amplitude before and after encoding, both signal types, cohort A",
  });
  const { analysis: first, claims: firstClaims } = await recordAnalysis(session.writes, {
    enquiry,
    method: "attenuation-ratio",
    from: [firstReadings],
    concludes: [
      {
        proposition: PREFERENTIAL,
        finding: "discriminative amplitude ratio 0.81, non-discriminative 0.44",
      },
    ],
  });

  const { observations: secondReadings } = await session.writes.recordObservations({
    enquiry,
    name: "attenuation readings, cohort B",
    finding: "signal amplitude before and after encoding, both signal types, cohort B",
  });
  const { analysis: second, claims: secondClaims } = await recordAnalysis(session.writes, {
    enquiry,
    method: "attenuation-ratio",
    from: [secondReadings],
    concludes: [
      {
        proposition: PREFERENTIAL,
        finding: "discriminative amplitude ratio 0.79, non-discriminative 0.41",
      },
    ],
  });

  return {
    enquiry,
    first,
    firstClaims,
    second,
    secondClaims,
    firstReadings,
    secondReadings,
  };
}

describe("S-12 — challenged is not withdrawn", () => {
  /**
   * A claim can be challenged without its source evidence becoming invalid.
   */
  test("challenging a claim leaves its evidence standing", async () => {
    const programme = await assertedTwice();

    const { observations: contrary } = await session.writes.recordObservations({
      enquiry: programme.enquiry,
      name: "attenuation readings, cohort C",
      finding: "signal amplitude before and after encoding, cohort C",
    });
    await recordAnalysis(session.writes, {
      enquiry: programme.enquiry,
      method: "attenuation-ratio",
      from: [contrary],
      concludes: [
        {
          proposition: PREFERENTIAL,
          finding: "cohort C shows no separation between signal types",
          bearing: "challenges",
        },
      ],
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const standing = await later.reads.whySupported({
      claim: claimOf(programme.firstClaims, PREFERENTIAL),
    });
    expect(standing.challenged).toBe(true);
    // Challenged, but nobody withdrew it -- the two states must not collapse.
    expect(standing.withdrawn).toBe(false);
    expect(standing.verdict).toBe("supported");
    expect(standing.against).toHaveLength(1);
    // Challenged, but its own evidence is untouched -- two supporting findings
    // still stand, and nothing is superseded.
    expect(standing.support).toHaveLength(2);
    expect(standing.superseded).toEqual([]);
  });
});
