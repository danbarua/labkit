/**
 * S-26: the work we decided not to do.
 *
 * **Researcher:** We planned the GPU port behind a numerical-agreement gate.
 * The box went back to the vendor and the CPU path is fast enough. We are not
 * doing it — and I do not want it sitting at the top of my list every morning.
 *
 * **Agent:** Recorded, with your reason. It is out of what is ready to start,
 * and it no longer reads as held up by its gate.
 *
 * Until this, a `Task` had three states and nothing wrote any of them: gated
 * work was `blocked`, work with an analysis against it `carried-out`, and
 * everything else `planned` for ever. `Task.is_open` existed for one day and
 * was deleted for being written by every writer and read by none — so the one
 * thing a researcher could not say was that a piece of work was over.
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

  test("Afterward 2: it leaves what is ready to start, and the rest does not", async () => {
    const { work, other } = await twoPlannedThings();

    const before = await (await afterwards()).now();
    expect(before.untouched.map((w) => w.work).sort()).toEqual([work, other].sort());

    await session.stopWork({ work, because: DROPPED });

    const after = await (await afterwards()).now();
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
});
