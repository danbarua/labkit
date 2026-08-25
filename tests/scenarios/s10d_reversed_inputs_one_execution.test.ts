/**
 * S-10d — "The record keeps the order it was given."
 * External review of PR #2, discriminator 3, then corrected by Dan.
 *
 * **What this file first argued, and why that was wrong.** It ran an analysis
 * called "first input minus second" twice with the inputs swapped, got +0.4 and
 * −0.4, and called the report's `execution: "reproduced"` a wrong answer. The
 * remedy was a third value meaning "cannot say".
 *
 * Both halves of that were scope creep. Whether +0.4 and −0.4 are the same
 * result depends on the question — if the researcher asked for the absolute
 * magnitude of the difference, they are — and the probe answered that question
 * on the researcher's behalf in order to declare the record wrong. Then the fix
 * made the record hedge its own answer to the same question rather than stop
 * answering it.
 *
 * **LabKit is bookkeeping. Interpreting the books is for the reader.** So
 * `execution` and `comparable` are gone, along with `incomparableBecause`. The
 * report says what each run read, in the order it was given, and what differs
 * between them. Whether that constitutes a reproduction is a question about the
 * method, which the record does not know.
 *
 * What survives from the probe is the defect underneath it, which is a
 * bookkeeping defect and squarely LabKit's: `recordAnalysis({ from })` took an
 * ordered array and the record threw the order away. Losing something the
 * caller said is the one thing this store exists not to do.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;

const clock: Clock = { now: () => "2026-08-24T11:00:00.000Z" };

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

const METHOD = "difference of the two series";
const PROP = "the two series differ in magnitude";

/** Two series, and a run that takes the difference between them. */
async function aDifference() {
  const enquiry = await session.openEnquiry("do the two series differ?");
  const treated = await session.recordObservations({
    enquiry,
    name: "treated series",
    finding: "twelve points",
    contentHash: "sha256:treated",
  });
  const control = await session.recordObservations({
    enquiry,
    name: "control series",
    finding: "twelve points",
    contentHash: "sha256:control",
  });
  const { analysis } = await session.recordAnalysis({
    enquiry,
    method: METHOD,
    from: [treated, control],
    concludes: [{ proposition: PROP, finding: "difference 0.4" }],
  });
  return { enquiry, treated, control, analysis };
}

describe("S-10d — the order a run read its inputs in", () => {
  test("a rerun that read the same records in the other order is shown as such", async () => {
    const { enquiry, treated, control, analysis } = await aDifference();
    const rerun = await session.reverify({
      historical: analysis,
      enquiry,
      method: METHOD,
      under: [control, treated],
      concludes: { proposition: PROP, finding: "difference 0.4" },
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const report = await later.reproductionOf(rerun.verification);

    // The same two records on both sides, so nothing differs...
    expect(report.differs).toEqual([]);
    // ...and the order each run read them in is on the record, which is the
    // whole of what LabKit has to say about it. A reader who knows whether this
    // method is order-sensitive can now tell; before, the information was gone.
    expect(report.ofRead.map((i) => i.name)).toEqual(["treated series", "control series"]);
    expect(report.verificationRead.map((i) => i.name)).toEqual([
      "control series",
      "treated series",
    ]);
  });

  test("a rerun that read them in the same order is shown as that", async () => {
    const { enquiry, treated, control, analysis } = await aDifference();
    const rerun = await session.reverify({
      historical: analysis,
      enquiry,
      method: METHOD,
      under: [treated, control],
      concludes: { proposition: PROP, finding: "difference 0.4" },
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const report = await later.reproductionOf(rerun.verification);

    expect(report.differs).toEqual([]);
    expect(report.verificationRead.map((i) => i.name)).toEqual([
      "treated series",
      "control series",
    ]);
    expect(report.verificationRead.map((i) => i.part)).toEqual(report.ofRead.map((i) => i.part));
  });

  /**
   * The pairing that makes the two tests above evidence rather than decoration.
   *
   * If order were still discarded, both would report the same list and the
   * first test could not fail. This asserts the two orders are genuinely
   * different sequences of the same two records.
   */
  test("the two orders are different sequences of the same records", async () => {
    const { enquiry, treated, control, analysis } = await aDifference();
    const rerun = await session.reverify({
      historical: analysis,
      enquiry,
      method: METHOD,
      under: [control, treated],
      concludes: { proposition: PROP, finding: "difference 0.4" },
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const report = await later.reproductionOf(rerun.verification);

    expect(report.verificationRead.map((i) => i.part)).not.toEqual(
      report.ofRead.map((i) => i.part),
    );
    expect([...report.verificationRead].map((i) => i.part).sort()).toEqual(
      [...report.ofRead].map((i) => i.part).sort(),
    );
    void treated;
    void control;
  });
});
