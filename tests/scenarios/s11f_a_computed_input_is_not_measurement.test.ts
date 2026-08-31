/**
 * S-11f — "Does it cost anything that an artefact does not say what kind it is?"
 * External review of PR #2, discriminator 1. Ledger row `ART_`.
 *
 * The review's reframing, which is what makes this decidable:
 *
 * > The useful discriminator is not "can two `ART_` ids mean different things?"
 * > because they plainly can. It is: *can an existing consumer operation
 * > produce a wrong scientific answer because it cannot distinguish a measured
 * > artefact from a computed artefact?* [...] If no current contract depends on
 * > the distinction, boundary/refuted seems more honest.
 *
 * The durable node **does** know: `Artefact.kind` is `observations` or
 * `analysis-output`, written by `recordObservations` and by `recorded`. What is
 * ambiguous is the handle vocabulary — every read hands back
 * `{kind: "observations", id}` regardless.
 *
 * This file is the measurement, and its **result is negative**: neither read
 * gives a wrong answer. Measured, not argued —
 *
 *   - **No reader branches on `Artefact.kind`.** Grepped across `src/`: the
 *     property is written by both minting verbs and read by nothing. Every
 *     `.kind` a read does consult belongs to a `Claim`, a `Computation` or a
 *     `Work`.
 *   - `whySupported().restingOn` labels a computed artefact
 *     `{kind: "observations"}`. Wrong vocabulary, and nothing is decided from
 *     it — the field a reader uses is the identity beside it.
 *   - `reproducibilityOf` puts a computed input in **`unverifiable`**, which is
 *     the record declining to answer. It could have been positive here: had it
 *     landed in `differing`, that would be claiming inequality from absence,
 *     which is a wrong answer and the exact defect S-9c was fixed for.
 *
 * So the row closes as **refuted at the wrong-answer bar**: this is reference-
 * model debt, not missing domain state. The one real consequence is named in
 * the second test — an answer weaker than the record supports — and it is a
 * candidate discriminator for anyone who builds recursive accounting, not
 * evidence for a change today.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";

let scenario: Scenario;
let session: ResearchSession;

const clock: Clock = { now: () => "2026-08-24T12:00:00.000Z" };

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

const TREND = "the response trends upward with dose";

/** Raw measurement, a calibration reading it, and a trend fit reading that. */
async function twoStages() {
  const { enquiry } = await session.openEnquiry("does the response trend upward?");
  const { observations: raw } = await session.recordObservations({
    enquiry,
    name: "raw series",
    finding: "uncalibrated instrument output",
    contentHash: "sha256:raw",
  });
  const calibration = await session.recordAnalysis({
    enquiry,
    method: "calibrate",
    from: [raw],
    concludes: [{ proposition: "the series is calibrated", finding: "offset removed" }],
  });
  const trend = await session.recordAnalysis({
    enquiry,
    method: "trend",
    from: [calibration.analysis],
    concludes: [{ proposition: TREND, finding: "slope 0.4" }],
  });
  return { enquiry, raw, calibration, trend };
}

describe("S-11f — a computed input, asked about by the reads that touch inputs", () => {
  test("the handle says observations; the record it names is an analysis output", async () => {
    const { trend } = await twoStages();
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const why = await later.whySupported(claimOf(trend.claims, TREND));

    expect(why.restingOn).toHaveLength(1);
    // The vocabulary is wrong and the wording is right, which is the wrong way
    // round for this repo — but nothing is decided from either. Asserted on the
    // prefix because that is where a handle's kind lives: `part.kind` was a
    // field until handles became branded strings, and the field could disagree
    // with the id it sat beside.
    expect(why.restingOn[0]!.part).toMatch(/^ART_/);
    expect(why.restingOn[0]!.name).toBe("calibrate output");
  });

  test("accounting for a computed input declines, and does not report it unequal", async () => {
    const { raw, calibration, trend } = await twoStages();
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });

    // Stage one is fully accounted for: a hash was recorded and it matches.
    const stageOne = await later.reproducibilityOf(calibration.analysis, [
      { part: raw, hash: "sha256:raw" },
    ]);
    expect(stageOne.exact.map((p) => p.name)).toEqual(["raw series"]);
    expect(stageOne.reproducible).toBe(true);

    // Stage two reads a computed artefact, which carries no hash — nothing was
    // measured, so there is nothing to hash against. That lands in
    // `unverifiable`, which is the record declining to answer rather than
    // answering no, and it is the correct answer about that record.
    // Stage two reads a computed artefact, which carries no hash — nothing was
    // measured, so there is nothing to hash against.
    const stageTwo = await later.reproducibilityOf(trend.analysis, []);
    expect(stageTwo.unverifiable.map((p) => p.name)).toEqual(["calibrate output"]);
    // The half that makes this a real probe rather than a restatement: absence
    // is not reported as difference. `differing` would be a wrong answer.
    expect(stageTwo.differing).toEqual([]);
    expect(stageTwo.reproducible).toBe(false);

    // **The one real consequence, and it is a weaker answer rather than a
    // wrong one.** `unverifiable` is right about the hash and blind to the
    // route: this artefact was produced by a computation whose own input is
    // accounted for exactly, one hop away, and the record holds that. Nothing
    // walks it, because nothing knows this input is computed rather than
    // measured. Whoever wants that accounting has a discriminator here.
    expect(stageOne.reproducible).toBe(true);
  });
});
