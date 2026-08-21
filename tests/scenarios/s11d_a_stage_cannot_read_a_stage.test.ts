/**
 * S-11d — "Reproducible, on top of something that isn't."
 * docs/TASKS.md, the missing verb S-11c exposed.
 *
 * `recordAnalysis({ from })` takes only observations handles, and
 * `recordObservations()` is the only thing that makes one. So an analysis
 * cannot read another analysis's output, and a two-stage pipeline can only be
 * recorded by re-entering the intermediate as if it were fresh measurement.
 *
 * S-11c showed that breaks `whatDependsOn()`. This shows it produces a
 * confidently wrong answer somewhere else, which is what PJ-011 §5 asks for.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;
const clock: Clock = { now: () => "2026-08-21T09:00:00.000Z" };

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });
beforeEach(async () => {
  session = new ResearchSession(await scenario.begin(), { clock, events: inMemoryEventLog() });
});
afterEach(async () => { await scenario.end(); });

async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

const TRENDS = "the response trends upward with dose";

/**
 * Researcher: "The raw series came off an instrument nobody logged the settings
 *  for. We calibrated it, and the trend analysis reads the calibrated series."
 *
 * The raw series has no content hash — its provenance is genuinely
 * unrecoverable, which the record is right to say. Everything downstream
 * inherits that, in the world if not in the record.
 */
async function aPipelineOnUnverifiableRawData(s: ResearchSession) {
  const enquiry = await s.openEnquiry("does the response trend upward with dose?");
  const raw = await s.recordObservations({
    enquiry, name: "raw sensor series", finding: "eleven dose levels, instrument settings not logged",
  });
  const calibration = await s.recordAnalysis({
    enquiry, method: "calibrate", from: [raw],
    concludes: [{ proposition: "the calibration is stable", finding: "drift under 0.2%" }],
  });

  // Stage two. The only way to express it: record the intermediate as if it
  // were a fresh measurement, with a hash of its own.
  const calibrated = await s.recordObservations({
    enquiry, name: "calibrated series", finding: "eleven dose levels, calibrated",
    contentHash: "sha256:calibrated",
  });
  const trend = await s.recordAnalysis({
    enquiry, method: "dose-response-fit", from: [calibrated],
    concludes: [{ proposition: TRENDS, finding: "monotonic increase, p < 0.01" }],
  });
  return { enquiry, raw, calibration, calibrated, trend };
}

describe("S-11d: a stage cannot read a stage", () => {
  /** The record is right about stage one: it rests on something uncheckable. */
  test("stage one reports itself unreproducible, correctly", async () => {
    const { raw, calibration } = await aPipelineOnUnverifiableRawData(session);
    const report = await (await afterwards()).reproducibilityOf(calibration, [
      { part: raw, hash: "sha256:whatever" },
    ]);
    expect(report.unverifiable).toEqual(["raw sensor series"]);
    expect(report.reproducible).toBe(false);
  });

  /**
   * **KNOWN WRONG.** Stage two reports itself fully reproducible.
   *
   * It rests on stage one, which rests on a series nobody can check. Rebuilding
   * the trend means rebuilding the calibration, and that cannot be done. But the
   * record shows stage two consuming an ordinary observation with a hash, so
   * the report comes back `reproducible: true` — a positive claim of
   * reproducibility for work that sits on top of admittedly unrecoverable data.
   *
   * Not an absence. `reproducible` is exactly the field CLAUDE.md says "must not
   * quietly say otherwise", and here it says otherwise.
   *
   * Asserted as wrong on purpose, with the assertion it *should* make in the
   * comment. When a verb exists to record stage two as reading stage one's
   * output, invert this rather than deleting it.
   */
  test("KNOWN WRONG: stage two reports itself reproducible on top of unverifiable data", async () => {
    const { calibrated, trend } = await aPipelineOnUnverifiableRawData(session);

    const report = await (await afterwards()).reproducibilityOf(trend, [
      { part: calibrated, hash: "sha256:calibrated" },
    ]);

    // What it should say, and does not:
    //   expect(report.reproducible).toBe(false);
    //   expect(report.unverifiable).toEqual(["raw sensor series"]);
    expect(report.exact).toEqual(["calibrated series"]);
    expect(report.unverifiable).toEqual([]);
    expect(report.reproducible).toBe(true);
  });

  /**
   * And the reader has no route to find out. Nothing connects the calibrated
   * series to the calibration that produced it, so a caller cannot walk from
   * stage two to the thing that makes its answer wrong.
   */
  test("nothing links the intermediate back to the analysis that produced it", async () => {
    const { calibrated } = await aPipelineOnUnverifiableRawData(session);
    const rests = await (await afterwards()).whatDependsOn(calibrated);
    expect(rests.claims).toEqual([TRENDS]);
    expect(rests.claims).not.toContain("the calibration is stable");
  });
});
