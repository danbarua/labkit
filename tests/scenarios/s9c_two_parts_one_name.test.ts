/**
 * S-9c — "Both reproduced and not, under one name." .
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

/**
 * Researcher: "We regenerated the control, and this analysis compares it against the original."
 */
async function anAnalysisComparingBothControls(s: ResearchSession) {
  const { enquiry } = await s.writes.openEnquiry("do the two controls agree?");
  const { observations: original } = await s.writes.recordObservations({
    enquiry,
    name: NAME,
    finding: "the historical series",
    contentHash: "sha256:orig",
  });
  const { observations: regenerated } = await s.writes.recordObservations({
    enquiry,
    name: NAME,
    finding: "regenerated from an inferred algorithm",
    contentHash: "sha256:regen",
  });
  const { analysis: comparison } = await recordAnalysis(s.writes, {
    enquiry,
    method: "compare-controls",
    from: [original, regenerated],
    concludes: [{ proposition: "the controls agree", finding: "within tolerance" }],
  });
  return { enquiry, original, regenerated, comparison };
}

describe("S-9c: two parts, one name", () => {
  /**
   * The reproducibility report identifies parts by reference, so a caller can tell which one is
   * which — and a name that two parts share cannot silently merge them.
   */
  test("a part that matched and a part that differed are distinguishable", async () => {
    const { original, regenerated, comparison } = await anAnalysisComparingBothControls(session);

    const report = await (await afterwards()).reads.reproducibilityOf({
      analysis: comparison,
      rebuilt: [
        { part: original, hash: "sha256:orig" },
        { part: regenerated, hash: "sha256:something-else" },
      ],
    });

    expect(report.exact).toEqual([{ part: original, name: NAME }]);
    expect(report.differing).toEqual([{ part: regenerated, name: NAME }]);
    expect(report.reproducible).toBe(false);

    // The names alone are identical, which is the whole point: identity is the
    // reference, and the name is what a person reads.
    expect(report.exact[0]?.name).toEqual(report.differing[0]?.name);
    expect(report.exact[0]?.part).not.toEqual(report.differing[0]?.part);

    await captureConversation(
      {
        id: "S-9c",
        title: "two parts, one name",
        about:
          "One analysis reads two control series recorded under the same name. On a rebuild one matches and one differs, and the report keeps them apart because it identifies parts by reference rather than by name.",
      },
      events,
    );
  });

  /** The same for the two absences, which S-9 fought to keep apart. */
  test("unverifiable and not-rebuilt stay distinguishable under a shared name", async () => {
    const { enquiry } = await anAnalysisComparingBothControls(session);
    const { observations: noHash } = await session.writes.recordObservations({
      enquiry,
      name: NAME,
      finding: "a third copy, no hash recorded",
    });
    const { analysis } = await recordAnalysis(session.writes, {
      enquiry,
      method: "second-look",
      from: [noHash],
      concludes: [
        {
          proposition: "the third copy is unrecoverable",
          finding: "no hash",
        },
      ],
    });

    const report = await (await afterwards()).reads.reproducibilityOf({ analysis, rebuilt: [] });
    expect(report.unverifiable).toEqual([{ part: noHash, name: NAME }]);
    expect(report.notRebuilt).toEqual([]);
  });
});
