/**
 * S-9 — "The artefact survived; its provenance didn't."  and rows F, P
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { recordAnalysis } from "../helpers/analysis";

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
  session = new ResearchSession(graph, { clock, events });
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
  const { enquiry } = await session.openEnquiry("does the accelerated path match the reference?");
  const parts = [
    (
      await session.recordObservations({
        enquiry,
        name: "weights",
        finding: "layer weights",
        contentHash: "sha256:aaa",
      })
    ).observations,
    (
      await session.recordObservations({
        enquiry,
        name: "splits",
        finding: "fold assignment",
        contentHash: "sha256:bbb",
      })
    ).observations,
    (
      await session.recordObservations({
        enquiry,
        name: "priors",
        finding: "prior draws",
        contentHash: "sha256:ccc",
      })
    ).observations,
    (
      await session.recordObservations({
        enquiry,
        name: CONTROL,
        finding: "randomised control series",
      })
    ).observations,
  ];
  const { analysis, claims: analysisClaims } = await recordAnalysis(session, {
    enquiry,
    method: "stage2-construction",
    from: parts,
    concludes: [{ proposition: PROPOSITION, finding: "agreement within 1e-6" }],
  });
  return { enquiry, parts, analysis, analysisClaims };
}

describe("S-9: the artefact survived; its provenance didn't", () => {
  /**
   * Afterward 1. "Which parts of this artefact are reproducible?" — three named exactly, one
   * not. A part with no recorded hash is not a part that differs; it is a part nobody can
   * check, and the two must not read alike.
   */
  test("Afterward 1: three parts reproduce exactly, one cannot be checked at all", async () => {
    const { parts, analysis } = await aCachedConstructionWithOneUnrecordedPart();

    // Offered by part, not by name. Keying these by `logical_name` would have
    // reintroduced, one function away, the identity defect this scenario is
    // about -- and in S-9 of all places, where two parts share a name.
    const report = await (await afterwards()).reproducibilityOf(analysis, [
      { part: parts[0]!, hash: "sha256:aaa" },
      { part: parts[1]!, hash: "sha256:bbb" },
      { part: parts[2]!, hash: "sha256:ccc" },
      { part: parts[3]!, hash: "sha256:regenerated" },
    ]);

    expect(report.exact.map((p) => p.name).sort()).toEqual(["priors", "splits", "weights"]);
    expect(report.unverifiable.map((p) => p.name)).toEqual([CONTROL]);
    expect(report.differing.map((p) => p.name)).toEqual([]);
    expect(report.reproducible).toBe(false);
  });

  /**
   * Afterward 2. "What depends on the unreproducible part?" — the downstream
   * results, which now carry a provenance caveat rather than a clean bill.
   */
  test("Afterward 2: what rests on the unverifiable part is enumerable", async () => {
    await aCachedConstructionWithOneUnrecordedPart();

    const dependents = await (await afterwards()).whatDependsOn(CONTROL);
    expect(dependents.claims.map((c) => c.asserts)).toEqual([PROPOSITION]);
    expect(dependents.enquiries.map((e) => e.pursuing)).toEqual([
      "does the accelerated path match the reference?",
    ]);
  });

  /**
   * Afterward 3, and the one the scenario exists for. "Is the regenerated version the same
   * artefact?" — no.
   */
  test("Afterward 3: a regenerated part does not inherit the original's dependents", async () => {
    const { enquiry, parts } = await aCachedConstructionWithOneUnrecordedPart();
    const original = parts[3]!;

    // The researcher regenerates the control by inferring the old algorithm.
    // Same name, because it is a regeneration of that part -- and a different
    // thing, because nobody knows the original was made this way.
    const { observations: regenerated } = await session.recordObservations({
      enquiry,
      name: CONTROL,
      finding: "randomised control series, regenerated from an inferred algorithm",
      contentHash: "sha256:regenerated",
    });
    const { analysis: downstream } = await recordAnalysis(session, {
      enquiry,
      method: "stage2-construction, rebuilt",
      from: [regenerated],
      concludes: [
        {
          proposition: "the rebuild agrees with the cache",
          finding: "agreement within 1e-6",
        },
      ],
    });

    const reader = await afterwards();
    // The historical part still carries what always rested on it, and nothing
    // that rests on the rebuild.
    const historical = await reader.whatDependsOn(original);
    expect(historical.claims.map((c) => c.asserts)).toEqual([PROPOSITION]);

    // And the regenerated part carries only its own.
    const rebuilt = await reader.whatDependsOn(regenerated);
    expect(rebuilt.claims.map((c) => c.asserts)).toEqual(["the rebuild agrees with the cache"]);
    expect(downstream).toBeDefined();
  });

  /**
   * Afterward 4. "What would resolve this?" — an open question, still open.
   * A regeneration is a workaround, not an answer, and the record must not let
   * it close the question by side effect.
   */
  test("Afterward 4: regenerating does not close the question of what made the original", async () => {
    const { enquiry } = await aCachedConstructionWithOneUnrecordedPart();
    const { enquiry: unresolved } = await session.openEnquiry(
      "what generated the historical random control?",
    );

    await session.recordObservations({
      enquiry,
      name: CONTROL,
      finding: "randomised control series, regenerated from an inferred algorithm",
      contentHash: "sha256:regenerated",
    });

    // `untested`, not `unresolved` -- nobody has worked on it. That is row I's
    // distinction and the survey is right to make it; the requirement here is
    // only that regenerating the part does not move the question out of the
    // open set by side effect.
    const known = await (await afterwards()).whatIsKnown();
    expect(known.untested.map((q) => q.asks)).toContain(
      "what generated the historical random control?",
    );
    expect(known.established.map((q) => q.asks)).not.toContain(
      "what generated the historical random control?",
    );
    expect(unresolved).toBeDefined();
  });

  /**
   * The refusal, stated on its own. Asking by name is fine while a name identifies one thing;
   * once a part has been regenerated it does not, and answering about the union is how inferred
   * provenance would inherit the original's standing.
   */
  test("asking by name is refused once two artefacts share it", async () => {
    const { enquiry } = await aCachedConstructionWithOneUnrecordedPart();

    // Before regenerating, the name is unambiguous and the question answerable.
    expect((await session.whatDependsOn(CONTROL)).claims.map((c) => c.asserts)).toEqual([
      PROPOSITION,
    ]);

    await session.recordObservations({
      enquiry,
      name: CONTROL,
      finding: "randomised control series, regenerated from an inferred algorithm",
      contentHash: "sha256:regenerated",
    });

    await expect((await afterwards()).whatDependsOn(CONTROL)).rejects.toThrow(
      /2 artefacts are named/,
    );
  });

  /**
   * External review. A part the caller simply did not rebuild is not a part that came back
   * different.
   */
  test("a part that was not rebuilt is not a part that differs", async () => {
    const { parts, analysis } = await aCachedConstructionWithOneUnrecordedPart();

    // Only two of the three hashed parts were rebuilt.
    const report = await (await afterwards()).reproducibilityOf(analysis, [
      { part: parts[0]!, hash: "sha256:aaa" },
      { part: parts[1]!, hash: "sha256:bbb" },
    ]);

    expect(report.exact.map((p) => p.name).sort()).toEqual(["splits", "weights"]);
    expect(report.differing.map((p) => p.name)).toEqual([]);
    expect(report.notRebuilt.map((p) => p.name)).toEqual(["priors"]);
    expect(report.unverifiable.map((p) => p.name)).toEqual([CONTROL]);
    expect(report.reproducible).toBe(false);
  });

  /**
   * External review, and the sharper half of it. A part that really did come
   * back different must still say so — the fix above must not turn every
   * mismatch into "you did not rebuild it".
   */
  test("a part that was rebuilt and differs still reports as differing", async () => {
    const { parts, analysis } = await aCachedConstructionWithOneUnrecordedPart();

    const report = await (await afterwards()).reproducibilityOf(analysis, [
      { part: parts[0]!, hash: "sha256:aaa" },
      { part: parts[1]!, hash: "sha256:DIFFERENT" },
      { part: parts[2]!, hash: "sha256:ccc" },
    ]);

    expect(report.exact.map((p) => p.name).sort()).toEqual(["priors", "weights"]);
    expect(report.differing.map((p) => p.name)).toEqual(["splits"]);
    expect(report.notRebuilt.map((p) => p.name)).toEqual([]);
  });

  /**
   * A regeneration needs no artefact lineage to record its direction, because the direction is
   * not durable in the first place: the regenerated part is created with an ordinary
   * `recordObservations()` that names nothing historical, and `reproducibilityOf()` is a read
   * that takes the historical parts as arguments and persists nothing.
   */
  test("BOUNDARY: nothing durable says what a regeneration was reconstructing", async () => {
    const { enquiry, parts } = await aCachedConstructionWithOneUnrecordedPart();
    const original = parts[3]!;

    const { observations: regenerated } = await session.recordObservations({
      enquiry,
      name: CONTROL,
      finding: "randomised control series, regenerated from an inferred algorithm",
      contentHash: "sha256:regenerated",
    });

    const reader = await afterwards();
    // What S-9 did establish, and all this test claims to pin:
    expect(regenerated).not.toBe(original);
    expect((await reader.whatDependsOn(regenerated)).claims).toEqual([]);
    expect((await reader.whatDependsOn(original)).claims.map((c) => c.asserts)).toEqual([
      PROPOSITION,
    ]);
  });
});
