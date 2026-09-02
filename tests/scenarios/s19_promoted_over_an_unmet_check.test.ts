/**
 * S-19 — "Somebody vouched for it. Nobody checked it."
 * The wrong answer is demonstrated first, in §1, and the fix's shape is
 * what §2 asserts.
 *
 * The story: a researcher agrees a condition *before* running, records the run
 * holding it to that condition, decides the result matters and promotes it,
 * and closes the question on it. Every step is ordinary and none is a mistake.
 * The prespecified check is never evaluated.
 *
 * `labkit known` then reports the question **established** — its strongest
 * word, meaning the answer rests on promoted, confirmatory work — while
 * `whySupported` on the same claim reports the check unmet. Two verbs, one
 * record, contradictory answers about one claim's standing, and the reassuring
 * one is what a person reads first.
 *
 * **This is a positive assertion, not an absence**, which is the distinction
 * that earns the change. `whatIsKnown` is not silent about the question; it
 * answers, and the answer is wrong.
 *
 * **Never-run rather than failed, deliberately.** A prespecified check
 * nobody ran must count against the finding it qualifies — which is why
 * `QUALIFIES` is written when the analysis is recorded and not
 * when the check is evaluated. The survey is the one reader that ignored it,
 * and never-run is the case with no gate, no evaluation and no second act in
 * it: three verbs and the contradiction is there.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { recordAnalysis } from "../../fragments";

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
 *
 * The check is stated **before** the enquiry, because it is prespecified —
 * agreeing it afterwards is the thing a prespecified condition exists to stop,
 * and a scenario that states it late would be testing a different story.
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
   * Afterward. "What do we know?" — and the survey must not answer
   * `established`.
   *
   * Asserted from a **second reader over the same graph** rather than from the
   * value the write returned, because "afterward" means reconstructible from
   * durable state. `scenario.current()` exists for exactly this.
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
   * The control. Run the same check and pass it, and nothing else changes —
   * the question is established, as it always was.
   *
   * Without this the scenario above is satisfiable by a survey that never says
   * `established` at all, which would be a wrong answer of its own.
   */
  test("a check that was run and passed leaves the answer established", async () => {
    const { check, claim } = await aPromotedAnswerNobodyChecked();
    await session.evaluateCriterion({
      criterion: check,
      outcome: "pass",
      value: "loss 3.6 vs 3.8 baseline",
      citing: claim,
    });

    const later = await afterwards();
    const survey = await later.whatIsKnown();
    expect(survey.established.some((q: { asks: string }) => q.asks === QUESTION)).toBe(true);
  });

  /**
   * The mirror image, and the case that was passing for the wrong reason.
   *
   * A promoted **negative** result whose prespecified check ran and passed must
   * reach `established` exactly as a positive one does. It did not: `checksOf`
   * collected criteria from both bearings while the *grain* read one column, so
   * a criterion reached down the challenged path was silently dropped — and a
   * dropped criterion reads as "no checks", which is vacuously met.
   *
   * **The never-run test above passed for the wrong reason** while that was
   * true: dropping the row and finding the check unmet give the same bucket.
   * That is a right conclusion with the reasoning under it wrong, and no test
   * catching it because the tests pass either way. This is the case that
   * could have been positive and was not.
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
      citing: claim,
    });
    await session.is({ claim, state: "confirmed", because: "the answer is no, and we checked" });
    await session.closeEnquiry({ enquiry, answeredBy: claim });

    const later = await afterwards();
    const survey = await later.whatIsKnown();
    expect(survey.established.some((q) => q.asks === QUESTION)).toBe(true);
    expect(survey.provisional.some((q) => q.asks === QUESTION)).toBe(false);
  });
});
