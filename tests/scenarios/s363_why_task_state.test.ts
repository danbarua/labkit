/**
 * why <task> leads with the state work already computes.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { recordAnalysis } from "../helpers/analysis";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

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
  events = inMemoryEventLog();
  session = new ResearchSession(await scenario.begin(), {
    clock,
    events,
    attribution: as("Researcher"),
  });
});
afterEach(async () => {
  await scenario.end();
});

const afterwards = async () => new ResearchSession(await scenario.current(), { clock });

async function anEnquiry() {
  const { enquiry } = await session.writes.openEnquiry("does T beat the control?");
  return enquiry;
}

describe("why <task> names the state work already computes", () => {
  test("blocked work names the failing gate", async () => {
    const enquiry = await anEnquiry();
    const { criterion } = await session.writes.stateCriterion("the median must agree");
    const { work } = await session.writes.planWork({
      objective: "run stage 2",
      acceptance: "a table",
      addressing: enquiry,
    });
    const { gate } = await session.writes.declareGate({
      governedBy: [criterion],
      consequence: "stage 2 does not start",
      protecting: [work],
    });
    await session.writes.evaluateCriterion({
      criterion,
      gate,
      value: "median p = 0.21",
      outcome: "fail",
    });

    const explained = await (await afterwards()).reads.why({ subject: work });
    expect(explained.is).toBe("blocked");
    expect(explained.because.map((c) => c.handle)).toContain(gate);
    expect(explained.because[0]!.wording).toContain("failed");
    expect(explained.because.map((c) => c.handle)).toContain(enquiry);

    await captureConversation(
      {
        id: "S-363",
        title: "why <task> names the state work already computes",
        about:
          "Asking why of a planned task says it is blocked, and names the failing check and the question the task was planned to address.",
      },
      events,
      explained,
    );
  });

  test("waiting work names the unevaluated gate", async () => {
    const enquiry = await anEnquiry();
    const { criterion } = await session.writes.stateCriterion("the median must agree");
    const { work } = await session.writes.planWork({
      objective: "run stage 2",
      acceptance: "a table",
      addressing: enquiry,
    });
    const { gate } = await session.writes.declareGate({
      governedBy: [criterion],
      consequence: "stage 2 does not start",
      protecting: [work],
    });

    const explained = await (await afterwards()).reads.why({ subject: work });
    expect(explained.is).toBe("waiting");
    expect(explained.because.map((c) => c.handle)).toContain(gate);
    expect(explained.because[0]!.wording).toBe("never-evaluated");
  });

  test("work planned after other work waits on it, and names it", async () => {
    const enquiry = await anEnquiry();
    const { work: first } = await session.writes.planWork({
      objective: "freeze the filterbank",
      acceptance: "a bench result",
      addressing: enquiry,
    });
    const { work: second } = await session.writes.planWork({
      objective: "bring in the temporal instrument",
      acceptance: "runs against the frozen filterbank",
      addressing: enquiry,
      after: [first],
    });

    const reader = await afterwards();
    const listed = await reader.reads.workList({});
    expect(listed.find((w) => w.work === second)).toMatchObject({
      state: "waiting",
      after: [first],
    });
    expect(listed.find((w) => w.work === first)).toMatchObject({ state: "planned", after: [] });
    const explained = await reader.reads.why({ subject: second });
    expect(explained.is).toBe("waiting");
    expect(explained.because[0]).toEqual({ handle: first, wording: "waits on — planned" });

    // Once the first has a result, the second is ready.
    const { observations } = await session.writes.recordObservations({
      enquiry,
      name: "bench",
      finding: "filterbank frozen",
    });
    await recordAnalysis(session.writes, {
      enquiry,
      method: "bench",
      from: [observations],
      implementing: first,
      concludes: [{ proposition: "the filterbank is frozen", finding: "bench passed" }],
    });
    const after = await (await afterwards()).reads.workList({});
    expect(after.find((w) => w.work === first)?.state).toBe("carried-out");
    expect(after.find((w) => w.work === second)?.state).toBe("planned");
  });

  test("carried-out work names the analysis that implemented it", async () => {
    const enquiry = await anEnquiry();
    const { observations } = await session.writes.recordObservations({
      enquiry,
      name: "stage 1 results",
      finding: "per-image accuracy",
    });
    const { work } = await session.writes.planWork({
      objective: "run the comparison",
      acceptance: "a table",
      addressing: enquiry,
    });
    const { analysis } = await recordAnalysis(session.writes, {
      enquiry,
      method: "paired comparison",
      from: [observations],
      implementing: work,
      concludes: [{ proposition: "T beats the control", finding: "p = 0.004" }],
    });

    const explained = await (await afterwards()).reads.why({ subject: work });
    expect(explained.is).toBe("carried-out");
    expect(explained.because.map((c) => c.handle)).toContain(analysis);
  });

  test("ready work says no gate holds it", async () => {
    const enquiry = await anEnquiry();
    const { work } = await session.writes.planWork({
      objective: "run stage 2",
      acceptance: "a table",
      addressing: enquiry,
    });

    const explained = await (await afterwards()).reads.why({ subject: work });
    expect(explained.is).toBe("planned — ready, no gate holds it");
    expect(explained.because.map((c) => c.handle)).toContain(enquiry);
  });

  test("ready work with no enquiry says so", async () => {
    const { work } = await session.writes.planWork({
      objective: "run stage 2",
      acceptance: "a table",
    });

    const explained = await (await afterwards()).reads.why({ subject: work });
    expect(explained.is).toBe("planned — ready, no gate holds it, and no question named");
    expect(explained.because).toHaveLength(0);
  });

  test("abandoned work still names the stopping decision", async () => {
    const enquiry = await anEnquiry();
    const { work } = await session.writes.planWork({
      objective: "run stage 2",
      acceptance: "a table",
      addressing: enquiry,
    });
    const stopped = await session.writes.stopWork({
      work,
      because: "the comparison is no longer worth running",
    });

    const explained = await (await afterwards()).reads.why({ subject: work });
    expect(explained.is).toBe("abandoned");
    expect(explained.because.map((c) => c.handle)).toContain(stopped.decision);
  });
});
