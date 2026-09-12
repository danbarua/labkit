/**
 * After an act that changes what a closed answer is, `known` must read the live claim.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { openScenario, type Scenario } from "./helpers/scenario";
import { ResearchSession, inMemoryEventLog, type Clock } from "../src/domain";
import { recordAnalysis, replaceAnalysis } from "./helpers/analysis";

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

const afterwards = async () =>
  new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });

const ASKS = "does the sampler converge?";
const PROP = "the sampler converges";

async function aClosedPromotedAnswer() {
  const { enquiry } = await s.openEnquiry(ASKS);
  const { observations } = await s.recordObservations({
    enquiry,
    name: "run logs",
    finding: "loss plateaus",
  });
  const rec = await recordAnalysis(s, {
    enquiry,
    method: "ablation",
    from: [observations],
    concludes: [{ proposition: PROP, finding: "loss plateaus" }],
  });
  const claim = rec.claims[0]!.claim;
  await s.isConfirmed({ claim, because: "we are relying on this" });
  const closed = await s.closeEnquiry({ enquiry, answeredBy: claim });
  return { enquiry, observations, analysis: rec.analysis, claim, closed };
}

test("replace removes the old claim from established", async () => {
  const { enquiry, observations, analysis, claim } = await aClosedPromotedAnswer();
  expect((await s.whatIsKnown()).established.some((q) => q.asks === ASKS)).toBe(true);

  const { review } = await s.recordReview({ of: analysis, verdict: "the metric was misapplied" });
  const replaced = await replaceAnalysis(s, {
    supersedes: analysis,
    because: review,
    enquiry,
    method: "corrected ablation",
    from: [observations],
    concludes: [
      {
        proposition: PROP,
        finding: "loss plateaus under the corrected metric",
        replacing: claim,
      },
    ],
  });

  const known = await (await afterwards()).whatIsKnown();
  expect(known.established.some((q) => q.asks === ASKS)).toBe(false);
  const asked = known.provisional.find((q) => q.asks === ASKS);
  expect(asked?.answers.map((a) => a.claim)).toEqual([replaced.claims[0]!.claim]);
});

test("undecided after promote is not established", async () => {
  const { claim } = await aClosedPromotedAnswer();
  const finding = (await s.whySupported(claim)).support[0]?.evidence;
  if (!finding) throw new Error("the closed answer had no finding to grade");
  await s.isUndecided({ claim, because: finding });

  const known = await (await afterwards()).whatIsKnown();
  expect(known.established.some((q) => q.asks === ASKS)).toBe(false);
  expect(known.provisional.some((q) => q.asks === ASKS)).toBe(true);
});

test("undoing the close leaves the question unresolved", async () => {
  const { closed } = await aClosedPromotedAnswer();
  expect((await s.whatIsKnown()).established.some((q) => q.asks === ASKS)).toBe(true);

  await s.undo({
    event: closed.events[0]!.seq!,
    because: "the close named the wrong claim",
  });

  const known = await (await afterwards()).whatIsKnown();
  expect(known.established.some((q) => q.asks === ASKS)).toBe(false);
  expect(known.provisional.some((q) => q.asks === ASKS)).toBe(false);
  expect(known.unresolved.some((q) => q.asks === ASKS)).toBe(true);
});
