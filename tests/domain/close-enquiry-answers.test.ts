/**
 * An enquiry closed by more than one claim: every claim is an answer, on the write and on every
 * read that follows ANSWERS.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { openScenario, type Scenario } from "../helpers/scenario";
import { ResearchSession, inMemoryEventLog, type Clock } from "@labkit/core-domain";
import { recordAnalysis } from "../helpers/analysis";
import { claimOf } from "../helpers/claims";

const clock: Clock = { now: () => "2026-09-11T12:00:00.000Z" };
let scenario: Scenario;
let s: ResearchSession;

beforeAll(async () => {
  scenario = await openScenario();
});
beforeEach(async () => {
  s = new ResearchSession(await scenario.begin(), { clock, events: inMemoryEventLog() });
});
afterEach(async () => {
  await scenario.end();
});
afterAll(async () => {
  await scenario.close();
});

const ASKS = "does the coating slow corrosion?";
const FIRST = "the coating slows pitting";
const SECOND = "the coating slows rust creep";

/** An enquiry with one analysis concluding two claims. */
async function twoFindings(session: ResearchSession) {
  const { enquiry } = await session.writes.openEnquiry(ASKS);
  const { observations } = await session.writes.recordObservations({
    enquiry,
    name: "salt spray",
    finding: "500 hours",
  });
  const { claims } = await recordAnalysis(session.writes, {
    enquiry,
    method: "paired comparison",
    from: [observations],
    concludes: [
      { proposition: FIRST, finding: "fewer pits" },
      { proposition: SECOND, finding: "less creep" },
    ],
  });
  return { enquiry, first: claimOf(claims, FIRST), second: claimOf(claims, SECOND) };
}

test("closing with two claims names both, and every read that follows ANSWERS sees both", async () => {
  const { enquiry, first, second } = await twoFindings(s);

  const closed = await s.writes.closeEnquiry({ enquiry, answeredBy: [first, second] });
  expect(closed.closure).toBe("answered");
  expect(closed.answered).toEqual([
    { claim: first, asserts: FIRST },
    { claim: second, asserts: SECOND },
  ]);

  const status = await s.reads.enquiryStatus({ enquiry });
  expect(status.closure).toBe("answered");
  expect(status.answered.map((a) => a.claim).sort()).toEqual([first, second].sort());
  // The decision rests on the finding under each claim.
  expect(status.evidence).toHaveLength(2);

  const known = await s.reads.whatIsKnown();
  const pursuit = known.closedPursuits.find((p) => p.enquiry === enquiry)!;
  expect(pursuit.answered.map((a) => a.claim).sort()).toEqual([first, second].sort());
  const answered = [...known.provisional, ...known.established].find((q) => q.asks === ASKS)!;
  expect(answered.answers.map((a) => a.claim).sort()).toEqual([first, second].sort());
});

test("an abandoned enquiry names no answer", async () => {
  const { enquiry } = await twoFindings(s);
  const closed = await s.writes.closeEnquiry({ enquiry });
  expect(closed.closure).toBe("abandoned");
  expect(closed.answered).toEqual([]);
  expect((await s.reads.enquiryStatus({ enquiry })).answered).toEqual([]);
});
