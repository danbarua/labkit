/**
 * S-9c — "Both reproduced and not, under one name."
 * docs/project-journal/008_user_story_mining.md §3 row F.
 *
 * Row F says an artefact has no identity apart from its content: `logical_name`
 * is wording, which S-9 refused to treat as identity, and `content_hash` is the
 * bytes. S-9 guarded the *input* side — `reproducibilityOf()` takes parts by
 * reference, and its comment says a name-keyed map "would merge exactly the two
 * things this scenario exists to keep apart".
 *
 * The **output** side was never given the same treatment.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;
const clock: Clock = { now: () => "2026-08-21T09:00:00.000Z" };

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });
beforeEach(async () => {
  session = new ResearchSession(await scenario.begin(), { clock, events: inMemoryEventLog() });
});
afterEach(async () => { await scenario.end(); });

async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

const NAME = "control series";

/**
 * Researcher: "We regenerated the control, and this analysis compares it
 *  against the original."
 *
 * Both are called what the thing is called. S-9 established that is legitimate:
 * a regenerated part naturally carries the name of the part it replaces.
 */
async function anAnalysisComparingBothControls(s: ResearchSession) {
  const enquiry = await s.openEnquiry("do the two controls agree?");
  const original = await s.recordObservations({
    enquiry, name: NAME, finding: "the historical series", contentHash: "sha256:orig",
  });
  const regenerated = await s.recordObservations({
    enquiry, name: NAME, finding: "regenerated from an inferred algorithm", contentHash: "sha256:regen",
  });
  const comparison = await s.recordAnalysis({
    enquiry, method: "compare-controls", from: [original, regenerated],
    concludes: [{ proposition: "the controls agree", finding: "within tolerance" }],
  });
  return { enquiry, original, regenerated, comparison };
}

describe("S-9c: two parts, one name", () => {
  /**
   * The reproducibility report identifies parts by reference, so a caller can
   * tell which one is which — and a name that two parts share cannot silently
   * merge them.
   *
   * Before this, the same name appeared in **both** `exact` and `differing`:
   * the record stating that "control series" had reproduced exactly *and* come
   * back different, with no way to tell which was which. Contradictory rather
   * than merely thin, and a reader working from `exact` would have concluded
   * the control reproduced.
   */
  test("a part that matched and a part that differed are distinguishable", async () => {
    const { original, regenerated, comparison } = await anAnalysisComparingBothControls(session);

    const report = await (await afterwards()).reproducibilityOf(comparison, [
      { part: original, hash: "sha256:orig" },
      { part: regenerated, hash: "sha256:something-else" },
    ]);

    expect(report.exact).toEqual([{ part: original.id, name: NAME }]);
    expect(report.differing).toEqual([{ part: regenerated.id, name: NAME }]);
    expect(report.reproducible).toBe(false);

    // The names alone are identical, which is the whole point: identity is the
    // reference, and the name is what a person reads.
    expect(report.exact[0]?.name).toEqual(report.differing[0]?.name);
    expect(report.exact[0]?.part).not.toEqual(report.differing[0]?.part);
  });

  /** The same for the two absences, which S-9 fought to keep apart. */
  test("unverifiable and not-rebuilt stay distinguishable under a shared name", async () => {
    const { enquiry } = await anAnalysisComparingBothControls(session);
    const noHash = await session.recordObservations({
      enquiry, name: NAME, finding: "a third copy, no hash recorded",
    });
    const analysis = await session.recordAnalysis({
      enquiry, method: "second-look", from: [noHash],
      concludes: [{ proposition: "the third copy is unrecoverable", finding: "no hash" }],
    });

    const report = await (await afterwards()).reproducibilityOf(analysis, []);
    expect(report.unverifiable).toEqual([{ part: noHash.id, name: NAME }]);
    expect(report.notRebuilt).toEqual([]);
  });
});
