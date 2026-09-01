/**
 * S-11g — "The replacement addressed three of four conclusions."
 *
 * One analysis with two conclusions. A review, and a re-analysis that restates
 * one of them and deliberately excludes the other — a real re-analysis, whose
 * own text says the excluded result *"stands as final"*.
 *
 * What it holds the record to: the excluded finding still stands and still
 * rests on its input; the restated one falls and names the review that caused
 * it; and a criterion evaluation falls or stands according to which of the two
 * findings it cited.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { recordAnalysis, replaceAnalysis } from "../../fragments";

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
  const { analysis: v1, claims: v1Claims } = await recordAnalysis(session, {
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

/** The re-analysis, naming the one finding that survives it and no other. */
async function theLogScaleReAnalysis(w: Awaited<ReturnType<typeof aRunPartlyReAnalysed>>) {
  const { review } = await session.recordReview({
    of: w.v1,
    verdict: "raw-scale aggregation is untrustworthy for the stochastic-control comparisons",
  });
  // The lattice comparison is what survives, matching the re-analysis's own
  // scope: everything else the run concluded is superseded here.
  const report = await session.keep({
    keeping: [w.stands],
    because: review,
    method: "log-scale re-aggregation",
  });
  const { claims } = await session.conclude({
    analysis: report.replacement,
    proposition: REVISITED,
    finding: "p = 0.007 log",
  });
  return { ...report, claims };
}

async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

describe("S-11g — a replacement that addresses only some of a run's conclusions", () => {
  /**
   * The finding nothing named. Both halves matter: a fix that cleared
   * `superseded` while leaving `restingOn` empty would read as a whole fix.
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
   * The read has to be able to say "I cannot tell", or it is guessing.
   *
   * Two conclusions of one analysis may assert the same sentence about
   * different endpoints, which is why a claim has a handle of its own. Pairing
   * a successor's findings to the superseded ones by wording is then ambiguous,
   * and a read cannot refuse — so it reports the finding unpaired.
   */
  test("a superseded finding whose wording matches two is reported unpaired, not guessed", async () => {
    const { enquiry } = await session.openEnquiry("does T differ from its controls?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "per-image results",
      finding: "two independent batches",
    });
    // One sentence, two findings: the same claim about two batches.
    const { analysis: v1, claims: v1Claims } = await recordAnalysis(session, {
      enquiry,
      method: "raw-scale aggregation",
      from: [observations],
      concludes: [
        { proposition: REVISITED, finding: "p = 0.03 raw, batch one" },
        { proposition: REVISITED, finding: "p = 0.04 raw, batch two" },
      ],
    });
    const { review } = await session.recordReview({ of: v1, verdict: "wrong scale" });

    // Nothing kept — both fall — and one successor finding asserting the same
    // sentence as each of them.
    const report = await session.replaceAnalysis({
      supersedes: v1,
      because: review,
      method: "log-scale re-aggregation",
    });
    await session.conclude({
      analysis: report.replacement,
      proposition: REVISITED,
      finding: "p = 0.007 log",
    });

    const why = await (await afterwards()).why(report.replacement);
    if (why.kind !== "analysis") throw new Error(`expected an analysis, got ${why.kind}`);
    // The superseded one is reported, and not paired with the successor: the
    // wording matched more than one finding of the revised analysis.
    expect(why.report.unpaired.map((u) => u.claim).sort()).toEqual(
      v1Claims.map((c) => c.claim).sort(),
    );
    expect(why.report.changed).toEqual([]);
  });

  /**
   * **The pair, on the evaluations.** A verdict falls or stands according to
   * which finding it cited. Both halves are asserted, because a record that
   * withdrew all of them or none would satisfy either alone.
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
    // it.
    expect(await state("revisited")).toBe("no-standing-verdict");
    await scenario.end();
    session = new ResearchSession(await scenario.begin(), { clock, events: inMemoryEventLog() });

    // The verdict reached against the finding this act never mentioned does
    // not.
    expect(await state("stands")).toBe("failed");
  });
});
