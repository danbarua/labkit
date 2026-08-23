/**
 * S-9d — "Resting on one thing, or two?"
 * docs/project-journal/008_user_story_mining.md §3 row F
 * docs/consumer-contract/033_row_f_third_bite_predictions.md
 *
 * Fourth attempt at row F. S-9 answered with a refusal, S-9b left an absence,
 * S-9c bit the report and was fixed in the query. Each time the row stayed open.
 *
 * This one starts from the shape S-9c exposed rather than from the row's title:
 * a rule enforced on the way **in** and dropped on the way **out**.
 * `reproducibilityOf()` took parts by reference, argued for it in a comment, and
 * reported bare names. `whySupported().restingOn` is the same construction, in
 * the most-used read on the surface.
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
const DIVERGE = "the treated and control arms diverge";

/**
 * Researcher: "Most of the original control was lost, so we regenerated the
 *  remainder. This analysis reads both — the surviving fragment and the
 *  regeneration — because the comparison needs the whole series."
 *
 * Two artefacts, one name. S-9 established that is legitimate: a regenerated
 * part naturally carries the name of the part it replaces. One of the two has
 * provenance nobody can vouch for, which is the situation that matters.
 */
async function anAnalysisRestingOnBothControls(s: ResearchSession) {
  const enquiry = await s.openEnquiry("do the treated and control arms diverge?");
  const surviving = await s.recordObservations({
    enquiry, name: NAME, finding: "the surviving fragment of the original series",
    contentHash: "sha256:surviving",
  });
  const regenerated = await s.recordObservations({
    enquiry, name: NAME, finding: "the remainder, regenerated from an inferred algorithm",
    contentHash: "sha256:regenerated",
  });
  const { analysis: analysis } = await s.recordAnalysis({
    enquiry, method: "arm-comparison", from: [surviving, regenerated],
    concludes: [{ proposition: DIVERGE, finding: "divergence beyond the noise floor" }],
  });
  return { enquiry, surviving, regenerated, analysis };
}

describe("S-9d: resting on one thing, or two?", () => {
  /**
   * The control, and it does real work: it establishes that the two inputs are
   * genuinely distinct in the record, so the collapse below is a fact about the
   * read rather than about the fixture.
   *
   * Asserted through `reproducibilityOf()`, which was taught identity in S-9c
   * and therefore reports both. Same graph, different read, different answer —
   * which is what makes this a reporting defect and not a recording one.
   */
  test("the record holds two distinct inputs under the one name", async () => {
    const { surviving, regenerated, analysis } = await anAnalysisRestingOnBothControls(session);

    const parts = await (await afterwards()).reproducibilityOf(analysis, [
      { part: surviving, hash: "sha256:surviving" },
      { part: regenerated, hash: "sha256:regenerated" },
    ]);

    expect(parts.exact.map((p) => p.part.id).sort()).toEqual([surviving.id, regenerated.id].sort());
    expect(parts.exact.map((p) => p.name)).toEqual([NAME, NAME]);
  });

  /**
   * The question a researcher actually asks: *why does this conclusion count as
   * supported?* — and the answer now names both inputs.
   *
   * **Inverted, not deleted.** This shipped asserting the wrong answer, with the
   * assertion it should make sitting in a comment; that comment is the live
   * assertion now. `restingOn` was
   * `[...new Set(rows.map((r) => r.a.logical_name))]`, so two artefacts sharing
   * a name collapsed into one entry: the record stating a conclusion rested on
   * a single input when it rested on two, with the vanished one
   * indistinguishable from the survivor. A reader auditing the basis of a claim
   * could not see that a regeneration with inferred provenance was underneath.
   *
   * Deduplicated by identity now. The names stay identical — that is the point.
   */
  test("two inputs sharing a name are reported as two", async () => {
    const { surviving, regenerated } = await anAnalysisRestingOnBothControls(session);

    const why = await (await afterwards()).whySupported(DIVERGE);

    expect(why.restingOn).toHaveLength(2);
    expect(why.restingOn.map((a) => a.part.id).sort()).toEqual(
      [surviving.id, regenerated.id].sort(),
    );
    expect(why.restingOn.map((a) => a.name)).toEqual([NAME, NAME]);
    expect(why.supported).toBe(true);
  });

  /**
   * The same claim from a second reader, so this is a statement about durable
   * state rather than about a value the first call happened to return.
   *
   * The graph holds two artefacts, each carrying the claim independently, and
   * the surface already knows the name is ambiguous — `whatDependsOn()` refuses
   * it, which is S-9 working. Three reads, three consistent answers; before the
   * fix the third one disagreed with the other two about how many things were
   * there.
   */
  test("the collapse is in the read, not in what was recorded", async () => {
    const { surviving, regenerated } = await anAnalysisRestingOnBothControls(session);
    const reader = await afterwards();

    for (const part of [surviving, regenerated]) {
      const rests = await reader.whatDependsOn(part);
      expect(rests.claims.map((c) => c.asserts)).toEqual([DIVERGE]);
    }
    expect(surviving.id).not.toEqual(regenerated.id);

    await expect(reader.whatDependsOn(NAME)).rejects.toThrow(/2 artefacts are named/);

    const restingOn = (await reader.whySupported(DIVERGE)).restingOn;
    expect(restingOn.map((a) => a.part.id).sort()).toEqual([surviving.id, regenerated.id].sort());
  });
});
