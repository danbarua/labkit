/**
 * S-10e — "A run that read the same record twice."
 * External peer review of PR #2, merge blocker 1.
 *
 * S-10d established the principle the previous correction was made under:
 * LabKit does not decide what a run's inputs mean, but it must faithfully
 * retain what the caller said. This is that principle turned on the case the
 * S-10d regression could not see, because it used two distinct inputs.
 *
 * > LabKit accepted two occurrences and later reports one. That is pure
 * > bookkeeping loss.
 *
 * `TenantGraph.createEdge()` treats `(from, label, to)` as identity and a
 * repeat as a no-op, backed by a real `UNIQUE (start_id, end_id)` index — so a
 * second `CONSUMES` to the same artefact cannot exist. `reproductionOf()` then
 * keys its inputs by artefact id, so a repeat could not survive the read
 * either.
 *
 * A null test is the ordinary reason to do this: comparing a series against
 * itself. There is nothing exotic about `from = [A, A]`, and refusing it would
 * be LabKit deciding that a legitimate run is not recordable — the thing S-10d
 * removed.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { recordAnalysis } from "../../fragments";

let scenario: Scenario;
let session: ResearchSession;

const clock: Clock = { now: () => "2026-08-24T13:00:00.000Z" };

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

const PROP = "the series does not differ from itself";

describe("S-10e — the same record, read twice by one run", () => {
  test("a run that read one record twice is not reported as having read it once", async () => {
    const { enquiry } = await session.openEnquiry("does the series differ from itself?");
    const { observations: series } = await session.recordObservations({
      enquiry,
      name: "series",
      finding: "twelve points",
      contentHash: "sha256:series",
    });

    // The null test: the same series on both sides of a difference.
    const { analysis } = await recordAnalysis(session, {
      enquiry,
      method: "difference of the two series",
      from: [series, series],
      concludes: [{ proposition: PROP, finding: "difference 0.0" }],
    });
    // And a re-run that read it once, so the two are genuinely different.
    const rerun = await session.reverify({
      historical: analysis,
      enquiry,
      method: "difference of the two series",
      under: [series],
      concludes: { proposition: PROP, finding: "difference 0.0" },
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const report = await later.reproductionOf(rerun.verification);

    expect(report.ofRead.map((i) => i.part)).toEqual([series, series]);
    expect(report.verificationRead.map((i) => i.part)).toEqual([series]);
  });

  test("and the order of a repeat is kept, not just its count", async () => {
    const { enquiry } = await session.openEnquiry("does the sandwich cancel?");
    const { observations: a } = await session.recordObservations({
      enquiry,
      name: "series A",
      finding: "twelve points",
    });
    const { observations: b } = await session.recordObservations({
      enquiry,
      name: "series B",
      finding: "twelve points",
    });

    const { analysis } = await recordAnalysis(session, {
      enquiry,
      method: "a minus b plus a",
      from: [a, b, a],
      concludes: [{ proposition: PROP, finding: "residual 0.1" }],
    });
    const rerun = await session.reverify({
      historical: analysis,
      enquiry,
      method: "a minus b plus a",
      under: [a, b, a],
      concludes: { proposition: PROP, finding: "residual 0.1" },
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const report = await later.reproductionOf(rerun.verification);

    expect(report.ofRead.map((i) => i.name)).toEqual(["series A", "series B", "series A"]);
    expect(report.differs).toEqual([]);
  });
});
