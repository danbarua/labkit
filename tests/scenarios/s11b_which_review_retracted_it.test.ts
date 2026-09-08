/**
 * S-11b — "Which review retracted it?"
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { recordAnalysis, replaceAnalysis } from "../helpers/analysis";

let scenario: Scenario;

/** Frozen: two worlds a read could separate only by elapsed time are not separated. */
const clock: Clock = { now: () => "2026-08-21T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
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

async function inOneWorld<T>(build: (s: ResearchSession) => Promise<T>): Promise<T> {
  const graph = await scenario.begin();
  try {
    return await build(new ResearchSession(graph, { clock, events: inMemoryEventLog() }));
  } finally {
    await scenario.end();
  }
}

async function inTwoWorlds<T>(
  worldA: (s: ResearchSession) => Promise<T>,
  worldB: (s: ResearchSession) => Promise<T>,
): Promise<{ a: T; b: T }> {
  return { a: await inOneWorld(worldA), b: await inOneWorld(worldB) };
}

const SHIFTS = "the coating shifts the onset temperature";
const UNSOUND = "the fit used a linear model where the response is plainly sigmoid";
const CONFIRMING = "numbers check out; independently recomputed the same values";

/**
 * Researcher: "We have an analysis, and two colleagues have looked at it. One says the method
 * is wrong. The other says the arithmetic is right."
 */
async function anAnalysisWithTwoReviews(s: ResearchSession) {
  const { enquiry } = await s.openEnquiry("does the coating shift the onset temperature?");
  const { observations: readings } = await s.recordObservations({
    enquiry,
    name: "onset sweep",
    finding: "onset across twelve coatings",
  });
  const { analysis, claims: analysisClaims } = await recordAnalysis(s, {
    enquiry,
    method: "linear-onset-fit",
    from: [readings],
    concludes: [{ proposition: SHIFTS, finding: "onset moves by 4.2 K" }],
  });
  const { review: critical } = await s.recordReview({ of: analysis, verdict: UNSOUND });
  const { review: confirming } = await s.recordReview({
    of: analysis,
    verdict: CONFIRMING,
  });
  return { enquiry, readings, analysis, analysisClaims, critical, confirming };
}

describe("S-11b: which review retracted it?", () => {
  /**
   * The control. Two worlds that differ in something the record demonstrably
   * carries, so the equalities below are facts about the read surface rather
   * than artefacts of the harness.
   */
  test("two worlds differing in what the replacement concluded are told apart", async () => {
    const build = (finding: string) => async (s: ResearchSession) => {
      const { enquiry, readings, analysis, critical } = await anAnalysisWithTwoReviews(s);
      const report = await replaceAnalysis(s, {
        supersedes: analysis,
        because: critical,
        enquiry,
        method: "sigmoid-onset-fit",
        from: [readings],
        concludes: [{ proposition: SHIFTS, finding }],
      });
      const why = await (await afterwards()).whySupported(claimOf(report.claims, SHIFTS));
      return why.support.map((x) => x.finding).sort();
    };
    const { a, b } = await inTwoWorlds(build("onset moves by 2.8 K"), build("onset does not move"));
    expect(a).toEqual(["onset moves by 2.8 K"]);
    expect(b).toEqual(["onset does not move"]);
  });

  /**
   * **Row O.** Two worlds identical except for which review the replacement was made on the
   * strength of.
   */
  test("the reason a finding was superseded is the review that caused it", async () => {
    const build = (pick: "critical" | "confirming") => async (s: ResearchSession) => {
      const w = await anAnalysisWithTwoReviews(s);
      const report = await replaceAnalysis(s, {
        supersedes: w.analysis,
        because: pick === "critical" ? w.critical : w.confirming,
        enquiry: w.enquiry,
        method: "sigmoid-onset-fit",
        from: [w.readings],
        concludes: [{ proposition: SHIFTS, finding: "onset moves by 2.8 K" }],
      });
      const why = await (await afterwards()).whySupported(claimOf(report.claims, SHIFTS));
      return why.superseded
        .map((x) => ({ finding: x.finding, reason: x.reason }))
        .sort((p, q) => p.reason.localeCompare(q.reason));
    };

    const { a, b } = await inTwoWorlds(build("critical"), build("confirming"));

    // Each world reports the verdict that actually caused its retraction.
    expect(a).toEqual([{ finding: "onset moves by 4.2 K", reason: UNSOUND }]);
    expect(b).toEqual([{ finding: "onset moves by 4.2 K", reason: CONFIRMING }]);

    // Stated separately because it is the assertion that was false before row
    // O: the two worlds must not be indistinguishable. Everything else about
    // them is identical, so this is the read surface carrying which review the
    // researcher acted on, and nothing else.
    expect(a).not.toEqual(b);
  });

  /**
   * The other half, asked of one world so the claim does not depend on the pairing: one
   * supersession is reported **once**.
   */
  test("one supersession is reported once, with the reason that caused it", async () => {
    const reasons = await inOneWorld(async (s) => {
      const w = await anAnalysisWithTwoReviews(s);
      const report = await replaceAnalysis(s, {
        supersedes: w.analysis,
        because: w.critical,
        enquiry: w.enquiry,
        method: "sigmoid-onset-fit",
        from: [w.readings],
        concludes: [{ proposition: SHIFTS, finding: "onset moves by 2.8 K" }],
      });
      const why = await (await afterwards()).whySupported(claimOf(report.claims, SHIFTS));
      return why.superseded.map((x) => x.reason);
    });
    // Two entries for one supersession, because `findingsBearing()` returns a
    // row per matching review and nothing collapses them. A finding superseded
    // once is reported twice, each time with a different reason, and the two
    // reasons contradict each other.
    expect(reasons).toEqual([UNSOUND]);
  });
});
