/**
 * S-10c — "Which input changed?"
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
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
const HOLDS = "the effect holds against the control";

/**
 * Researcher: "The original control was lost after the first run. We re-checked the finding
 * against the regenerated one — same name, different series."
 */
async function aReVerificationAgainstTheRegeneratedControl(s: ResearchSession) {
  const { enquiry } = await s.writes.openEnquiry("does the effect hold against the control?");
  const { observations: original } = await s.writes.recordObservations({
    enquiry,
    name: NAME,
    finding: "the original series",
    contentHash: "sha256:original",
  });
  const { analysis, claims: analysisClaims } = await recordAnalysis(s.writes, {
    enquiry,
    method: "effect-test",
    from: [original],
    concludes: [{ proposition: HOLDS, finding: "effect survives the control" }],
  });

  const { observations: regenerated } = await s.writes.recordObservations({
    enquiry,
    name: NAME,
    finding: "regenerated from an inferred algorithm",
    contentHash: "sha256:regenerated",
  });
  const { verification } = await s.writes.reverify({
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
    const report = await (await afterwards()).reads.reproductionOf({ verification });
    expect(report.differs).toHaveLength(2);

    await captureConversation(
      {
        id: "S-10c",
        title: "Which input changed?",
        about:
          "The original control series was lost and the finding was re-checked against a regenerated one with the same name. The record reports two differences, and the reader has to be able to say which series each of them is about.",
      },
      events,
    );
  });

  /**
   * **The fourth bite.** *Which* input changed is unanswerable from the report.
   */
  test("the two entries name the same thing and mean different artefacts", async () => {
    const { original, regenerated, verification } =
      await aReVerificationAgainstTheRegeneratedControl(session);

    const report = await (await afterwards()).reads.reproductionOf({ verification });

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
    await expect(reader.reads.whatDependsOn({ subject: NAME })).rejects.toThrow(
      /2 artefacts are named/,
    );

    // Reference: answered, separately, for each.
    for (const part of [original, regenerated]) {
      const rests = await reader.reads.whatDependsOn({ subject: part });
      expect(rests.claims.map((c) => c.asserts)).toEqual([HOLDS]);
    }
  });
});
