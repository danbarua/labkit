/**
 * S-11c — "Nothing found is not nothing there."
 *, ledger row I applied to dependency propagation.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  ResearchSession,
  inMemoryEventLog,
  type Clock,
  type DependencyReport,
} from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
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

const CALIBRATION = "the calibration is stable across the run";
const TREND = "the response trends upward with dose";

/**
 * Researcher: "Raw sensor data goes through calibration, and the calibrated series is what the
 * trend analysis actually reads."
 */
async function aTwoStagePipeline(s: ResearchSession) {
  const { enquiry } = await s.openEnquiry("does the response trend upward with dose?");
  const { observations: raw } = await s.recordObservations({
    enquiry,
    name: "raw sensor series",
    finding: "eleven dose levels, uncalibrated",
    contentHash: "sha256:raw",
  });
  const { analysis: calibration } = await recordAnalysis(s, {
    enquiry,
    method: "calibrate",
    from: [raw],
    concludes: [
      {
        proposition: CALIBRATION,
        finding: "drift under 0.2% across the run",
      },
    ],
  });

  // Stage two. The calibrated series is re-recorded because nothing on the
  // surface hands stage one's output to stage two.
  const { observations: calibrated } = await s.recordObservations({
    enquiry,
    name: "calibrated series",
    finding: "eleven dose levels, calibrated",
    contentHash: "sha256:calibrated",
  });
  const { analysis: trend } = await recordAnalysis(s, {
    enquiry,
    method: "dose-response-fit",
    from: [calibrated],
    concludes: [{ proposition: TREND, finding: "monotonic increase, p < 0.01" }],
  });
  return { enquiry, raw, calibration, calibrated, trend };
}

describe("S-11c: nothing found is not nothing there", () => {
  /**
   * **The wrong answer a reader acts on.**
   */
  test("a re-entered intermediate still severs the chain, and the report says so", async () => {
    const { raw } = await aTwoStagePipeline(session);

    const affected = await (await afterwards()).whatDependsOn(raw);

    // The traversal is transitive now (row AE), but this builder deliberately re-enters the
    // intermediate as fresh observations rather than reading the first analysis's output --
    // which is what a researcher had to do before `from` accepted an AnalysisRef. There is no
    // CONSUMES/PRODUCES link to follow, so the trend claim is still out of reach.
    expect(affected.claims.map((c) => c.asserts)).toEqual([CALIBRATION]);
    expect(affected.claims.map((c) => c.asserts)).not.toContain(TREND);
    expect(affected.complete).toBe(false);
  });

  /**
   * The same defect stated so it cannot be dismissed as a two-stage quirk: **an artefact
   * nothing depends on and an artefact whose dependants are out of reach return the same
   * shape.** A reader cannot tell ignorance from independence, which is exactly row I's
   * distinction — absence of evidence versus evidence of absence — asked of propagation.
   */
  test("an empty answer says it is a lower bound rather than a finding of independence", async () => {
    const { raw, enquiry } = await aTwoStagePipeline(session);
    const { observations: unrelated } = await session.recordObservations({
      enquiry,
      name: "lab humidity log",
      finding: "42% throughout, nothing read it",
    });

    const reader = await afterwards();
    const under = await reader.whatDependsOn(raw);
    const none = await reader.whatDependsOn(unrelated);

    // Nothing was found for the humidity log, and the report does not let that
    // be read as independence. This is the remedy in full: the values are
    // unchanged, and what changed is that the answer stops overstating itself.
    expect(none.claims).toEqual([]);
    expect(none.complete).toBe(false);
    expect(under.complete).toBe(false);

    // A reader can also see what was actually considered, which is what makes
    // the caveat actionable rather than decorative -- the omission in the test
    // above is precisely a route not on this list.
    expect(none.routesWalked.length).toBe(3);
    expect(none.routesWalked).toEqual(under.routesWalked);
  });

  /**
   * `complete` is a literal `false`, not a boolean, so the caveat cannot be read off as a
   * runtime flag that might one day be true.
   */
  test("the report cannot be made to claim completeness", async () => {
    const { raw } = await aTwoStagePipeline(session);
    const affected = await (await afterwards()).whatDependsOn(raw);

    expect(affected.complete).toBe(false);

    // The constraint is on what can be *written*, not on what can be read --
    // `false` is assignable to `boolean`, so asserting the other direction
    // proves nothing and TypeScript says so. A report claiming completeness
    // does not typecheck, which is the guarantee worth having.
    const claimsCompleteness = () => {
      // @ts-expect-error `complete` is the literal `false`. Making this legal
      // is the change 023 forbids without durable coverage state behind it.
      const bad: DependencyReport = { ...affected, complete: true };
      return bad;
    };
    expect(typeof claimsCompleteness).toBe("function");
  });
});
