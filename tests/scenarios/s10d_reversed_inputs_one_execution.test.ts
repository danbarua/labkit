/**
 * S-10d — "The record keeps the order it was given." External review of PR #2, discriminator 3,
 * then corrected by Dan.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { recordAnalysis } from "../helpers/analysis";

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
  const { enquiry } = await session.openEnquiry("do the two series differ?");
  const { observations: treated } = await session.recordObservations({
    enquiry,
    name: "treated series",
    finding: "twelve points",
    contentHash: "sha256:treated",
  });
  const { observations: control } = await session.recordObservations({
    enquiry,
    name: "control series",
    finding: "twelve points",
    contentHash: "sha256:control",
  });
  const { analysis } = await recordAnalysis(session, {
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
