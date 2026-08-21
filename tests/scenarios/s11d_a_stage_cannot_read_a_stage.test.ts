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

  // Stage two reads stage one's output directly. Before row AE this was not
  // expressible: `from` took observations only, so the intermediate had to be
  // re-entered as if it were fresh measurement — severing the chain to the raw
  // series and making stage two look independently reproducible.
  const trend = await s.recordAnalysis({
    enquiry, method: "dose-response-fit", from: [calibration],
    concludes: [{ proposition: TRENDS, finding: "monotonic increase, p < 0.01" }],
  });
  return { enquiry, raw, calibration, trend };
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
   * Stage two no longer claims to be reproducible on top of something that
   * isn't. **Inverted, not deleted** — the two lines this test shipped with in
   * a comment are the live assertions now.
   *
   * It rests on stage one, which rests on a series nobody can check. The record
   * now says so: stage two's input is the calibration's output artefact, which
   * carries no content hash, so the report reads `unverifiable` rather than
   * inventing a clean bill.
   */
  test("stage two does not claim reproducibility it cannot have", async () => {
    const { trend } = await aPipelineOnUnverifiableRawData(session);

    const report = await (await afterwards()).reproducibilityOf(trend, []);

    expect(report.reproducible).toBe(false);
    // The calibration's output artefact -- what stage two actually read.
    expect(report.unverifiable).toEqual(["calibrate output"]);
    expect(report.exact).toEqual([]);
  });

  /**
   * The chain now **exists** in the record, and `whatDependsOn()` still does not
   * walk it. Both halves asserted, because they are different problems.
   *
   * S-11c's omission had two causes stacked: the chain was severed at the write
   * surface, *and* the query is one hop. Row AE fixed the first. The second is
   * query semantics, and `DependencyReport.routesWalked` already says so rather
   * than letting the short answer read as a complete one — which is exactly the
   * situation that open-world caveat was built for.
   */
  test("the chain exists in the record, and the one-hop query still stops short", async () => {
    const { raw, calibration } = await aPipelineOnUnverifiableRawData(session);
    const reader = await afterwards();

    const fromRaw = await reader.whatDependsOn(raw);
    expect(fromRaw.claims).toEqual(["the calibration is stable"]);
    expect(fromRaw.complete).toBe(false);

    // One hop further along the chain that now exists, the downstream claim is
    // reachable -- so the link is real and only the traversal is short.
    const parts = await reader.reproducibilityOf(calibration, []);
    expect(parts.unverifiable).toEqual(["raw sensor series"]);
  });
});
