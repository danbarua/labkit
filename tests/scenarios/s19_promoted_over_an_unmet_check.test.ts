/**
 * S-19 — "Somebody vouched for it. Nobody checked it." The wrong answer is demonstrated first,
 * in, and the fix's shape is what asserts.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;

const NOW = "2026-08-27T09:00:00.000Z";
const clock: Clock = { now: () => NOW };

const QUESTION = "does the new sampler converge?";
const PROPOSITION = "the sampler converges";
const CHECK = "held-out loss must beat the baseline";

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

/** A second reader over the same graph — see tests/helpers/scenario.ts. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

/**
 * The whole conversation. Six acts, none of them irregular.
 */
async function aPromotedAnswerNobodyChecked() {
  const { criterion: check } = await session.stateCriterion(CHECK);
  const { enquiry } = await session.openEnquiry(QUESTION);
  const { observations } = await session.recordObservations({
    enquiry,
    name: "8k-step run logs",
    finding: "loss plateaus at 4.1 by step 6k",
  });
  const { claims } = await recordAnalysis(session, {
    enquiry,
    method: "8k-step ablation",
    from: [observations],
    concludes: [{ proposition: PROPOSITION, finding: "loss plateaus at 4.1 by step 6k" }],
    heldTo: [check],
  });
  const claim = claims[0]!.claim;
  await session.is({ claim, state: "confirmed", because: "we are relying on this to ship" });
  await session.closeEnquiry({ enquiry, answeredBy: claim });
  return { check, enquiry, claim };
}

describe("S-19: promoted, closed, and the agreed check never run", () => {
  test("the claim's own report says the prespecified check is unmet", async () => {
    const { check, claim } = await aPromotedAnswerNobodyChecked();

    const why = await session.whySupported(claim);
    expect(why.unmet.map((u: { criterion: string }) => u.criterion)).toContain(check);
    expect(why.standard.find((c: { criterion: string }) => c.criterion === check)?.state).toBe(
      "never-run",
    );
    // And it says so about a claim that genuinely is promoted -- the two facts
    // coexist, which is the whole difficulty.
    expect(why.standing).toBe("confirmatory");
  });

  /**
   * Afterward. "What do we know?" — and the survey must not answer `established`.
   */
  test("the survey does not call the question established", async () => {
    const { claim } = await aPromotedAnswerNobodyChecked();

    const later = await afterwards();
    const survey = await later.whatIsKnown();
    const asked = (bucket: readonly { asks: string }[]) => bucket.some((q) => q.asks === QUESTION);

    // The defect this scenario exists for. `established` means the answer rests
    // on promoted, confirmatory work *and the standard it was held to*; a claim
    // whose prespecified check nobody ran has not met that.
    expect(asked(survey.established)).toBe(false);

    // It is not untested, not unresolved, and not accepted either: the question
    // *was* worked on, *was* answered, and nobody parked it. Whatever bucket it
    // lands in has to survive that, which is what makes the naming hard.
    expect(asked(survey.untested)).toBe(false);
    expect(asked(survey.accepted)).toBe(false);

    // It is somewhere, and exactly once. A question dropped from every bucket
    // would satisfy the assertion above and be a worse answer than the defect.
    const appearances = [
      survey.established,
      survey.provisional,
      survey.unresolved,
      survey.untested,
      survey.accepted,
    ].filter(asked).length;
    expect(appearances).toBe(1);

    void claim;
  });

  /**
   * The control. Run the same check and pass it, and nothing else changes — the question is
   * established, as it always was.
   */
  test("a check that was run and passed leaves the answer established", async () => {
    const { check, claim } = await aPromotedAnswerNobodyChecked();
    await session.evaluateCriterion({
      criterion: check,
      outcome: "pass",
      value: "loss 3.6 vs 3.8 baseline",
      citing: [claim],
    });

    const later = await afterwards();
    const survey = await later.whatIsKnown();
    expect(survey.established.some((q: { asks: string }) => q.asks === QUESTION)).toBe(true);
  });

  /**
   * The mirror image, and the case that was passing for the wrong reason.
   */
  test("a promoted negative result whose check passed is established", async () => {
    const { criterion: check } = await session.stateCriterion(CHECK);
    const { enquiry } = await session.openEnquiry(QUESTION);
    const { observations } = await session.recordObservations({
      enquiry,
      name: "8k-step run logs",
      finding: "loss plateaus at 4.1 by step 6k",
    });
    const { claims } = await recordAnalysis(session, {
      enquiry,
      method: "8k-step ablation",
      from: [observations],
      concludes: [
        {
          proposition: PROPOSITION,
          finding: "no effect at any depth",
          bearing: "challenges",
        },
      ],
      heldTo: [check],
    });
    const claim = claims[0]!.claim;
    await session.evaluateCriterion({
      criterion: check,
      outcome: "pass",
      value: "loss 3.6 vs 3.8 baseline",
      citing: [claim],
    });
    await session.is({ claim, state: "confirmed", because: "the answer is no, and we checked" });
    await session.closeEnquiry({ enquiry, answeredBy: claim });

    const later = await afterwards();
    const survey = await later.whatIsKnown();
    expect(survey.established.some((q) => q.asks === QUESTION)).toBe(true);
    expect(survey.provisional.some((q) => q.asks === QUESTION)).toBe(false);
  });
});
