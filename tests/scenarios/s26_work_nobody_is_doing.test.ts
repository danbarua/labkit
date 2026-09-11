/**
 * S-26: the work we decided not to do.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;

let tick = 0;
const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 8, 6, 14, tick++)).toISOString(),
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

const DROPPED = "the GPU box went back to the vendor and the CPU path meets the deadline";

/** Two pieces of planned work, one of them behind a gate nobody has evaluated. */
async function twoPlannedThings() {
  const { work } = await session.planWork({
    objective: "port the sampler to the GPU box",
    acceptance: "matches the CPU path to 1e-6",
  });
  const { work: other } = await session.planWork({
    objective: "profile the CPU sampler",
    acceptance: "a flame graph per stage",
  });
  const { criterion } = await session.stateCriterion("GPU and CPU agree to 1e-6");
  const { gate } = await session.declareGate({
    governedBy: [criterion],
    consequence: "the port is not merged",
    protecting: [work],
  });
  return { work, other, criterion, gate };
}

async function gatedPair() {
  const { work: stopped } = await session.planWork({
    objective: "discarded GPU port",
    acceptance: "no longer needed",
  });
  const { work: active } = await session.planWork({
    objective: "keep the CPU sampler",
    acceptance: "a flame graph per stage",
  });
  const { criterion } = await session.stateCriterion("the sampler is numerically stable");
  const { gate } = await session.declareGate({
    governedBy: [criterion],
    consequence: "the sampler is released",
    protecting: [stopped, active],
  });
  return { stopped, active, criterion, gate };
}

describe("S-26: work nobody is doing", () => {
  test("Afterward 1: stopped work reads abandoned, and says why", async () => {
    const { work } = await twoPlannedThings();
    await session.stopWork({ work, because: DROPPED });

    const listed = await (await afterwards()).workList();
    expect(listed.find((w) => w.work === work)?.state).toBe("abandoned");

    // The reason is the whole of what the act said, so it has to be
    // reconstructible from durable state — not from the return value, and not
    // from the event log, which a second reader's is empty by design.
    const why = await (await afterwards()).why(work);
    expect(why.is).toBe("abandoned");
    expect(why.because.map((c) => c.wording)).toEqual([DROPPED]);
  });

  test("Afterward 2: it leaves the standing, wherever it stood", async () => {
    const { work, other } = await twoPlannedThings();

    // The gated port is waiting on a gate nobody has checked; the profiling is
    // ready to start. Two lists, and the port is on the first.
    const before = await (await afterwards()).now();
    expect(before.unevaluated.work.map((w) => w.work)).toEqual([work]);
    expect(before.untouched.map((w) => w.work)).toEqual([other]);

    await session.stopWork({ work, because: DROPPED });

    const after = await (await afterwards()).now();
    expect(after.unevaluated.work).toEqual([]);
    expect(after.untouched.map((w) => w.work)).toEqual([other]);
  });

  test("Afterward 3: abandoned beats blocked — a gate no longer holds up work nobody is doing", async () => {
    const { work, criterion, gate } = await twoPlannedThings();
    await session.evaluateCriterion({
      criterion,
      gate,
      value: "GPU differs by 3e-4 on the sparse set",
      outcome: "fail",
    });

    // The gate really is blocked, and the work really was blocked on it.
    const held = await (await afterwards()).workList();
    expect(held.find((w) => w.work === work)?.state).toBe("blocked");

    await session.stopWork({ work, because: DROPPED });

    // Now it is neither blocked nor ready. A failing gate over work nobody is
    // doing is not something a reader should be shown as an obstruction.
    const dropped = await (await afterwards()).workList();
    expect(dropped.find((w) => w.work === work)?.state).toBe("abandoned");
    const standing = await (await afterwards()).now();
    expect(standing.blocked.work.map((w) => w.work)).toEqual([]);
  });

  test("work is stopped once: a second reason is refused, not recorded beside the first", async () => {
    const { work } = await twoPlannedThings();
    await session.stopWork({ work, because: DROPPED });

    // Two decisions would stand against one task, each with its own reason,
    // and nothing says which holds — the rule `closeEnquiry` already applies
    // to a question that is already closed.
    await expect(
      session.stopWork({ work, because: "actually the budget came back" }),
    ).rejects.toThrow(/already stopped/);
  });
  test("stopped work is absent from blocked projections", async () => {
    const { stopped, active, criterion, gate } = await gatedPair();
    await session.evaluateCriterion({
      criterion,
      gate,
      value: "the sampler diverges on the held-out split",
      outcome: "fail",
    });

    const before = await (await afterwards()).gateStatus(gate);
    expect(before.gating.map((w) => w.work)).toEqual(expect.arrayContaining([stopped, active]));
    expect(before.gating).toHaveLength(2);
    const beforeBlocked = before.unmet.flatMap((check) =>
      check.blocks.flatMap((block) => block.gating.map((work) => work.work)),
    );
    expect(beforeBlocked).toEqual(expect.arrayContaining([stopped, active]));
    expect(beforeBlocked).toHaveLength(2);

    await session.stopWork({ work: stopped, because: DROPPED });

    const after = await (await afterwards()).gateStatus(gate);
    expect(after.gating.map((w) => w.work)).toEqual([active]);
    const afterBlocked = after.unmet.flatMap((check) =>
      check.blocks.flatMap((block) => block.gating.map((work) => work.work)),
    );
    expect(afterBlocked).toEqual([active]);

    await session.closeGate({
      gate,
      closure: "sidestepped",
      because: "the sampler is no longer released",
    });
    const closed = await (await afterwards()).gateStatus(gate);
    expect(closed.state).toBe("sidestepped");
    expect(closed.gating.map((w) => w.work)).toEqual([active]);
    expect(closed.unmet.flatMap((check) => check.blocks)).toEqual([]);
  });
});
