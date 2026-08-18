/**
 * S-3 — "Significant by the primary test, untrustworthy by its own
 * robustness checks."
 * docs/project-journal/008_user_story_mining.md
 *
 * PJ-008 calls this its strongest single prediction: that
 * `CriterionEvaluation.outcome` being binary (`pass`/`fail`) cannot carry
 * this scenario's honest state. It also names the alternative worth testing
 * — that the individual checks really did pass and fail, and it is the
 * conclusion drawn from them that is inconclusive. This scenario is built to
 * discriminate between those, not to confirm either.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

const FIXED_NOW = "2026-08-19T09:00:00.000Z";
const clock: Clock = { now: () => FIXED_NOW };

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });
beforeEach(async () => {
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events });
});
afterEach(async () => { await scenario.end(); });

const PRIMARY = "Holm-corrected pairwise test is significant";
const MEDIAN = "median aggregation agrees with the mean";
const SEED = "seed-to-seed variation is within tolerance";

/**
 * The prespecified design: a tertiary model may only be fitted if the primary
 * result AND both robustness conditions hold.
 */
async function aPrespecifiedRobustnessDesign() {
  const tertiary = await session.planWork({
    objective: "fit the tertiary model",
    acceptance: "reached only if the preceding checks are consistent",
  });
  const primary = await session.stateCriterion(PRIMARY);
  const median = await session.stateCriterion(MEDIAN);
  const seed = await session.stateCriterion(SEED);
  const gate = await session.declareGate({
    governedBy: [primary, median, seed],
    consequence: "the tertiary analysis is reached only if the preceding checks are consistent",
    protecting: [tertiary],
  });
  return { tertiary, primary, median, seed, gate };
}

