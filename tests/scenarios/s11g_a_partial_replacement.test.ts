/**
 * S-11g — "The replacement addressed three of four conclusions."
 * labkit#132, found transcribing Bonsai's real Stage 1A re-verification (#125).
 *
 * This is the demonstrated wrong answer #173 was built to clear, and it was
 * found by hand at a terminal rather than by a test. Bonsai's re-verification
 * produced one analysis with four conclusions. A log-scale re-analysis resolved
 * three of them and **deliberately excluded the fourth** — its own text: *"T vs
 * lattice is excluded from this iteration... the v1 result for T-vs-lattice
 * stands as final."*
 *
 * Asking why that fourth finding was supported reported it retracted, citing a
 * review whose verdict never mentions it. Populated, plausible, and wrong —
 * PJ-011 §5's bar, not an absence.
 *
 * The cause was grain. `replaceAnalysis` set `invalidated = true` on the
 * superseded analysis's **output artefact**, which is one flag over every
 * finding that analysis produced, and every reader of standing went through it.
 * So an act that named three conclusions retracted a fourth it never mentioned,
 * and withdrew the criterion evaluations resting on it too.
 *
 * The scenario is deliberately *not* a new one. #132 says so itself: Bonsai's
 * own v1 → v2 chain is the scenario, and what was missing was a test of it.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";

let scenario: Scenario;
let session: ResearchSession;

const clock: Clock = { now: () => "2026-09-01T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  session = new ResearchSession(await scenario.begin(), { clock, events: inMemoryEventLog() });
});
afterEach(async () => {
  await scenario.end();
});

/** Two of Bonsai's four comparisons: one the re-analysis revisits, one it excludes. */
const REVISITED = "T differs from the current-random control";
const EXCLUDED = "T differs from the lattice control";
const AGGREGATION = "the aggregation is done on the correct scale";

/**
 * Researcher: "One run, four comparisons. Then we found the aggregation was on
 *  the wrong scale for the stochastic controls — but not for the lattice one,
 *  and that result stands as final."
 *
 * One analysis with two conclusions, one review, and a replacement that
 * restates only the first. `stands` is what the researcher says is untouched.
 */
async function aRunPartlyReAnalysed(holdTo = false) {
  const { enquiry } = await session.openEnquiry("does T differ from its controls?");
  const { observations } = await session.recordObservations({
    enquiry,
    name: "per-image results",
    finding: "T and four controls, twelve images each",
  });
  // **Held to a criterion only when the test is about one.** `heldTo` is per
  // analysis, so a criterion here qualifies BOTH conclusions -- which makes
  // `supported` on the untouched finding an answer about the check rather than
  // about supersession, and the first test would have been asserting the wrong
  // thing while passing for a reason it did not name.
  const criterion = holdTo ? (await session.stateCriterion(AGGREGATION)).criterion : undefined;
  const { analysis: v1, claims: v1Claims } = await session.recordAnalysis({
    enquiry,
    method: "raw-scale aggregation",
    from: [observations],
    ...(criterion === undefined ? {} : { heldTo: [criterion] }),
    concludes: [
      { proposition: REVISITED, finding: "p = 0.03 raw" },
      { proposition: EXCLUDED, finding: "p = 0.41 raw" },
    ],
  });
  return {
    enquiry,
    observations,
    criterion,
    v1,
    revisited: claimOf(v1Claims, REVISITED),
    stands: claimOf(v1Claims, EXCLUDED),
  };
}

/** The re-analysis, naming the one finding it supersedes and no other. */
async function theLogScaleReAnalysis(w: Awaited<ReturnType<typeof aRunPartlyReAnalysed>>) {
  const { review } = await session.recordReview({
    of: w.v1,
    verdict: "raw-scale aggregation is untrustworthy for the stochastic-control comparisons",
  });
  return session.replaceAnalysis({
    supersedes: w.v1,
    because: review,
    enquiry: w.enquiry,
    method: "log-scale re-aggregation",
    from: [w.observations],
    // The lattice comparison is deliberately absent, matching Bonsai's own
    // scope. Coverage is which conclusions the caller paired.
    concludes: [{ proposition: REVISITED, finding: "p = 0.007 log" }],
  });
}

async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

describe("S-11g — a replacement that addresses only some of a run's conclusions", () => {
  /**
   * **#132's repro, as an assertion.** The transcript's `why CLM_6` reported
   * "Resting on nothing" and a supersession citing a review that never
   * mentions the lattice comparison.
   */
  test("a finding the replacement never named still stands, and still rests on its input", async () => {
    const w = await aRunPartlyReAnalysed();
    await theLogScaleReAnalysis(w);

    const why = await (await afterwards()).whySupported(w.stands);

    // The claim Bonsai's own record calls final.
    expect(why.superseded).toEqual([]);
    expect(why.supported).toBe(true);
    expect(why.support.map((s) => s.finding)).toEqual(["p = 0.41 raw"]);

    // "Resting on nothing" was the visible half of the defect, and it is the
    // sharper assertion: the flag question and the supersession question have
    // one answer, so a fix that cleared `superseded` while leaving `restingOn`
    // empty would be half a fix and read as a whole one.
    expect(why.restingOn.map((r) => r.name)).toEqual(["per-image results"]);
    expect(why.restingOn[0]!.invalidated).toBeUndefined();
  });

  /**
   * The other side of the same act, which is what makes the test above a
   * discriminator rather than a fix that switched everything off.
   */
  test("the finding it did name falls, and names the review that caused it", async () => {
    const w = await aRunPartlyReAnalysed();
    await theLogScaleReAnalysis(w);

    const why = await (await afterwards()).whySupported(w.revisited);
    expect(why.superseded.map((s) => s.finding)).toEqual(["p = 0.03 raw"]);
    expect(why.superseded[0]!.reason).toContain("raw-scale aggregation is untrustworthy");
  });

  /**
   * **The regression pair, on the evaluations.** #132's cost was not only the
   * claim: withdrawing an artefact withdrew every criterion evaluation that
   * cited any finding recorded in it. Both halves are asserted against one
   * record, because a fix that withdrew neither would pass either alone.
   */
  test("an evaluation citing a superseded finding falls; one citing an untouched finding stands", async () => {
    // Two worlds identical but for which finding the one verdict was reached
    // against. One evaluation each, so the check's state is that verdict's
    // standing and not an aggregate over two.
    const state = async (cites: "revisited" | "stands") => {
      const w = await aRunPartlyReAnalysed(true);
      if (w.criterion === undefined) throw new Error("unreachable: asked for a criterion");
      await session.evaluateCriterion({
        criterion: w.criterion,
        value: "raw scale",
        outcome: "fail",
        citing: cites === "revisited" ? w.revisited : w.stands,
      });
      await theLogScaleReAnalysis(w);
      const why = await (await afterwards()).whySupported(w.stands);
      return why.standard.find((c) => c.proposition === AGGREGATION)?.state;
    };

    // The verdict reached against the finding this act superseded falls with
    // it. That is S-3c, and it must keep working.
    expect(await state("revisited")).toBe("no-standing-verdict");
    await scenario.end();
    session = new ResearchSession(await scenario.begin(), { clock, events: inMemoryEventLog() });

    // The verdict reached against the finding this act never mentioned does
    // not. That is #132, and asserting only one of these would pass on a fix
    // that withdrew everything or nothing.
    expect(await state("stands")).toBe("failed");
  });
});
