/**
 * S-9d — "Resting on one thing, or two?"
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, whyOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;
const clock: Clock = { now: () => "2026-08-21T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  session = new ResearchSession(await scenario.begin(), {
    clock,
    events: inMemoryEventLog(),
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
  const { enquiry } = await s.openEnquiry("do the treated and control arms diverge?");
  const { observations: surviving } = await s.recordObservations({
    enquiry,
    name: NAME,
    finding: "the surviving fragment of the original series",
    contentHash: "sha256:surviving",
  });
  const { observations: regenerated } = await s.recordObservations({
    enquiry,
    name: NAME,
    finding: "the remainder, regenerated from an inferred algorithm",
    contentHash: "sha256:regenerated",
  });
  const { analysis, claims: analysisClaims } = await recordAnalysis(s, {
    enquiry,
    method: "arm-comparison",
    from: [surviving, regenerated],
    concludes: [{ proposition: DIVERGE, finding: "divergence beyond the noise floor" }],
  });
  return { enquiry, surviving, regenerated, analysis, analysisClaims };
}

describe("S-9d: resting on one thing, or two?", () => {
  /**
   * The control, and it does real work: it establishes that the two inputs are genuinely
   * distinct in the record, so the collapse below is a fact about the read rather than about
   * the fixture.
   */
  test("the record holds two distinct inputs under the one name", async () => {
    const { surviving, regenerated, analysis } = await anAnalysisRestingOnBothControls(session);

    const parts = await (await afterwards()).reproducibilityOf(analysis, [
      { part: surviving, hash: "sha256:surviving" },
      { part: regenerated, hash: "sha256:regenerated" },
    ]);

    expect(parts.exact.map((p) => p.part).sort()).toEqual([surviving, regenerated].sort());
    expect(parts.exact.map((p) => p.name)).toEqual([NAME, NAME]);
  });

  /**
   * The question a researcher actually asks: *why does this conclusion count as supported?* —
   * and the answer now names both inputs.
   */
  test("two inputs sharing a name are reported as two", async () => {
    const { surviving, regenerated } = await anAnalysisRestingOnBothControls(session);

    const why = await whyOf(await afterwards(), DIVERGE);

    expect(why.restingOn).toHaveLength(2);
    expect(why.restingOn.map((a) => a.part).sort()).toEqual([surviving, regenerated].sort());
    expect(why.restingOn.map((a) => a.name)).toEqual([NAME, NAME]);
    expect(why.verdict).toBe("supported");
  });

  /**
   * The same claim from a second reader, so this is a statement about durable state rather than
   * about a value the first call happened to return.
   */
  test("the collapse is in the read, not in what was recorded", async () => {
    const { surviving, regenerated } = await anAnalysisRestingOnBothControls(session);
    const reader = await afterwards();

    for (const part of [surviving, regenerated]) {
      const rests = await reader.whatDependsOn(part);
      expect(rests.claims.map((c) => c.asserts)).toEqual([DIVERGE]);
    }
    expect(surviving).not.toEqual(regenerated);

    await expect(reader.whatDependsOn(NAME)).rejects.toThrow(/2 artefacts are named/);

    const restingOn = (await reader.whySupported(await claimNamed(reader, DIVERGE))).restingOn;
    expect(restingOn.map((a) => a.part).sort()).toEqual([surviving, regenerated].sort());
  });
});
