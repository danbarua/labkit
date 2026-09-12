/**
 * why <task> leads with the state work already computes.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;

let tick = 0;
const clock: Clock = { now: () => new Date(Date.UTC(2026, 8, 11, 12, tick++)).toISOString() };

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

async function anEnquiry() {
  const { enquiry } = await session.openEnquiry("does T beat the control?");
  return enquiry;
}

describe("why <task> names the state work already computes", () => {
  test("blocked work names the failing gate", async () => {
    const enquiry = await anEnquiry();
    const { criterion } = await session.stateCriterion("the median must agree");
    const { work } = await session.planWork({
      objective: "run stage 2",
      acceptance: "a table",
      addressing: enquiry,
    });
    const { gate } = await session.declareGate({
      governedBy: [criterion],
      consequence: "stage 2 does not start",
      protecting: [work],
    });
    await session.evaluateCriterion({
      criterion,
      gate,
      value: "median p = 0.21",
      outcome: "fail",
    });

    const explained = await (await afterwards()).why(work);
    expect(explained.is).toBe("blocked");
    expect(explained.because.map((c) => c.handle)).toContain(gate);
    expect(explained.because[0]!.wording).toContain("failed");
    expect(explained.because.map((c) => c.handle)).toContain(enquiry);
  });

  test("waiting work names the unevaluated gate", async () => {
    const enquiry = await anEnquiry();
    const { criterion } = await session.stateCriterion("the median must agree");
    const { work } = await session.planWork({
      objective: "run stage 2",
      acceptance: "a table",
      addressing: enquiry,
    });
    const { gate } = await session.declareGate({
      governedBy: [criterion],
      consequence: "stage 2 does not start",
      protecting: [work],
    });

    const explained = await (await afterwards()).why(work);
    expect(explained.is).toBe("waiting");
    expect(explained.because.map((c) => c.handle)).toContain(gate);
    expect(explained.because[0]!.wording).toBe("never-evaluated");
  });

  test("carried-out work names the analysis that implemented it", async () => {
    const enquiry = await anEnquiry();
    const { observations } = await session.recordObservations({
      enquiry,
      name: "stage 1 results",
      finding: "per-image accuracy",
    });
    const { work } = await session.planWork({
      objective: "run the comparison",
      acceptance: "a table",
      addressing: enquiry,
    });
    const { analysis } = await recordAnalysis(session, {
      enquiry,
      method: "paired comparison",
      from: [observations],
      implementing: work,
      concludes: [{ proposition: "T beats the control", finding: "p = 0.004" }],
    });

    const explained = await (await afterwards()).why(work);
    expect(explained.is).toBe("carried-out");
    expect(explained.because.map((c) => c.handle)).toContain(analysis);
  });

  test("ready work says no gate holds it", async () => {
    const enquiry = await anEnquiry();
    const { work } = await session.planWork({
      objective: "run stage 2",
      acceptance: "a table",
      addressing: enquiry,
    });

    const explained = await (await afterwards()).why(work);
    expect(explained.is).toBe("planned — ready, no gate holds it");
    expect(explained.because.map((c) => c.handle)).toContain(enquiry);
  });

  test("ready work with no enquiry says so", async () => {
    const { work } = await session.planWork({
      objective: "run stage 2",
      acceptance: "a table",
    });

    const explained = await (await afterwards()).why(work);
    expect(explained.is).toBe("planned — ready, no gate holds it, and no question named");
    expect(explained.because).toHaveLength(0);
  });

  test("abandoned work still names the stopping decision", async () => {
    const enquiry = await anEnquiry();
    const { work } = await session.planWork({
      objective: "run stage 2",
      acceptance: "a table",
      addressing: enquiry,
    });
    const stopped = await session.stopWork({
      work,
      because: "the comparison is no longer worth running",
    });

    const explained = await (await afterwards()).why(work);
    expect(explained.is).toBe("abandoned");
    expect(explained.because.map((c) => c.handle)).toContain(stopped.decision);
  });
});
