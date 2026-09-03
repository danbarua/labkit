/**
 * S-3 — "Significant by the primary test, untrustworthy by its own
 * robustness checks."
 * docs/project-journal/008_user_story_mining.md
 *
 * The prediction under test: that `CriterionEvaluation.outcome` being binary
 * (`pass`/`fail`) cannot carry this scenario's honest state. The alternative
 * worth testing is that the individual checks really did pass and fail, and
 * it is the conclusion drawn from them that is inconclusive. This scenario is
 * built to discriminate between those, not to confirm either.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, whyOf } from "../helpers/claims";
import { recordAnalysis } from "../../fragments";
import { decidedOn, evaluationsOf } from "../helpers/criteria";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

const FIXED_NOW = "2026-08-19T09:00:00.000Z";
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
  session = new ResearchSession(graph, { clock, events });
});
afterEach(async () => {
  await scenario.end();
});

/**
 * A second reader over the same graph, with an event log of its own. Every
 * gate status below is re-read through one of these and compared whole: a
 * status returned by the session that wrote it could be held in that session's
 * memory, and "Afterward" means reconstructible from durable state.
 */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

const PRIMARY = "Holm-corrected pairwise test is significant";
const MEDIAN = "median aggregation agrees with the mean";
const SEED = "seed-to-seed variation is within tolerance";

/**
 * The prespecified design: a tertiary model may only be fitted if the primary
 * result AND both robustness conditions hold.
 */
async function aPrespecifiedRobustnessDesign() {
  const { work: tertiary } = await session.planWork({
    objective: "fit the tertiary model",
    acceptance: "reached only if the preceding checks are consistent",
  });
  const { criterion: primary } = await session.stateCriterion(PRIMARY);
  const { criterion: median } = await session.stateCriterion(MEDIAN);
  const { criterion: seed } = await session.stateCriterion(SEED);
  const { gate } = await session.declareGate({
    governedBy: [primary, median, seed],
    consequence: "the tertiary analysis is reached only if the preceding checks are consistent",
    protecting: [tertiary],
  });
  return { tertiary, primary, median, seed, gate };
}

