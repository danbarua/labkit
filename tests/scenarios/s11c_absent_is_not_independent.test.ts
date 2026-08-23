/**
 * S-11c — "Nothing found is not nothing there."
 * docs/consumer-contract/022_stage_b_analysis.md §4, ledger row I applied to
 * dependency propagation.
 *
 * Designer 2 required that *"no dependency found"* never be reported as
 * *"independent"*. `022` classified it as query semantics rather than a model
 * change and refused to implement it without the demonstration this project
 * asks for: **a scenario in which a reader acts on "unaffected" and is wrong.**
 * This is that scenario.
 *
 * It is the fourth catch on this one verb. PJ-021 found it returning
 * `claims: []` for an input while still naming the enquiry.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  ResearchSession,
  inMemoryEventLog,
  type Clock,
  type DependencyReport,
} from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;
const clock: Clock = { now: () => "2026-08-21T09:00:00.000Z" };

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });
beforeEach(async () => {
  session = new ResearchSession(await scenario.begin(), { clock, events: inMemoryEventLog() });
});
afterEach(async () => { await scenario.end(); });

async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

const CALIBRATION = "the calibration is stable across the run";
const TREND = "the response trends upward with dose";

/**
 * Researcher: "Raw sensor data goes through calibration, and the calibrated
 *  series is what the trend analysis actually reads."
 *
 * Two stages, which is ordinary. The record cannot hold it as two stages:
 * `recordAnalysis({ from })` takes observations, and the only thing that
 * produces an observations handle is `recordObservations()`. **An analysis
 * output cannot be fed to another analysis through any verb on the surface**,
 * so a researcher doing stage two has exactly one route — record the
 * intermediate again, as if it were fresh measurement.
 *
 * That is not misuse. It is the only thing the surface permits, and it is why
 * the chain breaks in the record while holding perfectly well in the world.
 */
async function aTwoStagePipeline(s: ResearchSession) {
  const enquiry = await s.openEnquiry("does the response trend upward with dose?");
  const raw = await s.recordObservations({
    enquiry, name: "raw sensor series", finding: "eleven dose levels, uncalibrated",
    contentHash: "sha256:raw",
  });
  const { analysis: calibration, claims: calibrationClaims } = await s.recordAnalysis({
    enquiry, method: "calibrate", from: [raw],
    concludes: [{ proposition: CALIBRATION, finding: "drift under 0.2% across the run" }],
  });

  // Stage two. The calibrated series is re-recorded because nothing on the
  // surface hands stage one's output to stage two.
  const calibrated = await s.recordObservations({
    enquiry, name: "calibrated series", finding: "eleven dose levels, calibrated",
    contentHash: "sha256:calibrated",
  });
  const { analysis: trend, claims: trendClaims } = await s.recordAnalysis({
    enquiry, method: "dose-response-fit", from: [calibrated],
    concludes: [{ proposition: TREND, finding: "monotonic increase, p < 0.01" }],
  });
  return { enquiry, raw, calibration, calibrated, trend };
}

describe("S-11c: nothing found is not nothing there", () => {
  /**
   * **The wrong answer a reader acts on.**
   *
   * The raw series turns out to be corrupt. A reader asks what depends on it,
   * gets a populated answer, and has no way to tell it is a lower bound. The
   * trend claim rests on that raw data through the calibration and is missing
   * from the list — so a reader who works the list leaves it standing.
   */
  test("a re-entered intermediate still severs the chain, and the report says so", async () => {
    const { raw } = await aTwoStagePipeline(session);

    const affected = await (await afterwards()).whatDependsOn(raw);

    // The traversal is transitive now (row AE), but this builder deliberately
    // re-enters the intermediate as fresh observations rather than reading the
    // first analysis's output -- which is what a researcher had to do before
    // `from` accepted an AnalysisRef. There is no CONSUMES/PRODUCES link to
    // follow, so the trend claim is still out of reach.
    //
    // That is the point the row makes: the reader cannot tell this from a
    // subject nothing depends on, which is why `complete: false` is not
    // decoration. Recording the second stage properly is what fixes it, and
    // S-11d asserts that it does.
    expect(affected.claims.map((c) => c.asserts)).toEqual([CALIBRATION]);
    expect(affected.claims.map((c) => c.asserts)).not.toContain(TREND);
    expect(affected.complete).toBe(false);
  });

  /**
   * The same defect stated so it cannot be dismissed as a two-stage quirk:
   * **an artefact nothing depends on and an artefact whose dependants are out
   * of reach return the same shape.** A reader cannot tell ignorance from
   * independence, which is exactly row I's distinction — absence of evidence
   * versus evidence of absence — asked of propagation.
   */
  test("an empty answer says it is a lower bound rather than a finding of independence", async () => {
    const { raw, enquiry } = await aTwoStagePipeline(session);
    const unrelated = await session.recordObservations({
      enquiry, name: "lab humidity log", finding: "42% throughout, nothing read it",
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
   * `complete` is a literal `false`, not a boolean, so the caveat cannot be
   * read off as a runtime flag that might one day be true.
   *
   * Asserting completeness would mean knowing the relevant dependency set *is*
   * complete, which is durable coverage state this model does not have.
   * `023` §4 preserves that as a discriminator and says explicitly not to build
   * it; widening the type would ship the assertion without the state.
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
      // is the change 023 §4 forbids without durable coverage state behind it.
      const bad: DependencyReport = { ...affected, complete: true };
      return bad;
    };
    expect(typeof claimsCompleteness).toBe("function");
  });
});
