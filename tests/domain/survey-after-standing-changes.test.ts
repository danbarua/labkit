/**
 * After an act that changes what a closed answer is, `known` must read the live claim.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { openScenario, type Scenario } from "../helpers/scenario";
import { ResearchSession, inMemoryEventLog, type Clock } from "@labkit/core-domain";
import { reanalyse, recordAnalysis } from "../helpers/analysis";

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
  const { enquiry } = await s.writes.openEnquiry(ASKS);
  const { observations } = await s.writes.recordObservations({
    enquiry,
    name: "run logs",
    finding: "loss plateaus",
  });
  const rec = await recordAnalysis(s.writes, {
    enquiry,
    method: "ablation",
    from: [observations],
    concludes: [{ proposition: PROP, finding: "loss plateaus" }],
  });
  const claim = rec.claims[0]!.claim;
  await s.writes.isConfirmed({ claim, because: "we are relying on this" });
  const closed = await s.writes.closeEnquiry({ enquiry, answeredBy: claim });
  return { enquiry, observations, analysis: rec.analysis, claim, closed };
}

test("a replacing conclusion removes the old claim from established", async () => {
  const { enquiry, observations, claim } = await aClosedPromotedAnswer();
  expect((await s.reads.whatIsKnown()).established.some((q) => q.asks === ASKS)).toBe(true);

  const replaced = await reanalyse(s.writes, {
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

  const known = await (await afterwards()).reads.whatIsKnown();
  expect(known.established.some((q) => q.asks === ASKS)).toBe(false);
  const asked = known.provisional.find((q) => q.asks === ASKS);
  expect(asked?.answers.map((a) => a.claim)).toEqual([replaced.claims[0]!.claim]);
});