describe("S-3: significant by the primary test, untrustworthy by its own robustness checks", () => {
  test("Afterward 1: the result is inconclusive — neither effect confirmed nor null confirmed", async () => {
    const { primary, median, seed, gate } = await aPrespecifiedRobustnessDesign();

    await session.evaluateCriterion({
      criterion: primary,
      gate,
      value: "p = 0.002, Holm-corrected",
      outcome: "pass",
    });
    await session.evaluateCriterion({
      criterion: median,
      gate,
      value: "median aggregation p = 0.21",
      outcome: "fail",
    });
    await session.evaluateCriterion({
      criterion: seed,
      gate,
      value: "MCSE exceeds the effect",
      outcome: "fail",
    });

    const status = await session.gateStatus(gate);
    expect(await (await afterwards()).gateStatus(gate)).toEqual(status);
    // Not satisfied -- so the primary result does not carry the day...
    expect(status.state).toBe("blocked");
    // ...and not "never evaluated" either. The work was done; it disagreed.
    expect(status.state).not.toBe("never-evaluated");
    // Three evaluations across the gate's checks, reached through the
    // drill-down: a gate carries states, not verdict text (#241).
    const perCheck = await Promise.all(status.checks.map((c) => evaluationsOf(session, c)));
    expect(perCheck.flat()).toHaveLength(3);
  });

  test("Afterward 2: the unmet condition is named before anyone spends the compute", async () => {
    const { primary, median, seed, gate } = await aPrespecifiedRobustnessDesign();
    await session.evaluateCriterion({
      criterion: primary,
      gate,
      value: "p = 0.002",
      outcome: "pass",
    });
    await session.evaluateCriterion({
      criterion: median,
      gate,
      value: "median p = 0.21",
      outcome: "fail",
    });
    await session.evaluateCriterion({
      criterion: seed,
      gate,
      value: "MCSE exceeds the effect",
      outcome: "fail",
    });

    const status = await session.gateStatus(gate);
    expect(await (await afterwards()).gateStatus(gate)).toEqual(status);
    expect(status.unmet.map((u) => u.requires).sort()).toEqual([MEDIAN, SEED].sort());
    expect(status.gating.map((g) => g.objective)).toEqual(["fit the tertiary model"]);
  });

  /**
   * This does not need a third outcome value: each check is genuinely
   * binary, and what the three of them jointly fail to establish is carried
   * one layer up.
   */
  test("Afterward 3: checks are itemised, and a failure is distinguishable from a check never run", async () => {
    const { primary, median, gate } = await aPrespecifiedRobustnessDesign();

    await session.evaluateCriterion({
      criterion: primary,
      gate,
      value: "p = 0.002",
      outcome: "pass",
    });
    await session.evaluateCriterion({
      criterion: median,
      gate,
      value: "median p = 0.21",
      outcome: "fail",
    });
    // Seed stability is never evaluated at all.

    const status = await session.gateStatus(gate);
    expect(await (await afterwards()).gateStatus(gate)).toEqual(status);
    // Keyed by proposition for readability here; `criterion` is the stable
    // identity and two criteria worded alike are two criteria.
    const byName = Object.fromEntries(status.checks.map((c) => [c.proposition, c.state]));
    expect(byName[PRIMARY]).toBe("passed");
    expect(byName[MEDIAN]).toBe("failed");
    expect(byName[SEED]).toBe("never-run");
    // Three genuinely different states, none of them a synthetic failure.
    expect(new Set(Object.values(byName)).size).toBe(3);
  });

  test("some checks run, none failing, is not the same as all of them passing", async () => {
    const { primary, gate } = await aPrespecifiedRobustnessDesign();
    await session.evaluateCriterion({
      criterion: primary,
      gate,
      value: "p = 0.002",
      outcome: "pass",
    });

    const status = await session.gateStatus(gate);
    expect(await (await afterwards()).gateStatus(gate)).toEqual(status);
    expect(status.state).toBe("incomplete");
    expect(status.state).not.toBe("satisfied");
    expect(status.unmet.map((u) => u.requires).sort()).toEqual([MEDIAN, SEED].sort());
  });

  /**
   * "...and nothing else silently." Establishing one outstanding condition
   * must not be reported as unblocking work that other conditions still hold.
   */
  test("Afterward 4: establishing one outstanding check does not silently unblock the work", async () => {
    const { primary, median, seed, gate } = await aPrespecifiedRobustnessDesign();
    await session.evaluateCriterion({
      criterion: primary,
      gate,
      value: "p = 0.002",
      outcome: "pass",
    });
    await session.evaluateCriterion({
      criterion: median,
      gate,
      value: "median p = 0.21",
      outcome: "fail",
    });
    await session.evaluateCriterion({
      criterion: seed,
      gate,
      value: "MCSE exceeds the effect",
      outcome: "fail",
    });

    // Seed stability is later established on a re-run.
    await session.evaluateCriterion({
      criterion: seed,
      gate,
      value: "MCSE now within tolerance",
      outcome: "pass",
    });

    const status = await session.gateStatus(gate);
    expect(await (await afterwards()).gateStatus(gate)).toEqual(status);
    expect(status.state).toBe("blocked");
    expect(status.unmet.map((u) => u.requires)).toContain(MEDIAN);
    expect(status.gating.map((g) => g.objective)).toEqual(["fit the tertiary model"]);
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
    // Both jobs, named explicitly: the same three checks gate the tertiary
    // model and are the standard this analysis is held to.
    const { enquiry } = await session.openEnquiry("does T differ from rewired?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "per-image results",
      finding: "per-image accuracy, 10,000 images",
    });
    const { analysis } = await recordAnalysis(session, {
      enquiry,
      method: "holm-pairwise",
      from: [observations],
      concludes: [
        {
          proposition: "T differs from rewired",
          finding: "p = 0.002, Holm-corrected",
        },
      ],
      heldTo: [primary, median, seed],
    });

    await session.evaluateCriterion({
      criterion: primary,
      gate,
      value: "p = 0.002",
      outcome: "pass",
    });
    await session.evaluateCriterion({
      criterion: median,
      gate,
      value: "median p = 0.21",
      outcome: "fail",
    });
    await session.evaluateCriterion({
      criterion: seed,
      gate,
      value: "MCSE exceeds the effect",
      outcome: "fail",
    });

    // The gate knows the checks disagreed.
    const status = await session.gateStatus(gate);
    expect(await (await afterwards()).gateStatus(gate)).toEqual(status);
    expect(status.state).toBe("blocked");

    // And so does the finding: `QUALIFIES` connects the prespecified criteria
    // to the analysis they qualify, so "supported" means "the evidence holds
    // up by its own prespecified standard", not just "some evidence exists".
    // See tests/scenarios/s3b_criteria_qualify_only.test.ts.
    const why = await session.whySupported(await claimNamed(session, "T differs from rewired"));
    expect(await whyOf(await afterwards(), "T differs from rewired")).toEqual(why);
    expect(why.supported).toBe(false);
    expect([...why.unmet.map((u) => u.requires)].sort()).toEqual([MEDIAN, SEED].sort());
    // Disqualified, not withdrawn: the numbers are exactly as they were.
    expect(why.support.map((s) => ({ finding: s.finding, method: s.method }))).toEqual([
      { finding: "p = 0.002, Holm-corrected", method: "holm-pairwise" },
    ]);
    expect(analysis).toMatch(/^COMP_/);
  });

  /**
   * Two criteria worded identically are two criteria. Aggregating by
   * proposition text would collapse them into one check.
   */
  test("two criteria worded identically are two separate checks", async () => {
    const { work } = await session.planWork({
      objective: "downstream work",
      acceptance: "both hold",
    });
    const { criterion: first } = await session.stateCriterion("seed stability is adequate");
    const { criterion: second } = await session.stateCriterion("seed stability is adequate");
    const { gate } = await session.declareGate({
      governedBy: [first, second],
      consequence: "block unless both hold",
      protecting: [work],
    });

    await session.evaluateCriterion({
      criterion: first,
      gate,
      value: "within tolerance",
      outcome: "pass",
    });

    const status = await session.gateStatus(gate);
    expect(await (await afterwards()).gateStatus(gate)).toEqual(status);
    expect(status.checks).toHaveLength(2);
    expect(new Set(status.checks.map((c) => c.criterion)).size).toBe(2);
    // One checked, one not -- which the collapsed version could not express.
    expect(status.checks.filter((c) => c.state === "passed")).toHaveLength(1);
    expect(status.checks.filter((c) => c.state === "never-run")).toHaveLength(1);
    expect(status.state).toBe("incomplete");
  });

  /**
   * Which evaluation is reported as deciding a check must not depend on the
   * order Cypher happens to return rows.
   */
  test("the evaluation that decided a failed check is the failing one, deterministically", async () => {
    const { primary, median, seed, gate } = await aPrespecifiedRobustnessDesign();
    await session.evaluateCriterion({
      criterion: primary,
      gate,
      value: "p = 0.002",
      outcome: "pass",
    });
    await session.evaluateCriterion({
      criterion: seed,
      gate,
      value: "within tolerance",
      outcome: "pass",
    });
    await session.evaluateCriterion({
      criterion: median,
      gate,
      value: "median p = 0.21",
      outcome: "fail",
    });
    await session.evaluateCriterion({
      criterion: median,
      gate,
      value: "median p = 0.04 on a second run",
      outcome: "pass",
    });

    const check = (await session.gateStatus(gate)).checks.find((c) => c.proposition === MEDIAN)!;
    expect(check.state).toBe("failed");
    // The decisive record is the failure, not whichever row came back last.
    // The check names which evaluation decided it; what that evaluation said
    // is a question about the criterion (#241).
    expect(check.decidedBy?.outcome).toBe("fail");
    expect(await decidedOn(session, check)).toBe("median p = 0.21");
    // ...and the history is retained rather than overwritten.
    expect(await evaluationsOf(session, check)).toHaveLength(2);
  });

  test("re-running a failed check until it passes does not clear it", async () => {
    const { primary, median, seed, gate } = await aPrespecifiedRobustnessDesign();
    await session.evaluateCriterion({
      criterion: primary,
      gate,
      value: "p = 0.002",
      outcome: "pass",
    });
    await session.evaluateCriterion({
      criterion: seed,
      gate,
      value: "within tolerance",
      outcome: "pass",
    });
    await session.evaluateCriterion({
      criterion: median,
      gate,
      value: "median p = 0.21",
      outcome: "fail",
    });
    await session.evaluateCriterion({
      criterion: median,
      gate,
      value: "median p = 0.04 on a second run",
      outcome: "pass",
    });

    const status = await session.gateStatus(gate);
    expect(await (await afterwards()).gateStatus(gate)).toEqual(status);
    expect(status.state).toBe("blocked");
    expect(status.unmet.map((u) => u.requires)).toEqual([MEDIAN]);
    expect(status.everFailed).toBe(true);
  });
});
