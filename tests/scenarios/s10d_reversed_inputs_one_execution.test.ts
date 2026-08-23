/**
 * S-10d — "Same members, reversed. Same execution?"
 * External review of PR #2, discriminator 3. Ledger row AF.
 *
 * Row AF said input order "earns nothing under the wrong-answer bar: the
 * reports claim the two runs consumed the same inputs, and they did — what a
 * reader *infers* is the wrong part." The review disagreed, and named the
 * probe the row had been asking for:
 *
 * > If this returns `execution: reproduced`, that looks like a positive wrong
 * > answer, not merely an inference a reader chose to make. [...] Same members
 * > is not necessarily same execution.
 *
 * The method here is order-sensitive and says so in its own name. The command
 * that recorded it took an **ordered array**. `CONSUMES` keeps a set.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;

const clock: Clock = { now: () => "2026-08-24T11:00:00.000Z" };

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });
beforeEach(async () => {
  session = new ResearchSession(await scenario.begin(), { clock, events: inMemoryEventLog() });
});
afterEach(async () => { await scenario.end(); });

const METHOD = "first input minus second";
const PROP = "the treated series sits above the control";

/** Two series, and a run that subtracts the second from the first. */
async function aSubtraction() {
  const enquiry = await session.openEnquiry("does the treated series sit above the control?");
  const treated = await session.recordObservations({
    enquiry, name: "treated series", finding: "twelve points", contentHash: "sha256:treated",
  });
  const control = await session.recordObservations({
    enquiry, name: "control series", finding: "twelve points", contentHash: "sha256:control",
  });
  const { analysis } = await session.recordAnalysis({
    enquiry, method: METHOD, from: [treated, control],
    concludes: [{ proposition: PROP, finding: "difference +0.4" }],
  });
  return { enquiry, treated, control, analysis };
}

describe("S-10d — two runs of an order-sensitive method, inputs reversed", () => {
  test("the record does not call a reversed run a reproduction", async () => {
    const { enquiry, treated, control, analysis } = await aSubtraction();

    // The same method, the same two series, the other way round. For this
    // method that is a different computation with the opposite sign.
    const rerun = await session.reverify({
      historical: analysis, enquiry, method: METHOD,
      under: [control, treated],
      concludes: { proposition: PROP, finding: "difference -0.4" },
    });

    const later = new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
    const report = await later.reproductionOf(rerun.verification);

    // Whatever the model decides about ordering, it must not state that these
    // two runs are the same execution.
    expect(report.execution).not.toBe("reproduced");
  });

  /**
   * The price of the answer above, asserted rather than left implicit.
   *
   * A rerun that read the same two records in the same order is *also*
   * `inputs-unordered`, because nothing distinguishes it from the reversed one
   * in the record. LabKit cannot tell an order-sensitive method from any other,
   * so it declines for every multi-input run instead of guessing — and that is
   * a real loss of an answer people want, kept visible here so the case for
   * storing order is made by evidence rather than by taste.
   */
  test("and it declines for the identical rerun too, which is the cost", async () => {
    const { enquiry, treated, control, analysis } = await aSubtraction();
    const rerun = await session.reverify({
      historical: analysis, enquiry, method: METHOD,
      under: [treated, control],
      concludes: { proposition: PROP, finding: "difference +0.4" },
    });

    const later = new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
    const report = await later.reproductionOf(rerun.verification);
    expect(report.execution).toBe("inputs-unordered");
    expect(report.comparable).toBe(false);
    expect(report.incomparableBecause).toContain("order in which each read them is not recorded");

    // Not a soft "no": nothing differs, and the report says nothing differs.
    // Absence of an answer and a negative answer are different states, which is
    // the distinction `ReproducibilityReport.unverifiable` already draws.
    expect(report.differs).toEqual([]);
  });

  test("a single-input rerun is still recognised, so the decline has a boundary", async () => {
    const enquiry = await session.openEnquiry("does the series trend up?");
    const series = await session.recordObservations({
      enquiry, name: "series", finding: "twelve points", contentHash: "sha256:series",
    });
    const { analysis } = await session.recordAnalysis({
      enquiry, method: "linear fit", from: [series],
      concludes: [{ proposition: PROP, finding: "slope +0.4" }],
    });
    const rerun = await session.reverify({
      historical: analysis, enquiry, method: "linear fit",
      under: [series],
      concludes: { proposition: PROP, finding: "slope +0.4" },
    });

    const later = new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
    const report = await later.reproductionOf(rerun.verification);
    expect(report.execution).toBe("reproduced");
    expect(report.comparable).toBe(true);
  });
});
