/**
 * S-11b — "Which review retracted it?"
 * docs/project-journal/008_user_story_mining.md §3 row O
 * docs/consumer-contract/031_row_o_predictions.md
 *
 * Row O has been deferred since PJ-008 on the grounds that *which review caused
 * an invalidation* describes why state changed rather than what is true now, and
 * therefore belongs to the event history. The deferral was withdrawn on an
 * external challenge: the row's own verified-state line describes a
 * present-tense question, and whether a standing retraction rests on valid
 * grounds is exactly what dependency propagation is for.
 *
 * The scenario is ordinary, which is the point. An analysis draws two reviews —
 * one critical, one confirming — and is then replaced on the strength of one of
 * them. A programme with more than one reviewer produces this constantly.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";

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
 * Researcher: "We have an analysis, and two colleagues have looked at it. One
 *  says the method is wrong. The other says the arithmetic is right."
 *
 * Both are true at once and neither is unusual: a review confirming what it
 * checked is not a review approving the whole analysis.
 */
async function anAnalysisWithTwoReviews(s: ResearchSession) {
  const { enquiry } = await s.openEnquiry("does the coating shift the onset temperature?");
  const { observations: readings } = await s.recordObservations({
    enquiry,
    name: "onset sweep",
    finding: "onset across twelve coatings",
  });
  const { analysis, claims: analysisClaims } = await s.recordAnalysis({
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
      const report = await s.replaceAnalysis({
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
   * **Row O.** Two worlds identical except for which review the replacement was
   * made on the strength of.
   *
   * In world A the critical review caused it; in world B the confirming one
   * did. Both are records a real programme produces, and a reader asking *why
   * is the original finding no longer standing?* must get the verdict that
   * actually caused the retraction.
   *
   * Before `INVALIDATED_BY`, `because` was validated and then written nowhere,
   * so these two worlds were byte-identical to every read on the surface — and
   * both reported the **confirming** review among the reasons the work was
   * retracted. An approval presented as a retraction.
   */
  test("the reason a finding was superseded is the review that caused it", async () => {
    const build = (pick: "critical" | "confirming") => async (s: ResearchSession) => {
      const w = await anAnalysisWithTwoReviews(s);
      const report = await s.replaceAnalysis({
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
   * The other half, asked of one world so the claim does not depend on the
   * pairing: one supersession is reported **once**.
   *
   * `findingsBearing()` returns a row per matching review, so before row O a
   * finding superseded once appeared twice — with two different reasons that
   * contradicted each other. That was a query defect and the query owns it; the
   * dedupe stayed when the edge arrived, because the edge fixes attribution and
   * not multiplicity.
   */
  test("one supersession is reported once, with the reason that caused it", async () => {
    const reasons = await inOneWorld(async (s) => {
      const w = await anAnalysisWithTwoReviews(s);
      const report = await s.replaceAnalysis({
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
