/**
 * S-3c — "The check was wrong, not the result."
 * docs/project-journal/008_user_story_mining.md, §3, row X
 *
 * S-3 earned one policy and one only: re-running a robustness check until it
 * happens to come back green must not erase the earlier failure. What shipped
 * is broader — *any* failing evaluation is decisive forever — and since S-3b it
 * disqualifies a finding as well as blocking work.
 *
 * This is the case that rule was never asked about. The check itself was
 * defective; it was reviewed, corrected and re-run. Nothing about the result
 * changed. Under the shipped rule the original failure remains permanently
 * decisive, and the record cannot tell that case apart from someone re-rolling
 * the dice — which is the distinction S-3 actually cared about.
 *
 * Both cases appear here side by side, deliberately: a fix that clears the
 * second while also clearing the first has not narrowed the rule, it has
 * removed it.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

/**
 * Evaluations are ordered by time, so a single frozen clock would leave
 * "which evaluation came second" resting on natural-id tie-breaking. The
 * scenario turns on exactly that ordering, so it gets a clock that moves.
 */
let tick = 0;
const clock: Clock = { now: () => new Date(Date.UTC(2026, 7, 19, 9, tick++)).toISOString() };

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });
beforeEach(async () => {
  tick = 0;
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events });
});
afterEach(async () => { await scenario.end(); });

/** A second reader over the same graph — see tests/helpers/scenario.ts. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

const PROPOSITION = "T differs from rewired";
const ROBUSTNESS = "median aggregation agrees with the mean";
const DISAGREES = "median aggregation disagrees";
const AGREES = "median aggregation agrees";

/**
 * Researcher: "I've a significant pairwise result, and before I ran it we
 *  agreed it only counts if the median aggregation agrees with the mean."
 *
 * The standard is stated before the run it qualifies, as S-3b requires.
 */
async function aResultHeldToARobustnessCheck() {
  const robustness = await session.stateCriterion(ROBUSTNESS);
  const enquiry = await session.openEnquiry("does T differ from rewired?");
  const observations = await session.recordObservations({
    enquiry,
    name: "per-image results",
    finding: "per-image accuracy, 10,000 images",
  });
  const analysis = await session.recordAnalysis({
    enquiry,
    method: "holm-pairwise",
    from: [observations],
    concludes: [{ proposition: PROPOSITION, finding: "p = 0.002, Holm-corrected" }],
    heldTo: [robustness],
  });
  return { robustness, enquiry, observations, analysis };
}

/**
 * Researcher: "Run the median aggregation." — the check is a piece of work
 * that produces a result, not a verdict someone types in. That is what makes
 * it something a later reviewer can find fault with.
 */
async function theCheckIsRun(
  enquiry: Awaited<ReturnType<typeof session.openEnquiry>>,
  observations: Awaited<ReturnType<typeof session.recordObservations>>,
  method: string,
  concludes: { proposition: string; finding: string },
) {
  return session.recordAnalysis({ enquiry, method, from: [observations], concludes: [concludes] });
}

