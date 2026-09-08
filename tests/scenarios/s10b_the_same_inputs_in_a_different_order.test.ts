/**
 * S-10b — "The same inputs, in a different order."
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
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

const SHIFTED = "the second series is shifted relative to the first";

/**
 * Researcher: "The alignment is a subtraction — first series minus second. Run it the other way
 * round and the sign flips, so the order of the two inputs is part of what the run was."
 */
async function anAlignmentRunInOneOrder(
  s: ResearchSession,
  order: "first-then-second" | "second-then-first",
) {
  const { enquiry } = await s.openEnquiry("is the second series shifted relative to the first?");
  const { observations: first } = await s.recordObservations({
    enquiry,
    name: "series A",
    finding: "baseline trace",
    contentHash: "sha256:A",
  });
  const { observations: second } = await s.recordObservations({
    enquiry,
    name: "series B",
    finding: "comparison trace",
    contentHash: "sha256:B",
  });
  const inputs = order === "first-then-second" ? [first, second] : [second, first];
  const { analysis, claims: analysisClaims } = await recordAnalysis(s, {
    enquiry,
    method: "pairwise-alignment",
    from: inputs,
    concludes: [{ proposition: SHIFTED, finding: "offset of +4.1 units" }],
  });
  return { enquiry, first, second, analysis, analysisClaims };
}

describe("S-10b: the same inputs, in a different order", () => {
  /**
   * The control: the two orders are genuinely different runs, and the record
   * holds the same two artefacts either way.
   */
  test("both orders record the same two inputs", async () => {
    const forwards = await anAlignmentRunInOneOrder(session, "first-then-second");
    const report = await (await afterwards()).reproducibilityOf(forwards.analysis, [
      { part: forwards.first, hash: "sha256:A" },
      { part: forwards.second, hash: "sha256:B" },
    ]);
    expect(report.exact.map((p) => p.name).sort()).toEqual(["series A", "series B"]);
    expect(report.reproducible).toBe(true);
  });

  /**
   * **The finding, and it is an absence rather than row T's wrong answer.**
   */
  test("a rebuild in the opposite order reports itself reproducible", async () => {
    const backwards = await anAlignmentRunInOneOrder(session, "second-then-first");

    const report = await (await afterwards()).reproducibilityOf(backwards.analysis, [
      { part: backwards.first, hash: "sha256:A" },
      { part: backwards.second, hash: "sha256:B" },
    ]);

    // Identical to the forwards run in the control above. The two orders are
    // indistinguishable to every read on the surface.
    expect(report.exact.map((p) => p.name).sort()).toEqual(["series A", "series B"]);
    expect(report.reproducible).toBe(true);
  });

  /**
   * And the same absence through the verb built for exactly this question. `reproductionOf()`
   * decides whether two runs are a reproduction by comparing what each recorded consuming — a
   * set comparison, with no order in it.
   */
  test("re-verification treats the reversed run as a reproduction", async () => {
    const { enquiry, first, second, analysis, analysisClaims } = await anAlignmentRunInOneOrder(
      session,
      "first-then-second",
    );

    await session.reverify({
      historical: analysis,
      enquiry,
      method: "pairwise-alignment",
      under: [second, first],
      concludes: { proposition: SHIFTED, finding: "offset of +4.1 units" },
    });

    const verification = await (await afterwards()).whySupported(claimOf(analysisClaims, SHIFTED));
    expect(verification.reverifiedBy.map((r) => r.method)).toEqual(["pairwise-alignment"]);
    expect(verification.support).toHaveLength(1);

    // The re-run read the same artefacts in the opposite order and the record
    // calls it a re-verification of the original finding. Nothing on the
    // surface distinguishes it from a re-run in the same order -- which is the
    // absence, stated once more from a second reader.
    expect(first).not.toEqual(second);
  });
});
