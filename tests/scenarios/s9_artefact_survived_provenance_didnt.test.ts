/**
 * S-9 — "The artefact survived; its provenance didn't."  and rows F, P
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { recordAnalysis } from "../helpers/analysis";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

let tick = 0;
const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 7, 20, 9, tick++)).toISOString(),
};

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  tick = 0;
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events, attribution: as("Researcher") });
});
afterEach(async () => {
  await scenario.end();
});

/** A second reader over the same graph — see tests/helpers/scenario.ts. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

const CONTROL = "historical random control";
const PROPOSITION = "the accelerated path matches the reference";

/**
 * Researcher: "There's a cached construction from the old study. Four parts went into it, and a
 * result rests on it."
 */
async function aCachedConstructionWithOneUnrecordedPart() {
  const { enquiry } = await session.writes.openEnquiry(
    "does the accelerated path match the reference?",
  );
  const parts = [
    (
      await session.writes.recordObservations({
        enquiry,
        name: "weights",
        finding: "layer weights",
        contentHash: "sha256:aaa",
      })
    ).observations,
    (
      await session.writes.recordObservations({
        enquiry,
        name: "splits",
        finding: "fold assignment",
        contentHash: "sha256:bbb",
      })
    ).observations,
    (
      await session.writes.recordObservations({
        enquiry,
        name: "priors",
        finding: "prior draws",
        contentHash: "sha256:ccc",
      })
    ).observations,
    (
      await session.writes.recordObservations({
        enquiry,
        name: CONTROL,
        finding: "randomised control series",
      })
    ).observations,
  ];
  const { analysis, claims: analysisClaims } = await recordAnalysis(session.writes, {
    enquiry,
    method: "stage2-construction",
    from: parts,
    concludes: [{ proposition: PROPOSITION, finding: "agreement within 1e-6" }],
  });
  return { enquiry, parts, analysis, analysisClaims };
}

describe("S-9: the artefact survived; its provenance didn't", () => {
  /**
   * Afterward 4. "What would resolve this?" — an open question, still open.
   * A regeneration is a workaround, not an answer, and the record must not let
   * it close the question by side effect.
   */
  test("Afterward 4: regenerating does not close the question of what made the original", async () => {
    const { enquiry } = await aCachedConstructionWithOneUnrecordedPart();
    const { enquiry: unresolved } = await session.writes.openEnquiry(
      "what generated the historical random control?",
    );

    await session.writes.recordObservations({
      enquiry,
      name: CONTROL,
      finding: "randomised control series, regenerated from an inferred algorithm",
      contentHash: "sha256:regenerated",
    });

    // `untested`, not `unresolved` -- nobody has worked on it. That is row I's
    // distinction and the survey is right to make it; the requirement here is
    // only that regenerating the part does not move the question out of the
    // open set by side effect.
    const known = await (await afterwards()).reads.whatIsKnown();
    expect(known.untested.map((q) => q.asks)).toContain(
      "what generated the historical random control?",
    );
    expect(known.established.map((q) => q.asks)).not.toContain(
      "what generated the historical random control?",
    );
    expect(unresolved).toBeDefined();

    await captureConversation(
      {
        id: "S-9",
        title: "the artefact survived; its provenance didn't",
        about:
          "A cached construction from an old study has one part with no recorded hash, so nobody can check it. The researcher regenerates that part, and the question of what made the original stays open.",
      },
      events,
    );
  });
});
