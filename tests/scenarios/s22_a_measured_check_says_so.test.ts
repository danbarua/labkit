/**
 * S-22: a measured check reads as measured.
 *
 * **Researcher:** The go/no-go was a pipeline-health count — 0 of 240,000
 * evolutions failed, 270 of 270 fits converged. I recorded it as observations.
 * Now I want the gate's check to say it passed *on that*.
 *
 * **Agent:** The verdict cites the observations.
 *
 * From Bonsai's Stage 2A (#150). Before this, `--citing` took only a claim, so
 * a check backed by counts had to be recorded citing nothing — and an empty
 * basis is what the record reads as **asserted**. The measured verdict and the
 * asserted one came out identical, with the measured one mislabelled.
 *
 * The workaround was worse than the gap: `analyse` the counts into a claim
 * ("the pipeline ran clean") and cite that, which manufactures a scientific
 * finding for a non-scientific check and files it under a question in `known`.
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
  now: () => new Date(Date.UTC(2026, 8, 5, 12, tick++)).toISOString(),
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

const HEALTH = "the evolution pipeline runs clean at scale";

/** A gate over one prespecified check, and the observations that decide it. */
async function aGoNoGoGate() {
  const { enquiry } = await session.openEnquiry("is stage 2A safe to start?");
  const { work } = await session.planWork({
    objective: "run stage 2A",
    acceptance: "the pipeline is healthy",
  });
  const { criterion } = await session.stateCriterion(HEALTH);
  const { gate } = await session.declareGate({
    governedBy: [criterion],
    consequence: "stage 2A does not start",
    protecting: [work],
  });
  const { observations } = await session.recordObservations({
    enquiry,
    name: "stage2a_go_no_go",
    finding: "0/240,000 evolutions failed, 0 non-finite features, 270/270 fits converged",
  });
  return { enquiry, criterion, gate, observations };
}

describe("S-22: a check decided by measurement says so", () => {
  test("a verdict rests on the observations that decided it", async () => {
    const { criterion, gate, observations } = await aGoNoGoGate();

    await session.evaluateCriterion({
      criterion,
      gate,
      value: "0 failures of 240,000",
      outcome: "pass",
      citing: [observations],
    });

    // Afterward: the check reports what it was decided against, so a reader
    // can tell this from a verdict somebody simply asserted.
    const standing = await (await afterwards()).criterionStanding(criterion);
    const [verdict] = standing.evaluations;
    expect(verdict!.basis).toHaveLength(1);
    expect(verdict!.basis[0]!.states).toContain("0/240,000");
  });

  test("citing nothing still reads as asserted, which is the contrast", async () => {
    const { criterion, gate } = await aGoNoGoGate();

    await session.evaluateCriterion({
      criterion,
      gate,
      value: "looks fine",
      outcome: "pass",
    });

    const standing = await (await afterwards()).criterionStanding(criterion);
    expect(standing.evaluations[0]!.basis).toEqual([]);
  });

  test("a claim is still a route to the finding under it", async () => {
    const { enquiry, criterion, gate, observations } = await aGoNoGoGate();
    const { claims } = await recordAnalysis(session, {
      enquiry,
      method: "health summary",
      from: [observations],
      concludes: [{ proposition: HEALTH, finding: "no failures observed" }],
    });

    await session.evaluateCriterion({
      criterion,
      gate,
      value: "0 failures",
      outcome: "pass",
      citing: [claimOf(claims, HEALTH)],
    });

    const standing = await (await afterwards()).criterionStanding(criterion);
    expect(standing.evaluations[0]!.basis[0]!.states).toBe("no failures observed");
  });

  test("a check decided by several measurements rests on all of them", async () => {
    const { enquiry, criterion, gate, observations } = await aGoNoGoGate();
    const { observations: fits } = await session.recordObservations({
      enquiry,
      name: "stage2a_fits",
      finding: "6/6 hierarchical fits converged",
    });

    await session.evaluateCriterion({
      criterion,
      gate,
      value: "both arms clean",
      outcome: "pass",
      citing: [observations, fits],
    });

    // Both, not one: citing a single measurement would name an arbitrary part
    // as what decided a check that read two.
    const standing = await (await afterwards()).criterionStanding(criterion);
    expect(standing.evaluations[0]!.basis).toHaveLength(2);
  });

  test("citing an observations record that recorded no finding is refused", async () => {
    const { criterion, gate, work } = { ...(await aGoNoGoGate()), work: undefined };
    const { analysis } = await session.recordAnalysis({
      enquiry: (await session.openEnquiry("anything else?")).enquiry,
      method: "a run with no output read back",
      from: [],
    });
    void work;

    await expect(
      session.evaluateCriterion({
        criterion,
        gate,
        value: "?",
        outcome: "pass",
        // An analysis handle names a Computation, not evidence.
        citing: [analysis as never],
      }),
    ).rejects.toThrow(/no finding is recorded in/);
  });
});
