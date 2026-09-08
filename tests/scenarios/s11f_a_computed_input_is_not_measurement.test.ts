/**
 * S-11f — "Does it cost anything that an artefact does not say what kind it is?" External
 * review of PR #2, discriminator 1. Ledger row `ART_`.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;

const clock: Clock = { now: () => "2026-08-24T12:00:00.000Z" };

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

const TREND = "the response trends upward with dose";

/** Raw measurement, a calibration reading it, and a trend fit reading that. */
async function twoStages() {
  const { enquiry } = await session.openEnquiry("does the response trend upward?");
  const { observations: raw } = await session.recordObservations({
    enquiry,
    name: "raw series",
    finding: "uncalibrated instrument output",
    contentHash: "sha256:raw",
  });
  const calibration = await recordAnalysis(session, {
    enquiry,
    method: "calibrate",
    from: [raw],
    concludes: [{ proposition: "the series is calibrated", finding: "offset removed" }],
  });
  const trend = await recordAnalysis(session, {
    enquiry,
    method: "trend",
    from: [calibration.analysis],
    concludes: [{ proposition: TREND, finding: "slope 0.4" }],
  });
  return { enquiry, raw, calibration, trend };
}

describe("S-11f — a computed input, asked about by the reads that touch inputs", () => {
  test("the handle says observations; the record it names is an analysis output", async () => {
    const { trend } = await twoStages();
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const why = await later.whySupported(claimOf(trend.claims, TREND));

    expect(why.restingOn).toHaveLength(1);
    // The vocabulary is wrong and the wording is right, which is the wrong way
    // round for this repo — but nothing is decided from either. Asserted on the
    // prefix because that is where a handle's kind lives: `part.kind` was a
    // field until handles became branded strings, and the field could disagree
    // with the id it sat beside.
    expect(why.restingOn[0]!.part).toMatch(/^ART_/);
    expect(why.restingOn[0]!.name).toBe("calibrate output");
  });

  test("accounting for a computed input declines, and does not report it unequal", async () => {
    const { raw, calibration, trend } = await twoStages();
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });

    // Stage one is fully accounted for: a hash was recorded and it matches.
    const stageOne = await later.reproducibilityOf(calibration.analysis, [
      { part: raw, hash: "sha256:raw" },
    ]);
    expect(stageOne.exact.map((p) => p.name)).toEqual(["raw series"]);
    expect(stageOne.reproducible).toBe(true);

    // Stage two reads a computed artefact, which carries no hash — nothing was measured, so
    // there is nothing to hash against. That lands in `unverifiable`, which is the record
    // declining to answer rather than answering no, and it is the correct answer about that
    // record.
    const stageTwo = await later.reproducibilityOf(trend.analysis, []);
    expect(stageTwo.unverifiable.map((p) => p.name)).toEqual(["calibrate output"]);
    // The half that makes this a real probe rather than a restatement: absence
    // is not reported as difference. `differing` would be a wrong answer.
    expect(stageTwo.differing).toEqual([]);
    expect(stageTwo.reproducible).toBe(false);

    // **The one real consequence, and it is a weaker answer rather than a wrong one.**
    // `unverifiable` is right about the hash and blind to the route: this artefact was produced
    // by a computation whose own input is accounted for exactly, one hop away, and the record
    // holds that.
    expect(stageOne.reproducible).toBe(true);
  });
});