describe("S-3: significant by the primary test, untrustworthy by its own robustness checks", () => {
  test("Afterward 1: the result is inconclusive — neither effect confirmed nor null confirmed", async () => {
    const { primary, median, seed, gate } = await aPrespecifiedRobustnessDesign();

    await session.evaluateCriterion({ criterion: primary, gate, value: "p = 0.002, Holm-corrected", outcome: "pass" });
    await session.evaluateCriterion({ criterion: median, gate, value: "median aggregation p = 0.21", outcome: "fail" });
    await session.evaluateCriterion({ criterion: seed, gate, value: "MCSE exceeds the effect", outcome: "fail" });

    const status = await session.gateStatus(gate);
    // Not satisfied -- so the primary result does not carry the day...
    expect(status.state).toBe("blocked");
    // ...and not "never evaluated" either. The work was done; it disagreed.
    expect(status.state).not.toBe("never-evaluated");
    expect(status.evaluations).toHaveLength(3);
  });

  test("Afterward 2: the unmet condition is named before anyone spends the compute", async () => {
    const { primary, median, seed, gate } = await aPrespecifiedRobustnessDesign();
    await session.evaluateCriterion({ criterion: primary, gate, value: "p = 0.002", outcome: "pass" });
    await session.evaluateCriterion({ criterion: median, gate, value: "median p = 0.21", outcome: "fail" });
    await session.evaluateCriterion({ criterion: seed, gate, value: "MCSE exceeds the effect", outcome: "fail" });

    const status = await session.gateStatus(gate);
    expect(status.unmet.sort()).toEqual([MEDIAN, SEED].sort());
    expect(status.gating).toEqual(["fit the tertiary model"]);
  });

  /**
   * The assertion PJ-008 predicted would need a third outcome value. It does
   * not: each check is genuinely binary, and what the three of them jointly
   * fail to establish is carried one layer up.
   */
  test("Afterward 3: checks are itemised, and a failure is distinguishable from a check never run", async () => {
    const { primary, median, gate } = await aPrespecifiedRobustnessDesign();

    await session.evaluateCriterion({ criterion: primary, gate, value: "p = 0.002", outcome: "pass" });
    await session.evaluateCriterion({ criterion: median, gate, value: "median p = 0.21", outcome: "fail" });
    // Seed stability is never evaluated at all.

    const status = await session.gateStatus(gate);
    const byName = Object.fromEntries(status.checks.map((c) => [c.criterion, c.state]));
    expect(byName[PRIMARY]).toBe("passed");
    expect(byName[MEDIAN]).toBe("failed");
    expect(byName[SEED]).toBe("never-run");
    // Three genuinely different states, none of them a synthetic failure.
    expect(new Set(Object.values(byName)).size).toBe(3);
  });

  test("some checks run, none failing, is not the same as all of them passing", async () => {
    const { primary, gate } = await aPrespecifiedRobustnessDesign();
    await session.evaluateCriterion({ criterion: primary, gate, value: "p = 0.002", outcome: "pass" });

    const status = await session.gateStatus(gate);
    expect(status.state).toBe("incomplete");
    expect(status.state).not.toBe("satisfied");
    expect(status.unmet.sort()).toEqual([MEDIAN, SEED].sort());
  });

  /**
   * "...and nothing else silently." Establishing one outstanding condition
   * must not be reported as unblocking work that other conditions still hold.
   */
  test("Afterward 4: establishing one outstanding check does not silently unblock the work", async () => {
    const { primary, median, seed, gate } = await aPrespecifiedRobustnessDesign();
    await session.evaluateCriterion({ criterion: primary, gate, value: "p = 0.002", outcome: "pass" });
    await session.evaluateCriterion({ criterion: median, gate, value: "median p = 0.21", outcome: "fail" });
    await session.evaluateCriterion({ criterion: seed, gate, value: "MCSE exceeds the effect", outcome: "fail" });

    // Seed stability is later established on a re-run.
    await session.evaluateCriterion({ criterion: seed, gate, value: "MCSE now within tolerance", outcome: "pass" });

    const status = await session.gateStatus(gate);
    expect(status.state).toBe("blocked");
    expect(status.unmet).toContain(MEDIAN);
    expect(status.gating).toEqual(["fit the tertiary model"]);
  });

  /**
   * Afterward 1, asked of the CLAIM rather than the gate.
   *
   * The conversation's question is "does that overturn the old null?", and
   * LabKit's answer is "not yet — the prespecified robustness criteria
   * disagree". The criteria are therefore doing two jobs: gating downstream
   * work, AND qualifying whether the present finding can be relied on. Only
   * the first is modelled. This test asks for the second.
   */
  test("is the primary finding trustworthy? — the criteria that qualify it", async () => {
    const { primary, median, seed, gate } = await aPrespecifiedRobustnessDesign();
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
      concludes: [{ proposition: "T differs from rewired", finding: "p = 0.002, Holm-corrected" }],
    });

    await session.evaluateCriterion({ criterion: primary, gate, value: "p = 0.002", outcome: "pass" });
    await session.evaluateCriterion({ criterion: median, gate, value: "median p = 0.21", outcome: "fail" });
    await session.evaluateCriterion({ criterion: seed, gate, value: "MCSE exceeds the effect", outcome: "fail" });

    // The gate knows the checks disagreed.
    const status = await session.gateStatus(gate);
    expect(status.state).toBe("blocked");

    // But the finding itself is reported as plainly supported. Nothing
    // connects the prespecified criteria to the analysis they qualify, so
    // "supported" here means "some evidence exists", not "the evidence holds
    // up by its own prespecified standard".
    //
    // Asserted as it currently behaves, deliberately -- this is the wrong
    // answer, tracked as ledger row V, and if someone fixes it this test
    // should fail and be updated on purpose rather than silently drift.
    const why = await session.whySupported("T differs from rewired");
    expect(why.supported).toBe(true); // WRONG: two prespecified checks failed
    expect(analysis.kind).toBe("analysis");
  });

  test("re-running a failed check until it passes does not clear it", async () => {
    const { primary, median, seed, gate } = await aPrespecifiedRobustnessDesign();
    await session.evaluateCriterion({ criterion: primary, gate, value: "p = 0.002", outcome: "pass" });
    await session.evaluateCriterion({ criterion: seed, gate, value: "within tolerance", outcome: "pass" });
    await session.evaluateCriterion({ criterion: median, gate, value: "median p = 0.21", outcome: "fail" });
    await session.evaluateCriterion({ criterion: median, gate, value: "median p = 0.04 on a second run", outcome: "pass" });

    const status = await session.gateStatus(gate);
    expect(status.state).toBe("blocked");
    expect(status.unmet).toEqual([MEDIAN]);
    expect(status.everFailed).toBe(true);
  });
});
