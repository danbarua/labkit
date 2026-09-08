/**
 * S-24 — "I typed that wrong. Take it back."
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;

const clock: Clock = { now: () => "2026-09-05T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  session = new ResearchSession(await scenario.begin(), { clock, events: inMemoryEventLog() });
});
afterEach(async () => {
  await scenario.end();
});

describe("S-24 — a mistaken act taken back", () => {
  test("names every handle it retracted", async () => {
    const wording = "does the pruning schedule move convergence, typed twice by accident";
    const { question, events } = await session.pose({ question: wording });
    const seq = events[0]!.seq!;

    const undone = await session.undo({ event: seq, because: "duplicate entry, wrong wording" });
    expect(undone.event).toBe(seq);
    expect(undone.retracted).toContain(question);
  });

  test("refuses to undo an act that set a property in place", async () => {
    const { enquiry } = await session.openEnquiry("does depth move convergence?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "depth sweep results",
      finding: "depth 4 vs depth 8",
    });
    const { claims } = await recordAnalysis(session, {
      enquiry,
      method: "paired comparison",
      from: [observations],
      concludes: [{ proposition: "depth 8 converges faster", finding: "moves by ~3 steps" }],
    });
    const claim = claims[0]!.claim;
    const finding = claims[0]!.finding!;
    const { events } = await session.is({ claim, state: "undecided", because: finding });
    const seq = events[0]!.seq!;

    await expect(
      session.undo({ event: seq, because: "changed my mind about undoing this" }),
    ).rejects.toThrow(/set a property in place/);
  });

  test("refuses to undo an act something else already rests on", async () => {
    const { question, events } = await session.pose({
      question: "does pruning depth matter at all?",
    });
    const poseSeq = events[0]!.seq!;

    // The enquiry rests on the question via MOTIVATES -- an external node
    // reaching into what the pose event created.
    await session.pursue({ question, approach: "a depth sweep" });

    await expect(
      session.undo({ event: poseSeq, because: "never mind, wrong question" }),
    ).rejects.toThrow(/rests on what it created/);
  });

  /**
   * The case #134 was filed for, and the one no test above could catch: the dependents check
   * first read every edge into or out of what is being retracted, and `conclude` writes two of
   * its own -- `unit PRODUCES evidence`, `evidence RECORDED_IN output` -- to nodes the analysis
   * already had.
   */
  test("an act's own edges to pre-existing nodes are not dependents of it", async () => {
    const { enquiry } = await session.openEnquiry("does depth move convergence?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "depth sweep results",
      finding: "depth 4 vs depth 8",
    });
    const { claims } = await recordAnalysis(session, {
      enquiry,
      method: "paired comparison",
      from: [observations],
      concludes: [{ proposition: "depth 8 converges faster", finding: "moves by ~3 steps" }],
    });
    const claim = claims[0]!.claim;

    const all = await session.events.all();
    const concludeSeq = all.find((e) => e.operation === "conclude")!.seq!;

    const undone = await session.undo({ event: concludeSeq, because: "this claim was wrong" });
    expect(undone.retracted).toContain(claim);
  });

  test("refuses once a separate act rests on what conclude produced", async () => {
    const { criterion } = await session.stateCriterion("depth 8 converges faster, held up");
    const { enquiry } = await session.openEnquiry("does depth move convergence?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "depth sweep results",
      finding: "depth 4 vs depth 8",
    });
    const { claims } = await recordAnalysis(session, {
      enquiry,
      method: "paired comparison",
      from: [observations],
      heldTo: [criterion],
      concludes: [{ proposition: "depth 8 converges faster", finding: "moves by ~3 steps" }],
    });
    const claim = claims[0]!.claim;
    const all = await session.events.all();
    const concludeSeq = all.find((e) => e.operation === "conclude")!.seq!;

    // A genuinely separate act, resting on the claim's own evidence.
    await session.evaluateCriterion({
      criterion,
      value: "yes",
      outcome: "pass",
      citing: [claim],
    });

    await expect(
      session.undo({ event: concludeSeq, because: "this claim was wrong after all" }),
    ).rejects.toThrow(/rests on what it created/);
  });

  test("refuses a seq nothing on the record has", async () => {
    await expect(
      session.undo({ event: 999_999, because: "there is nothing at this seq" }),
    ).rejects.toThrow(/no event/);
  });
});
