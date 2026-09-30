/**
 * S-11f — "Does it cost anything that an artefact does not say what kind it is?" External
 * review of PR #2, discriminator 1. Ledger row `ART_`.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

const clock: Clock = { now: () => "2026-08-24T12:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events, attribution: as("Researcher") });
});
afterEach(async () => {
  await scenario.end();
});

const TREND = "the response trends upward with dose";

/** Raw measurement, a calibration reading it, and a trend fit reading that. */
async function twoStages() {
  const { enquiry } = await session.writes.openEnquiry("does the response trend upward?");
  const { observations: raw } = await session.writes.recordObservations({
    enquiry,
    name: "raw series",
    finding: "uncalibrated instrument output",
    contentHash: "sha256:raw",
  });
  const calibration = await recordAnalysis(session.writes, {
    enquiry,
    method: "calibrate",
    from: [raw],
    concludes: [{ proposition: "the series is calibrated", finding: "offset removed" }],
  });
  const trend = await recordAnalysis(session.writes, {
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
    const why = await later.reads.whySupported({ claim: claimOf(trend.claims, TREND) });

    expect(why.restingOn).toHaveLength(1);
    // The vocabulary is wrong and the wording is right, which is the wrong way
    // round for this repo — but nothing is decided from either. Asserted on the
    // prefix because that is where a handle's kind lives: `part.kind` was a
    // field until handles became branded strings, and the field could disagree
    // with the id it sat beside.
    expect(why.restingOn[0]!.part).toMatch(/^ART_/);
    expect(why.restingOn[0]!.name).toBe("calibrate output");

    await captureConversation(
      {
        id: "S-11f",
        title: "A computed input, asked about by the reads that touch inputs",
        about:
          "One analysis calibrates a raw series and a second fits a trend to that calibrated output, so the second analysis rests on something computed rather than measured.",
      },
      events,
    );
  });
});
