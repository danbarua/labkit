/**
 * S-24b — "I built the whole thing on a mistake. Take all of it back."
 *
 * One act at a time, newest first. Each `undo` refuses while anything still rests on what
 * its act created, so the order is forced by the record rather than remembered by the
 * researcher — and the last one leaves nothing behind.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
/** Named apart from the per-act `events` a write verb returns. */
let eventLog: EventSink;

const clock: Clock = { now: () => "2026-09-17T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  eventLog = inMemoryEventLog();
  session = new ResearchSession(await scenario.begin(), {
    clock,
    events: eventLog,
    attribution: as("Researcher"),
  });
});
afterEach(async () => {
  await scenario.end();
});

/** The whole mistaken programme, with the seq of each act that built it. */
const buildIt = async () => {
  const posed = await session.writes.pose({ question: "does the coating slow corrosion?" });
  const pursued = await session.writes.pursue({
    question: posed.question,
    approach: "salt-spray chamber, 200 hours",
  });
  const observed = await session.writes.recordObservations({
    enquiry: pursued.enquiry,
    name: "salt-spray run",
    finding: "mass loss per coupon",
  });
  const analysed = await session.writes.recordAnalysis({
    enquiry: pursued.enquiry,
    method: "mass-loss comparison",
    from: [observed.observations],
  });
  const concluded = await session.writes.conclude({
    analysis: analysed.analysis,
    proposition: "the coating slows corrosion",
    finding: "34% less mass loss",
  });
  const claim = concluded.claims[0]!.claim;
  const promoted = await session.writes.isConfirmed({ claim, because: "the check passed" });
  return { posed, pursued, observed, analysed, concluded, promoted, claim };
};

describe("S-24b — walking back a tree of mistakes", () => {
  test("the record refuses any order but newest-first", async () => {
    const built = await buildIt();

    // The question is the root of everything, so it goes last, not first.
    await expect(
      session.writes.undo({ event: built.posed.events[0]!.seq!, because: "wrong question" }),
    ).rejects.toThrow(/rests on what it created/);

    // The enquiry is likewise still carrying the run.
    await expect(
      session.writes.undo({ event: built.pursued.events[0]!.seq!, because: "wrong approach" }),
    ).rejects.toThrow(/rests on what it created/);
  });

  test("newest-first takes the whole tree back, and the promotion with it", async () => {
    const built = await buildIt();
    expect((await session.reads.whySupported({ claim: built.claim })).standing).toBe(
      "confirmatory",
    );

    // Newest first. The promotion set a property rather than minting, so taking it
    // back is a restore; everything after it retracts what its act created.
    const taken: string[][] = [];
    for (const events of [
      built.promoted.events,
      built.concluded.events,
      built.analysed.events,
      built.observed.events,
      built.pursued.events,
      built.posed.events,
    ]) {
      for (const event of [...events].reverse()) {
        const undone = await session.writes.undo({
          event: event.seq!,
          because: "the whole arc was a mistake",
        });
        taken.push(undone.retracted);
      }
    }

    // Every act reports what it took back. Whether the retracted nodes then
    // vanish from a read is enforced by RLS on `labkit_app`, and these tests do
    // not `SET ROLE`, so it cannot be asserted here.
    expect(taken.flat()).toContain(built.claim);
    expect(taken.flat()).toContain(built.posed.question);
    expect(taken.flat()).toContain(built.pursued.enquiry);
    expect(taken.flat()).toContain(built.observed.observations);

    await captureConversation(
      {
        id: "S-24b",
        title: "walking back a tree of mistakes",
        about:
          "A whole line of work built on a mistaken question is taken back one act at a time, newest first, and the promotion goes with it.",
      },
      eventLog,
    );
  });

  test("the promotion can be taken back on its own, leaving the claim standing", async () => {
    const built = await buildIt();
    await session.writes.undo({
      event: built.promoted.events[0]!.seq!,
      because: "promoted before the control ran",
    });

    const why = await session.reads.whySupported({ claim: built.claim });
    expect(why.standing).toBe("exploratory");
    // The claim itself is untouched: only the property the promotion set moved.
    expect(why.support.length).toBeGreaterThan(0);
  });
});
