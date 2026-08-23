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
import { claimNamed, claimOf } from "../helpers/claims";

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
  const { analysis: analysis, claims: analysisClaims } = await session.recordAnalysis({
    enquiry,
    method: "holm-pairwise",
    from: [observations],
    concludes: [{ proposition: PROPOSITION, finding: "p = 0.002, Holm-corrected" }],
    heldTo: [robustness],
  });
  return { robustness, enquiry, observations, analysis, analysisClaims };
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
  return await session.recordAnalysis({ enquiry, method, from: [observations], concludes: [concludes] });
}

describe("S-3c: the check was wrong, not the result", () => {
  /**
   * Case 1, which must not change. S-3's earned policy, restated as a
   * regression: the researcher does not like the answer, runs the same check
   * again, and gets the number they wanted. The record must not let that
   * stand, and none of what follows may weaken it.
   */
  test("re-running the same check until it comes back green does not clear the failure", async () => {
    const { robustness, enquiry, observations, analysis, analysisClaims } = await aResultHeldToARobustnessCheck();

    const { analysis: firstRun, claims: firstRunClaims } = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: DISAGREES,
      finding: "median p = 0.21",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      value: "median p = 0.21",
      outcome: "fail",
      citing: claimOf(firstRunClaims, DISAGREES),
    });

    // Same check, run again, unchanged. Nobody found anything wrong with the
    // first run — they just ran it a second time.
    const { analysis: secondRun, claims: secondRunClaims } = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: AGREES,
      finding: "median p = 0.04",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      value: "median p = 0.04",
      outcome: "pass",
      citing: claimOf(secondRunClaims, AGREES),
    });

    const why = await session.whySupported(claimOf(analysisClaims, PROPOSITION));
    expect(await (await afterwards()).whySupported(claimOf(analysisClaims, PROPOSITION))).toEqual(why);

    expect(why.supported).toBe(false);
    expect(why.unmet.map((u) => u.requires)).toEqual([ROBUSTNESS]);
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
    const { robustness, enquiry, observations, analysis, analysisClaims } = await aResultHeldToARobustnessCheck();

    const { analysis: defective, claims: defectiveClaims } = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: DISAGREES,
      finding: "median p = 0.21",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      value: "median p = 0.21",
      outcome: "fail",
      citing: claimOf(defectiveClaims, DISAGREES),
    });
    expect((await session.whySupported(claimOf(analysisClaims, PROPOSITION))).supported).toBe(false);

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
      citing: await claimNamed(session, AGREES),
    });

    const why = await session.whySupported(claimOf(analysisClaims, PROPOSITION));
    expect(await (await afterwards()).whySupported(claimOf(analysisClaims, PROPOSITION))).toEqual(why);

    expect(why.supported).toBe(true);
    expect(why.unmet.map((u) => u.requires)).toEqual([]);
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

    const { analysis: defective, claims: defectiveClaims } = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: DISAGREES,
      finding: "median p = 0.21",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      gate,
      value: "median p = 0.21",
      outcome: "fail",
      citing: claimOf(defectiveClaims, DISAGREES),
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
      citing: await claimNamed(session, AGREES),
    });

    const status = await (await afterwards()).gateStatus(gate);
    expect(status.state).toBe("satisfied");
    expect(status.unmet.map((u) => u.requires)).toEqual([]);
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
    const { robustness, enquiry, observations, analysis, analysisClaims } = await aResultHeldToARobustnessCheck();
    const { analysis: failed, claims: failedClaims } = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: DISAGREES,
      finding: "median p = 0.21",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      value: "median p = 0.21",
      outcome: "fail",
      citing: claimOf(failedClaims, DISAGREES),
    });
    const { analysis: rerun, claims: rerunClaims } = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: AGREES,
      finding: "median p = 0.04",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      value: "median p = 0.04",
      outcome: "pass",
      citing: claimOf(rerunClaims, AGREES),
    });

    const reader = await afterwards();
    expect((await reader.whySupported(claimOf(analysisClaims, PROPOSITION))).supported).toBe(false);

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

    expect((await (await afterwards()).whySupported(claimOf(analysisClaims, PROPOSITION))).supported).toBe(true);
  });

  /**
   * A verdict nobody measured cannot be cleared this way, because there is
   * nothing to withdraw. S-8's distinction (row W) doing load-bearing work:
   * an asserted failure and a measured one must not become the same thing just
   * because one of them can now be retired.
   */
  test("a failure that cited nothing cannot be cleared by withdrawing something else", async () => {
    const { robustness, enquiry, observations, analysis, analysisClaims } = await aResultHeldToARobustnessCheck();
    await session.evaluateCriterion({ criterion: robustness, value: "looked wrong to me", outcome: "fail" });

    const { analysis: unrelated, claims: unrelatedClaims } = await theCheckIsRun(enquiry, observations, "median-aggregation", {
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

    const why = await (await afterwards()).whySupported(claimOf(analysisClaims, PROPOSITION));
    expect(why.supported).toBe(false);
    expect(why.unmet.map((u) => u.requires)).toEqual([ROBUSTNESS]);
  });

  /**
   * External review, finding 2. The state between "the check was found
   * defective" and "the corrected check has been re-run".
   *
   * S-3c's own tests never reach it: the corrected case records a replacement
   * pass immediately, and the narrowing test has an older pass available. With
   * neither, every verdict on the check is withdrawn and `checksFrom()` falls
   * through to `never-run` — while `evaluations` still lists the withdrawn
   * failure. The check certainly ran; what it has is no verdict that stands.
   */
  test("a check whose every verdict has been withdrawn has no standing verdict, and did not never-run", async () => {
    const { robustness, enquiry, observations, analysis, analysisClaims } = await aResultHeldToARobustnessCheck();
    const { analysis: defective, claims: defectiveClaims } = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: DISAGREES,
      finding: "median p = 0.21",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      value: "median p = 0.21",
      outcome: "fail",
      citing: claimOf(defectiveClaims, DISAGREES),
    });

    // The check is found faulty and retired. Nobody has re-run it yet.
    const review = await session.recordReview({ of: defective, verdict: "the aggregation dropped the last fold" });
    await session.replaceAnalysis({
      supersedes: defective,
      because: review,
      enquiry,
      method: "median-aggregation, all folds",
      from: [observations],
      concludes: [{ proposition: AGREES, finding: "median p = 0.04" }],
    });

    const why = await (await afterwards()).whySupported(claimOf(analysisClaims, PROPOSITION));
    const check = why.standard.find((c) => c.proposition === ROBUSTNESS);
    expect(check?.state).toBe("no-standing-verdict");
    expect(check?.decidedBy).toBeUndefined();
    // The history is intact, which is what makes `never-run` a contradiction
    // rather than merely a poor label.
    expect(check?.evaluations.map((e) => e.outcome)).toEqual(["fail"]);
    expect(check?.evaluations[0]?.withdrawn).toBe(true);
    // And the finding does not stand: nothing has met the agreed standard.
    expect(why.supported).toBe(false);
    expect(why.unmet.map((u) => u.requires)).toEqual([ROBUSTNESS]);
  });

  /**
   * External review, finding 1 — the blocking one, as a negative test.
   *
   * `replaceAnalysis()` invalidates the superseded output *before* recording
   * the replacement. Since S-3c, invalidating an output withdraws the criterion
   * evaluations that cited it, so a failure can stop counting. If the
   * replacement write then fails, the record is left with a failure that no
   * longer decides its check and no corrected check in existence — a partially
   * committed scientific state, which is the thing LabKit exists to prevent.
   *
   * The failure is provoked through a real guard rather than a mock:
   * `recordAnalysis()` refuses to re-assert a withdrawn proposition.
   */
  test("a replacement that cannot be completed leaves the earlier failure standing", async () => {
    const { robustness, enquiry, observations, analysis, analysisClaims } = await aResultHeldToARobustnessCheck();
    const { analysis: defective, claims: defectiveClaims } = await theCheckIsRun(enquiry, observations, "median-aggregation", {
      proposition: DISAGREES,
      finding: "median p = 0.21",
    });
    await session.evaluateCriterion({
      criterion: robustness,
      value: "median p = 0.21",
      outcome: "fail",
      citing: claimOf(defectiveClaims, DISAGREES),
    });

    // Retire the proposition the replacement is going to try to re-assert, so
    // the second half of the compound action is guaranteed to be refused.
    await session.reinterpret({
      of: claimOf(defectiveClaims, DISAGREES),
      as: "the median aggregation was never computed correctly",
      because: "the fold handling was wrong throughout",
    });

    const before = await (await afterwards()).whySupported(claimOf(analysisClaims, PROPOSITION));
    const review = await session.recordReview({ of: defective, verdict: "the aggregation dropped the last fold" });
    await expect(
      session.replaceAnalysis({
        supersedes: defective,
        because: review,
        enquiry,
        method: "median-aggregation, all folds",
        from: [observations],
        concludes: [{ proposition: DISAGREES, finding: "median p = 0.04" }],
      }),
    ).rejects.toThrow();

    // Nothing moved. The command failed whole.
    const after = await (await afterwards()).whySupported(claimOf(analysisClaims, PROPOSITION));
    expect(after).toEqual(before);
  });
});
