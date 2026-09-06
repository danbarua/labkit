/**
 * S-10b — "The same inputs, in a different order."
 * docs/project-journal/008_user_story_mining.md §3 row T
 * docs/consumer-contract/034_row_t_predictions.md
 *
 * Row T claimed edges cannot carry properties. Refuted: they can, and
 * `createEdge()` now takes them. What survives is that an edge property cannot
 * be part of edge identity and cannot be changed after creation — so the only
 * discriminator left is a fact **intrinsic to a relationship**, where being
 * unable to put it there gives a wrong answer.
 *
 * Input order on `CONSUMES` is the best candidate: intrinsic, unchanging,
 * incapable of recurring between one pair, and badly served by a node — since
 * reifying "the second input" as an entity is worse than a number on an edge.
 *
 * Imports only src/domain — never src/db (enforced).
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
 * Researcher: "The alignment is a subtraction — first series minus second. Run
 *  it the other way round and the sign flips, so the order of the two inputs is
 *  part of what the run was."
 *
 * An ordinary order-sensitive method. Nothing exotic: any difference,
 * regression-against-baseline, or sequential fit has this property.
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
   *
   * Order is not recorded: `CONSUMES` says which artefacts a computation read,
   * never in what sequence. So a rebuild that read the same two series the
   * other way round reports itself fully reproducible against the original.
   *
   * That answer is *wrong about the world* — the two runs computed different
   * things — but it is **not evidence for row T**, and the reason is the whole
   * result. The record does not know `pairwise-alignment` is order-sensitive.
   * Put an ordinal on the edge and this report still says `reproducible: true`,
   * because nothing compares the orders. Fixing it needs the model to know the
   * method cares about order, and *that* is a gap about methods, not about
   * where a property can live.
   *
   * Row T would be taking credit for someone else's absence.
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
   * And the same absence through the verb built for exactly this question.
   * `reproductionOf()` decides whether two runs are a reproduction by comparing
   * what each recorded consuming — a set comparison, with no order in it.
   *
   * Asserted so the claim is about durable state and not about one report's
   * internals: two genuinely different executions, one verdict of `reproduced`.
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
