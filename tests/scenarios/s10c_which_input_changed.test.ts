/**
 * S-10c — "Which input changed?"
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
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
const HOLDS = "the effect holds against the control";

/**
 * Researcher: "The original control was lost after the first run. We re-checked the finding
 * against the regenerated one — same name, different series."
 */
async function aReVerificationAgainstTheRegeneratedControl(s: ResearchSession) {
  const { enquiry } = await s.openEnquiry("does the effect hold against the control?");
  const { observations: original } = await s.recordObservations({
    enquiry,
    name: NAME,
    finding: "the original series",
    contentHash: "sha256:original",
  });
  const { analysis, claims: analysisClaims } = await recordAnalysis(s, {
    enquiry,
    method: "effect-test",
    from: [original],
    concludes: [{ proposition: HOLDS, finding: "effect survives the control" }],
  });

  const { observations: regenerated } = await s.recordObservations({
    enquiry,
    name: NAME,
    finding: "regenerated from an inferred algorithm",
    contentHash: "sha256:regenerated",
  });
  const { verification } = await s.reverify({
    historical: analysis,
    enquiry,
    method: "effect-test, re-run",
    under: [regenerated],
    concludes: { proposition: HOLDS, finding: "effect survives the control" },
  });
  return {
    enquiry,
    original,
    regenerated,
    analysis,
    analysisClaims,
    verification,
  };
}

describe("S-10c: which input changed?", () => {
  /**
   * The re-run reads a different artefact and the record says so, without
   * concluding anything from it — there is no verdict field like
   * `execution: "not-reproduced"`.
   */
  test("swapping an input for a same-named one is reported as two differences", async () => {
    const { verification } = await aReVerificationAgainstTheRegeneratedControl(session);
    const report = await (await afterwards()).reproductionOf(verification);
    expect(report.differs).toHaveLength(2);
  });

  /**
   * **The fourth bite.** *Which* input changed is unanswerable from the report.
   */
  test("the two entries name the same thing and mean different artefacts", async () => {
    const { original, regenerated, verification } =
      await aReVerificationAgainstTheRegeneratedControl(session);

    const report = await (await afterwards()).reproductionOf(verification);

    expect(report.differs.map((d) => d.what.name)).toEqual([NAME, NAME]);
    expect(report.differs.map((d) => d.what.part).sort()).toEqual([original, regenerated].sort());

    // And each is paired with the standing that belongs to it: the regenerated
    // series is what the re-run introduced, the original is what it stopped
    // using.
    const byPart = new Map(report.differs.map((d) => [d.what.part, d.standing]));
    expect(byPart.get(regenerated)).toBe("changed");
    expect(byPart.get(original)).toBe("not-used-by-the-re-run");
  });

  /**
   * The enumeration behind row F's verdict, asserted rather than argued.
   */
  test("a name is never enough, and a reference always is", async () => {
    const { original, regenerated } = await aReVerificationAgainstTheRegeneratedControl(session);
    const reader = await afterwards();

    // Name: refused, with the count that makes the refusal actionable.
    await expect(reader.whatDependsOn(NAME)).rejects.toThrow(/2 artefacts are named/);

    // Reference: answered, separately, for each.
    for (const part of [original, regenerated]) {
      const rests = await reader.whatDependsOn(part);
      expect(rests.claims.map((c) => c.asserts)).toEqual([HOLDS]);
    }
  });
});
