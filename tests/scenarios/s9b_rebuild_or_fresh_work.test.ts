/**
 * S-9b — "Was this a rebuild, or new work?"
 * row F
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  ResearchSession,
  inMemoryEventLog,
  type Clock,
  type EventSink,
  type KnowledgeSurvey,
} from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
/** The acts of the world currently open, so a scenario page can be rendered from them. */
let events: EventSink;

/**
 * Frozen, not merely fixed. Two worlds that a read could separate only because wall-clock time
 * moved between them would have been separated as test runs, not as research states —
 * `tests/helpers/clock.ts` on why that distinction is load-bearing.
 */
const clock: Clock = { now: () => "2026-08-21T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});

/** A second reader over the same graph — see tests/helpers/scenario.ts. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

/**
 * One world, begun and torn down inside the test.
 */
async function inOneWorld<T>(build: (s: ResearchSession) => Promise<T>): Promise<T> {
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  try {
    return await build(
      new ResearchSession(graph, { clock, events, attribution: as("Researcher") }),
    );
  } finally {
    await scenario.end();
  }
}

const CONTROL = "historical random control";
const MATCHES = "the accelerated path matches the reference";

/**
 * Two worlds, each built from scratch on its own graph, then compared.
 */
async function inTwoWorlds<T>(
  worldA: (s: ResearchSession) => Promise<T>,
  worldB: (s: ResearchSession) => Promise<T>,
): Promise<{ a: T; b: T }> {
  return { a: await inOneWorld(worldA), b: await inOneWorld(worldB) };
}

/**
 * Researcher: "There's a cached construction from the old study. The control that went into it
 * has no recorded provenance — nobody wrote down what generated it."
 */
async function theCachedConstruction(s: ResearchSession) {
  const { enquiry } = await s.writes.openEnquiry("does the accelerated path match the reference?");
  const { observations: control } = await s.writes.recordObservations({
    enquiry,
    name: CONTROL,
    finding: "randomised control series",
  });
  const { analysis, claims: analysisClaims } = await recordAnalysis(s.writes, {
    enquiry,
    method: "stage2-construction",
    from: [control],
    concludes: [{ proposition: MATCHES, finding: "agreement within 1e-6" }],
  });
  return { enquiry, control, analysis, analysisClaims };
}

/** Every question's wording, under the bucket `whatIsKnown` put it in. */
function bucketsOf(known: KnowledgeSurvey): Record<string, string[]> {
  const asks = (qs: readonly { asks: string }[]) => qs.map((q) => q.asks).sort();
  return {
    established: asks(known.established),
    provisional: asks(known.provisional),
    unresolved: asks(known.unresolved),
    untested: asks(known.untested),
    accepted: asks(known.accepted),
  };
}

describe("S-9b: was this a rebuild, or new work?", () => {
  /**
   * Rung 1, and the finding. Two research situations that mean different things produce **the
   * same durable record**.
   */
  test("a reconstruction and independent fresh work leave the same durable record", async () => {
    const build = (finding: string) => async (s: ResearchSession) => {
      const { enquiry } = await theCachedConstruction(s);
      const { observations: second } = await s.writes.recordObservations({
        enquiry,
        name: CONTROL,
        finding,
        contentHash: "sha256:second",
      });
      const { analysis: rebuilt, claims: rebuiltClaims } = await recordAnalysis(s.writes, {
        enquiry,
        method: "stage2-construction, second control",
        from: [second],
        concludes: [{ proposition: MATCHES, finding: "agreement within 1e-6" }],
      });
      const reader = await afterwards();
      return {
        why: await reader.reads.whySupported({ claim: claimOf(rebuiltClaims, MATCHES) }),
        known: bucketsOf(await reader.reads.whatIsKnown()),
        // Natural ids are global sequences, so two paired worlds draw different ones;
        // the comparison is over whether anything *else* differs.
        rebuilt: rebuilt.replace(/\d+/, "N"),
      };
    };

    const { a, b } = await inTwoWorlds(
      build("randomised control series, regenerated from an inferred algorithm"),
      build("randomised control series for stage 3, generated afresh"),
    );

    // Everything a reader can ask is identical except the sentence the
    // researcher happened to type. Attribution of a rebuild is currently
    // **only wording**, which is the seventh region in which identity has had
    // to be separated from what something says.
    // Each answer holds something, so the equalities below compare contents, not two empties.
    expect(a.why.support.length).toBeGreaterThan(0);
    expect(Object.values(a.known).flat()).toContain(
      "does the accelerated path match the reference?",
    );
    expect(a.why.support.length).toBe(b.why.support.length);
    expect(a.known).toEqual(b.known);
    expect(a.rebuilt).toEqual(b.rebuilt);

    await captureConversation(
      {
        id: "S-9b",
        title: "was this a rebuild, or new work?",
        about:
          "A second control is recorded against an old cached construction. Whether it is a reconstruction of the original or independent fresh work is currently only wording, and the record reads the same either way.",
      },
      events,
    );
  });

  /**
   * And here is the part that decides whether row F clears or stays an absence: **what does the
   * record actually claim** in the world where the second control is a rebuild?
   */
  test("what the record claims when the second control is a rebuild", async () => {
    const why = await inOneWorld(async (s) => {
      const { enquiry } = await theCachedConstruction(s);
      const { observations: regenerated } = await s.writes.recordObservations({
        enquiry,
        name: CONTROL,
        contentHash: "sha256:second",
        finding: "randomised control series, regenerated from an inferred algorithm",
      });
      const { claims: secondClaims } = await recordAnalysis(s.writes, {
        enquiry,
        method: "stage2-construction, rebuilt",
        from: [regenerated],
        concludes: [{ proposition: MATCHES, finding: "agreement within 1e-6" }],
      });
      return (await afterwards()).reads.whySupported({ claim: claimOf(secondClaims, MATCHES) });
    });
    // Recorded, not asserted-as-correct. Whether two entries here is a wrong
    // answer or an accurate report of what the researcher recorded is the
    // question this scenario exists to settle; the number is written down so
    // the answer is a fact rather than a recollection.
    expect(why.support.length).toBe(2);
  });

  /**
   * A researcher opens the question of what generated the historical control and works on it:
   * three candidate algorithms tried, none reproduces the recorded series. That is real,
   * recorded, durable work, and a negative result is a result.
   */
  test("a reconstruction attempt that fails is not a question nobody has looked at", async () => {
    const { untested, unresolved } = await inOneWorld(async (s) => {
      const { enquiry } = await theCachedConstruction(s);
      const { enquiry: provenance } = await s.writes.openEnquiry(
        "what generated the historical random control?",
      );

      // The attempt, recorded against the question it is an attempt to answer.
      await s.writes.recordObservations({
        enquiry: provenance,
        name: "regeneration attempt",
        finding: "three candidate algorithms tried; none reproduces the recorded series",
      });
      // And an unrelated regeneration on the original enquiry, so the two
      // enquiries are not trivially distinguishable by having any work at all.
      await s.writes.recordObservations({
        enquiry,
        name: CONTROL,
        contentHash: "sha256:second",
        finding: "randomised control series, regenerated from an inferred algorithm",
      });

      const known = await (await afterwards()).reads.whatIsKnown();
      return {
        untested: known.untested.map((q) => q.asks),
        unresolved: known.unresolved.map((q) => q.asks),
      };
    });

    expect(unresolved).toContain("what generated the historical random control?");
    expect(untested).not.toContain("what generated the historical random control?");

    // The sibling, unchanged by the fix and unchanged before it: a question
    // worked on through recordAnalysis(), which always minted a unit.
    expect(unresolved).toContain("does the accelerated path match the reference?");
  });
});
