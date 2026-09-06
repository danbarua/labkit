/**
 * S-25: one decision rule, four comparisons, four verdicts.
 *
 * **Researcher:** The rule is the same for every control — the difference has
 * to clear the noise floor. I ran it against four. Two passed, two didn't.
 *
 * **Agent:** One criterion, four verdicts, each saying which comparison it
 * judged.
 *
 * From Bonsai's Stage 1D (#133). Before this, a criterion carried one verdict
 * and nothing said what a verdict was about — so recording four meant stating
 * the criterion four times with identical wording. The rule then existed once
 * in the researcher's head and four times on the record, with nothing joining
 * the copies, and `gate` printed four indistinguishable lines.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;

let tick = 0;
const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 8, 5, 20, tick++)).toISOString(),
};

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  tick = 0;
  session = new ResearchSession(await scenario.begin(), { clock });
});
afterEach(async () => {
  await scenario.end();
});

const afterwards = async () => new ResearchSession(await scenario.current(), { clock });

const RULE = "the difference must exceed the noise floor of the paired scores";

const CONTROLS = [
  ["lattice", "T beats the lattice control", "pass" as const, "1.9% [0.4, 3.4]"],
  ["stochastic-A", "T beats stochastic control A", "fail" as const, "0.2% [-1.0, 1.4]"],
  ["stochastic-B", "T beats stochastic control B", "fail" as const, "0.1% [-0.9, 1.1]"],
  ["stochastic-C", "T beats stochastic control C", "pass" as const, "1.6% [0.2, 3.0]"],
] as const;

/** One rule, one gate, and four comparisons judged against it. */
async function fourComparisonsUnderOneRule() {
  const { enquiry } = await session.openEnquiry("does T beat the controls?");
  const { work } = await session.planWork({
    objective: "publish the stage 2 result",
    acceptance: "every control cleared",
  });
  const { criterion } = await session.stateCriterion(RULE);
  const { gate } = await session.declareGate({
    governedBy: [criterion],
    consequence: "the result is not published",
    protecting: [work],
  });

  const judged: { claim: ReturnType<typeof claimOf>; outcome: "pass" | "fail" }[] = [];
  for (const [name, proposition, outcome, value] of CONTROLS) {
    const { observations } = await session.recordObservations({
      enquiry,
      name: `${name} run`,
      finding: `paired scores, ${name}`,
    });
    const { claims } = await recordAnalysis(session, {
      enquiry,
      method: `paired comparison, ${name}`,
      from: [observations],
      concludes: [{ proposition, finding: value }],
    });
    const claim = claimOf(claims, proposition);
    // The same criterion every time. What differs is the finding judged.
    await session.evaluateCriterion({ criterion, gate, about: claim, value, outcome });
    judged.push({ claim, outcome });
  }
  return { criterion, gate, judged };
}

describe("S-25: one rule judged four times", () => {
  test("four verdicts under one criterion, each naming what it judged", async () => {
    const { criterion, judged } = await fourComparisonsUnderOneRule();

    const standing = await (await afterwards()).criterionStanding(criterion);
    expect(standing.evaluations).toHaveLength(4);

    // Each verdict says which comparison it is about. Without this they are
    // four lines differing only in a value, and a reader cannot say which
    // control failed.
    const about = standing.evaluations.map((e) => e.about);
    expect(about.sort()).toEqual(judged.map((j) => j.claim).sort());
  });

  test("the rule is stated once, not once per comparison", async () => {
    await fourComparisonsUnderOneRule();

    // The defect this replaces: four criteria carrying identical wording, with
    // nothing joining them. `claimsAsserting` is the wrong tool for a criterion,
    // so the check is over what `search` finds.
    const found = await (await afterwards()).search("noise floor");
    const criteria = found.find((g) => g.label === "Criterion");
    expect(criteria?.matches).toHaveLength(1);
  });

  test("one failing comparison blocks the gate, and the gate says which", async () => {
    const { gate, judged } = await fourComparisonsUnderOneRule();

    const status = await (await afterwards()).gateStatus(gate);
    expect(status.state).toBe("blocked");

    // **One condition per comparison, not one per criterion.** A rule held
    // against four controls is four conditions on this gate, so the two that
    // failed are two failed checks naming which comparison — the answer to
    // "which control did we not clear?", which is the question a blocked gate
    // raises. Folding them into one line reported a single state for four
    // different answers (#293).
    expect(status.checks).toHaveLength(4);
    const failed = judged.filter((j) => j.outcome === "fail").map((j) => String(j.claim));
    const reportedFailed = status.checks
      .filter((c) => c.state === "failed")
      .map((c) => String(c.about))
      .sort();
    expect(reportedFailed).toEqual(failed.sort());
  });

  test("a verdict on the criterion as a whole names nothing, and still counts", async () => {
    const { criterion, gate } = await fourComparisonsUnderOneRule();

    // The ordinary case, unchanged: a check evaluated as a whole. `about` is
    // absent rather than a placeholder, because a reader meeting an empty
    // field cannot tell it from one nobody filled in.
    await session.evaluateCriterion({
      criterion,
      gate,
      value: "reviewed across all four",
      outcome: "fail",
    });

    const standing = await (await afterwards()).criterionStanding(criterion);
    expect(standing.evaluations).toHaveLength(5);
    expect(standing.evaluations.filter((e) => e.about === undefined)).toHaveLength(1);
  });
});