describe("S-3c: the check was wrong, not the result", () => {
  /**
   * Case 1, which must not change. S-3's earned policy, restated as a
   * regression: the researcher does not like the answer, runs the same check
   * again, and gets the number they wanted. The record must not let that
   * stand, and none of what follows may weaken it.
   */
  test("re-running the same check until it comes back green does not clear the failure", async () => {
    const { robustness, enquiry, observations, analysis } = await aResultHeldToARobustnessCheck();

    const firstRun = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: DISAGREES,
      finding: "median p = 0.21",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      value: "median p = 0.21",
      outcome: "fail",
      citing: { analysis: firstRun, proposition: DISAGREES },
    });

    // Same check, run again, unchanged. Nobody found anything wrong with the
    // first run — they just ran it a second time.
    const secondRun = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: AGREES,
      finding: "median p = 0.04",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      value: "median p = 0.04",
      outcome: "pass",
      citing: { analysis: secondRun, proposition: AGREES },
    });

    const why = await session.whySupported({ analysis, proposition: PROPOSITION });
    expect(await (await afterwards()).whySupported({ analysis, proposition: PROPOSITION })).toEqual(why);

    expect(why.supported).toBe(false);
    expect(why.unmet).toEqual([ROBUSTNESS]);
    const check = why.standard.find((c) => c.proposition === ROBUSTNESS);
    expect(check?.state).toBe("failed");
    expect(check?.decidedBy?.value).toBe("median p = 0.21");
    // Both runs remain readable. The failure is not erased, it is out-ranked
    // by nothing.
    expect(check?.evaluations.map((e) => e.outcome)).toEqual(["fail", "pass"]);
  });

  /**
   * Case 2, the one the shipped rule was never asked about, and the wrong
   * answer this scenario exists to demonstrate.
   *
   * Researcher: "The median check was broken — it dropped the last fold. I've
   *  fixed it and re-run it, and it agrees."
   *
   * Nothing about the result changed. What changed is that the earlier verdict
   * was reached against work that has since been reviewed and withdrawn, which
   * is a different situation from a verdict that still stands and is merely
   * old.
   */
  test("a check that was itself defective, corrected and re-run, no longer disqualifies the finding", async () => {
    const { robustness, enquiry, observations, analysis } = await aResultHeldToARobustnessCheck();

    const defective = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: DISAGREES,
      finding: "median p = 0.21",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      value: "median p = 0.21",
      outcome: "fail",
      citing: { analysis: defective, proposition: DISAGREES },
    });
    expect((await session.whySupported({ analysis, proposition: PROPOSITION })).supported).toBe(false);

    // The fault is found in the check, and the check is replaced -- the same
    // act S-11 established for an analysis that was wrong, aimed at a piece of
    // work that happens to be a check.
    const review = await session.recordReview({
      of: defective,
      verdict: "the aggregation dropped the last fold",
    });
    const corrected = await session.replaceAnalysis({
      supersedes: defective,
      because: review,
      enquiry,
      method: "median-aggregation, all folds",
      from: [observations],
      concludes: [{ proposition: AGREES, finding: "median p = 0.04" }],
    });
    await session.evaluateCriterion({
      criterion: robustness,
      value: "median p = 0.04",
      outcome: "pass",
      citing: { analysis: corrected.replacement, proposition: AGREES },
    });

    const why = await session.whySupported({ analysis, proposition: PROPOSITION });
    expect(await (await afterwards()).whySupported({ analysis, proposition: PROPOSITION })).toEqual(why);

    expect(why.supported).toBe(true);
    expect(why.unmet).toEqual([]);
    const check = why.standard.find((c) => c.proposition === ROBUSTNESS);
    expect(check?.state).toBe("passed");
    expect(check?.decidedBy?.value).toBe("median p = 0.04");
    // Afterward: "which historical evaluations remain readable?" -- both. The
    // withdrawn verdict is out-ranked, not deleted; a record that erased it
    // could not answer why the finding was ever in doubt.
    expect(check?.evaluations.map((e) => e.outcome)).toEqual(["fail", "pass"]);
  });

  /**
   * The same two cases through the other reader. `checksFrom()` is shared by
   * the work a condition gates and the finding it qualifies, which is exactly
   * why row X's blast radius grew when S-3b landed — so a fix that only
   * reaches one of them has fixed half a rule.
   */
  test("the same distinction holds for work a check gates, not just findings it qualifies", async () => {
    const { robustness, enquiry, observations } = await aResultHeldToARobustnessCheck();
    const tertiary = await session.planWork({
      objective: "fit the tertiary model",
      acceptance: "converges",
      mayRead: ["per-image results"],
    });
    const gate = await session.declareGate({
      governedBy: [robustness],
      consequence: "the tertiary model may be fitted",
      protecting: [tertiary],
    });

    const defective = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: DISAGREES,
      finding: "median p = 0.21",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      gate,
      value: "median p = 0.21",
      outcome: "fail",
      citing: { analysis: defective, proposition: DISAGREES },
    });
    expect((await session.gateStatus(gate)).state).toBe("blocked");

    const review = await session.recordReview({ of: defective, verdict: "the aggregation dropped the last fold" });
    const corrected = await session.replaceAnalysis({
      supersedes: defective,
      because: review,
      enquiry,
      method: "median-aggregation, all folds",
      from: [observations],
      concludes: [{ proposition: AGREES, finding: "median p = 0.04" }],
    });
    await session.evaluateCriterion({
      criterion: robustness,
      gate,
      value: "median p = 0.04",
      outcome: "pass",
      citing: { analysis: corrected.replacement, proposition: AGREES },
    });

    const status = await (await afterwards()).gateStatus(gate);
    expect(status.state).toBe("satisfied");
    expect(status.unmet).toEqual([]);
    // The guard has still been seen to fail. Correcting a defective check does
    // not turn it into a check nobody has shown can fail -- S-17's question is
    // about the criterion, and its answer is unchanged.
    expect(status.everFailed).toBe(true);
  });

  /**
   * The narrowing, stated as its own assertion rather than inferred from the
   * two cases above: what distinguishes them is whether the failing verdict's
   * basis still stands, and nothing else. Same criterion, same outcomes, same
   * order, same clock.
   */
  test("what separates the two cases is whether the failed verdict's basis was withdrawn", async () => {
    const { robustness, enquiry, observations, analysis } = await aResultHeldToARobustnessCheck();
    const failed = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: DISAGREES,
      finding: "median p = 0.21",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      value: "median p = 0.21",
      outcome: "fail",
      citing: { analysis: failed, proposition: DISAGREES },
    });
    const rerun = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: AGREES,
      finding: "median p = 0.04",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      value: "median p = 0.04",
      outcome: "pass",
      citing: { analysis: rerun, proposition: AGREES },
    });

    const reader = await afterwards();
    expect((await reader.whySupported({ analysis, proposition: PROPOSITION })).supported).toBe(false);

    // Now, and only now, is the first run found to have been faulty. Nothing
    // else about the record changes -- no new evaluation, no new check.
    const review = await session.recordReview({ of: failed, verdict: "the aggregation dropped the last fold" });
    await session.replaceAnalysis({
      supersedes: failed,
      because: review,
      enquiry,
      method: "median-aggregation, all folds",
      from: [observations],
      concludes: [{ proposition: AGREES, finding: "median p = 0.04" }],
    });

    expect((await (await afterwards()).whySupported({ analysis, proposition: PROPOSITION })).supported).toBe(true);
  });

  /**
   * A verdict nobody measured cannot be cleared this way, because there is
   * nothing to withdraw. S-8's distinction (row W) doing load-bearing work:
   * an asserted failure and a measured one must not become the same thing just
   * because one of them can now be retired.
   */
  test("a failure that cited nothing cannot be cleared by withdrawing something else", async () => {
    const { robustness, enquiry, observations, analysis } = await aResultHeldToARobustnessCheck();
    await session.evaluateCriterion({ criterion: robustness, value: "looked wrong to me", outcome: "fail" });

    const unrelated = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: AGREES,
      finding: "median p = 0.04",
    });
    const review = await session.recordReview({ of: unrelated, verdict: "the aggregation dropped the last fold" });
    await session.replaceAnalysis({
      supersedes: unrelated,
      because: review,
      enquiry,
      method: "median-aggregation, all folds",
      from: [observations],
      concludes: [{ proposition: AGREES, finding: "median p = 0.05" }],
    });

    const why = await (await afterwards()).whySupported({ analysis, proposition: PROPOSITION });
    expect(why.supported).toBe(false);
    expect(why.unmet).toEqual([ROBUSTNESS]);
  });
});
