/**
 * S-9d — "Resting on one thing, or two?"
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { whyOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;
const clock: Clock = { now: () => "2026-08-21T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
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

async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

const NAME = "control series";
const DIVERGE = "the treated and control arms diverge";

/**
 * Researcher: "Most of the original control was lost, so we regenerated the remainder. This
 * analysis reads both — the surviving fragment and the regeneration — because the comparison
 * needs the whole series."
 */
async function anAnalysisRestingOnBothControls(s: ResearchSession) {
  const { enquiry } = await s.writes.openEnquiry("do the treated and control arms diverge?");
  const { observations: surviving } = await s.writes.recordObservations({
    enquiry,
    name: NAME,
    finding: "the surviving fragment of the original series",
    contentHash: "sha256:surviving",
  });
  const { observations: regenerated } = await s.writes.recordObservations({
    enquiry,
    name: NAME,
    finding: "the remainder, regenerated from an inferred algorithm",
    contentHash: "sha256:regenerated",
  });
  const { analysis, claims: analysisClaims } = await recordAnalysis(s.writes, {
    enquiry,
    method: "arm-comparison",
    from: [surviving, regenerated],
    concludes: [{ proposition: DIVERGE, finding: "divergence beyond the noise floor" }],
  });
  return { enquiry, surviving, regenerated, analysis, analysisClaims };
}

describe("S-9d: resting on one thing, or two?", () => {
  /**
   * The question a researcher actually asks: *why does this conclusion count as supported?* —
   * and the answer names both inputs, from a second reader, so it is durable state.
   */
  test("two inputs sharing a name are reported as two", async () => {
    const { surviving, regenerated } = await anAnalysisRestingOnBothControls(session);
    expect(surviving).not.toEqual(regenerated);

    const why = await whyOf((await afterwards()).reads, DIVERGE);

    expect(why.restingOn).toHaveLength(2);
    expect(why.restingOn.map((a) => a.part).sort()).toEqual([surviving, regenerated].sort());
    expect(why.restingOn.map((a) => a.name)).toEqual([NAME, NAME]);
    expect(why.verdict).toBe("supported");

    await captureConversation(
      {
        id: "S-9d",
        title: "resting on one thing, or two?",
        about:
          "A comparison reads the surviving fragment of a control series and the regenerated remainder. Both are recorded under the same name, and the record holds them as two inputs rather than one.",
      },
      events,
    );
  });
});
