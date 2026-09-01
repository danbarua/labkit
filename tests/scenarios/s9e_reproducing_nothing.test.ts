/**
 * S-9e — "Did it reproduce?" asked about nothing.
 * docs/consumer-contract/037_reproducibility_of_nothing_predictions.md
 *
 * Found by the deliberate PJ-027 sweep rather than by a researcher's question,
 * which is worth saying: nobody asked for this scenario, a sweep for prose that
 * disagrees with its code did.
 *
 * `ReproducibilityReport.reproducible` is documented as "False unless every part
 * was rebuilt and matched ... **this is the field that must not quietly say
 * otherwise**." It was computed as three empty-list conjuncts, which is
 * vacuously satisfied when there are no parts at all.
 *
 * The rule was already written down one function away. `reproductionOf()` says
 * "absence on BOTH sides is still absence: two runs that each recorded nothing
 * have not reproduced anything" and enforces it. `reproducibilityOf()` is the
 * function that rule was learned in, per its own docstring, and never got it.
 *
 * Two cases, deliberately given different answers — see 037. An analysis that
 * consumed nothing is a real record with an answerable verdict; an analysis that
 * does not exist is not a subject at all.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { ref } from "../../src/domain/report";
import { recordAnalysis } from "../../fragments";

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

const HOLDS = "the simulation converges";

/**
 * Researcher: "That one was a pure simulation — it didn't read anything of
 *  ours. Can we say it reproduces?"
 *
 * A legitimate record with no inputs. `recordAnalysis({ from: [] })` is allowed
 * and no scenario has asked whether it should be; this scenario asks only what
 * a *reader* may conclude from it.
 */
async function anAnalysisThatConsumedNothing(s: ResearchSession) {
  const { enquiry } = await s.openEnquiry("does the simulation converge?");
  const { analysis, claims: analysisClaims } = await recordAnalysis(s, {
    enquiry,
    method: "pure-sim",
    from: [],
    concludes: [{ proposition: HOLDS, finding: "it converges" }],
  });
  return { enquiry, analysis, analysisClaims };
}

describe("S-9e: reproducing nothing", () => {
  /**
   * **The defect.** Nothing was rebuilt, because there was nothing to rebuild,
   * and the report said the construction reproduces.
   *
   * `false` rather than a throw: the record is real and the question is
   * answerable. The docstring already gives the verdict — nothing was attempted,
   * so the construction is *unshown*. Unshown is not refuted, which is why the
   * four lists stay empty and only the verdict moves.
   */
  test("an analysis that consumed nothing has not been shown to reproduce", async () => {
    const { analysis } = await anAnalysisThatConsumedNothing(session);

    const report = await session.reproducibilityOf(analysis, []);
    expect(report.reproducible).toBe(false);
    expect(report.exact).toEqual([]);
    expect(report.differing).toEqual([]);
    expect(report.unverifiable).toEqual([]);
    expect(report.notRebuilt).toEqual([]);

    // Afterward, from a second reader over the same graph.
    const again = await (await afterwards()).reproducibilityOf(analysis, []);
    expect(again.reproducible).toBe(false);
  });

  /**
   * **The other half, and a different answer.** A caller naming an analysis that
   * was never created is not asking an unanswerable question — it is naming
   * nothing. Every other read on the surface throws when its subject is absent.
   *
   * This is the refusal S-10 permits: it is not manufactured to be rejected,
   * there is a real caller error to refuse.
   */
  test("an analysis that does not exist is refused, not reported on", async () => {
    await expect(session.reproducibilityOf(ref("analysis", "COMP_999999"), [])).rejects.toThrow(
      /COMP_999999/,
    );
  });

  /**
   * The distinction is the point, so it is asserted rather than left in prose —
   * PJ-027's "where a prose guard can be an assertion, it should be".
   *
   * Same empty offering, same empty result set, two different answers, because
   * the two states are different: one record says nothing was read, the other
   * record does not exist.
   */
  test("an absent subject and an empty one are not the same answer", async () => {
    const { analysis } = await anAnalysisThatConsumedNothing(session);
    const read = await afterwards();

    const empty = await read.reproducibilityOf(analysis, []);
    let ghost = "(no throw)";
    try {
      await read.reproducibilityOf(ref("analysis", "COMP_999999"), []);
    } catch (e) {
      ghost = (e as Error).message;
    }

    expect(empty.reproducible).toBe(false);
    expect(ghost).not.toBe("(no throw)");
  });
});
