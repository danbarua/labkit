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
    const { question, events } = await session.writes.pose({ question: wording });
    const seq = events[0]!.seq!;

    const undone = await session.writes.undo({
      event: seq,
      because: "duplicate entry, wrong wording",
    });
    expect(undone.event).toBe(seq);
    expect(undone.retracted).toContain(question);
  });

  test("refuses to undo an act that set a property in place", async () => {
    const { enquiry } = await session.writes.openEnquiry("does depth move convergence?");
    const { observations } = await session.writes.recordObservations({
      enquiry,
      name: "depth sweep results",
      finding: "depth 4 vs depth 8",
    });
    const { claims } = await recordAnalysis(session.writes, {
      enquiry,
      method: "paired comparison",
      from: [observations],
      concludes: [{ proposition: "depth 8 converges faster", finding: "moves by ~3 steps" }],
    });
    const claim = claims[0]!.claim;
    const finding = claims[0]!.finding!;
    const { events } = await session.writes.isUndecided({ claim, because: finding });
    const seq = events[0]!.seq!;

    await expect(
      session.writes.undo({ event: seq, because: "changed my mind about undoing this" }),
    ).rejects.toThrow(/set a property in place/);
  });

  test("refuses to undo an act something else already rests on", async () => {
    const { question, events } = await session.writes.pose({
      question: "does pruning depth matter at all?",
    });
    const poseSeq = events[0]!.seq!;

    // The enquiry rests on the question via MOTIVATES -- an external node
    // reaching into what the pose event created.
    await session.writes.pursue({ question, approach: "a depth sweep" });

    await expect(
      session.writes.undo({ event: poseSeq, because: "never mind, wrong question" }),
    ).rejects.toThrow(/rests on what it created/);
  });

  test("allows reverse-order undo once the dependent act is retracted", async () => {
    const posed = await session.writes.pose({ question: "does pruning depth matter at all?" });
    const pursued = await session.writes.pursue({
      question: posed.question,
      approach: "a depth sweep",
    });

    await session.writes.undo({
      event: pursued.events[0]!.seq!,
      because: "the pursuit was entered against the wrong question",
    });
    const undone = await session.writes.undo({
      event: posed.events[0]!.seq!,
      because: "the question was entered by mistake",
    });

    expect(undone.retracted).toContain(posed.question);
  });

  test("work stays waiting when its last gate is retracted", async () => {
    const { criterion } = await session.writes.stateCriterion(
      "the result clears the release threshold",
    );
    const { work } = await session.writes.planWork({
      objective: "publish the result",
      acceptance: "the result is published",
    });
    const declared = await session.writes.declareGate({
      governedBy: [criterion],
      consequence: "the result cannot be published",
      protecting: [work],
    });

    await session.writes.undo({
      event: declared.events[0]!.seq!,
      because: "the gate was declared against the wrong work",
    });

    expect((await session.reads.workList({})).find((row) => row.work === work)?.state).toBe(
      "waiting",
    );
    expect((await session.reads.now({})).untouched.map((row) => row.work)).not.toContain(work);
  });

  /**
   * The dependants check must distinguish an act's own edges to pre-existing nodes. `conclude`
   * writes `unit PRODUCES evidence` and `evidence RECORDED_IN output` to nodes the analysis
   * already had; neither edge makes that same act depend on itself.
   */
  test("an act's own edges to pre-existing nodes are not dependents of it", async () => {
    const { enquiry } = await session.writes.openEnquiry("does depth move convergence?");
    const { observations } = await session.writes.recordObservations({
      enquiry,
      name: "depth sweep results",
      finding: "depth 4 vs depth 8",
    });
    const { claims } = await recordAnalysis(session.writes, {
      enquiry,
      method: "paired comparison",
      from: [observations],
      concludes: [{ proposition: "depth 8 converges faster", finding: "moves by ~3 steps" }],
    });
    const claim = claims[0]!.claim;

    const all = await session.events.all();
    const concludeSeq = all.find((e) => e.operation === "conclude")!.seq!;

    const undone = await session.writes.undo({
      event: concludeSeq,
      because: "this claim was wrong",
    });
    expect(undone.retracted).toContain(claim);
  });

  test("refuses once a separate act rests on what conclude produced", async () => {
    const { criterion } = await session.writes.stateCriterion("depth 8 converges faster, held up");
    const { enquiry } = await session.writes.openEnquiry("does depth move convergence?");
    const { observations } = await session.writes.recordObservations({
      enquiry,
      name: "depth sweep results",
      finding: "depth 4 vs depth 8",
    });
    const { claims } = await recordAnalysis(session.writes, {
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
    await session.writes.evaluateCriterion({
      criterion,
      value: "yes",
      outcome: "pass",
      citing: [claim],
    });

    await expect(
      session.writes.undo({ event: concludeSeq, because: "this claim was wrong after all" }),
    ).rejects.toThrow(/rests on what it created/);
  });

  test("refuses a seq nothing on the record has", async () => {
    await expect(
      session.writes.undo({ event: 999_999, because: "there is nothing at this seq" }),
    ).rejects.toThrow(/not found/);
  });
});
