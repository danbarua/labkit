/**
 * S-24 — "I typed that wrong. Take it back."
 *
 * A question posed by mistake, still sitting on the record with nothing built
 * on it: the ordinary case `undo` exists for. What this scenario holds the
 * *domain* to: a successful undo names every handle it retracted, and an act
 * that either changed a property in place or that something else already
 * rests on is refused outright rather than undone partway.
 *
 * **Not tested here: that a retracted handle is actually hidden from a read
 * or a later write.** That is an RLS guarantee enforced at the connection's
 * tenant role, which scenario tests cannot see — they import only
 * `src/domain` (enforced), and role-scoping is `src/db`. `tests/retraction.
 * test.ts` is where that is demonstrated, the same way `reconciliation.test.
 * ts` demonstrates provisioning through the real production path rather than
 * through provisioning internals.
 *
 * `undo` looks itself up in the session's own event stream, so every act it
 * might be asked to take back has to have been recorded through the same
 * session -- these scenarios call it on the writing session directly, unlike
 * most scenarios here, which reassert through a fresh session reading the
 * durable graph. There is nothing to reassert that way: the event stream
 * `undo` reads is not durable by default, and what it wrote to the graph is
 * exactly what `src/domain` cannot see past the RLS boundary either.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { recordAnalysis } from "../../fragments";

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

  test("refuses a seq nothing on the record has", async () => {
    await expect(
      session.undo({ event: 999_999, because: "there is nothing at this seq" }),
    ).rejects.toThrow(/no event/);
  });
});
