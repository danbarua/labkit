/**
 * S-9 — "The artefact survived; its provenance didn't."
 * docs/project-journal/008_user_story_mining.md, §2 and §3 rows F, P
 *
 * A cached construction that can be mostly, but not exactly, rebuilt. Three of
 * its components come back byte-identical; the historical random control does
 * not, because whatever generated it was never written down.
 *
 * The researcher then asks for the thing the record must refuse to let happen
 * quietly: regenerate the missing part and carry on. LabKit may do it, but the
 * result is a *different* artefact with inferred provenance, and the question
 * of what actually produced the original stays open.
 *
 * Row F predicts an Artefact→Artefact edge is needed. The predictions for this
 * build say otherwise — that the damage is identity, not lineage. Either way
 * the test is the same: show the wrong answer first.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

let tick = 0;
const clock: Clock = { now: () => new Date(Date.UTC(2026, 7, 20, 9, tick++)).toISOString() };

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });
beforeEach(async () => {
  tick = 0;
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events });
});
afterEach(async () => { await scenario.end(); });

/** A second reader over the same graph — see tests/helpers/scenario.ts. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

const CONTROL = "historical random control";
const PROPOSITION = "the accelerated path matches the reference";

/**
 * Researcher: "There's a cached construction from the old study. Four parts
 *  went into it, and a result rests on it."
 *
 * Three parts were recorded with a hash. The control was not — nobody wrote
 * down what generated it, which is the whole situation.
 */
async function aCachedConstructionWithOneUnrecordedPart() {
  const enquiry = await session.openEnquiry("does the accelerated path match the reference?");
  const parts = [
    await session.recordObservations({ enquiry, name: "weights", finding: "layer weights", contentHash: "sha256:aaa" }),
    await session.recordObservations({ enquiry, name: "splits", finding: "fold assignment", contentHash: "sha256:bbb" }),
    await session.recordObservations({ enquiry, name: "priors", finding: "prior draws", contentHash: "sha256:ccc" }),
    await session.recordObservations({ enquiry, name: CONTROL, finding: "randomised control series" }),
  ];
  const { analysis: analysis, claims: analysisClaims } = await session.recordAnalysis({
    enquiry,
    method: "stage2-construction",
    from: parts,
    concludes: [{ proposition: PROPOSITION, finding: "agreement within 1e-6" }],
  });
  return { enquiry, parts, analysis, analysisClaims };
}

describe("S-9: the artefact survived; its provenance didn't", () => {
  /**
   * Afterward 1. "Which parts of this artefact are reproducible?" — three
   * named exactly, one not. A part with no recorded hash is not a part that
   * differs; it is a part nobody can check, and the two must not read alike.
   * Row I's distinction, asked of an artefact.
   */
  test("Afterward 1: three parts reproduce exactly, one cannot be checked at all", async () => {
    const { parts, analysis, analysisClaims } = await aCachedConstructionWithOneUnrecordedPart();

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
    expect(dependents.enquiries.map((e) => e.pursuing)).toEqual(["does the accelerated path match the reference?"]);
  });

  /**
   * Afterward 3, and the one the scenario exists for. "Is the regenerated
   * version the same artefact?" — no.
   *
   * Regenerating produces something that plausibly carries the same name. If
   * the record identifies artefacts by that name, the regenerated part
   * inherits everything the historical one carried: its dependents, and with
   * them its standing. That is precisely what the story says must not happen
   * quietly.
   */
  test("Afterward 3: a regenerated part does not inherit the original's dependents", async () => {
    const { enquiry, parts } = await aCachedConstructionWithOneUnrecordedPart();
    const original = parts[3]!;

    // The researcher regenerates the control by inferring the old algorithm.
    // Same name, because it is a regeneration of that part -- and a different
    // thing, because nobody knows the original was made this way.
    const regenerated = await session.recordObservations({
      enquiry,
      name: CONTROL,
      finding: "randomised control series, regenerated from an inferred algorithm",
      contentHash: "sha256:regenerated",
    });
    const { analysis: downstream, claims: downstreamClaims } = await session.recordAnalysis({
      enquiry,
      method: "stage2-construction, rebuilt",
      from: [regenerated],
      concludes: [{ proposition: "the rebuild agrees with the cache", finding: "agreement within 1e-6" }],
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
    const unresolved = await session.openEnquiry("what generated the historical random control?");

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
    expect(known.untested.map((q) => q.asks)).toContain("what generated the historical random control?");
    expect(known.established.map((q) => q.asks)).not.toContain("what generated the historical random control?");
    expect(unresolved).toBeDefined();
  });

  /**
   * The refusal, stated on its own. Asking by name is fine while a name
   * identifies one thing; once a part has been regenerated it does not, and
   * answering about the union is how inferred provenance would inherit the
   * original's standing.
   *
   * S-5's rule, reaching artefacts for the first time: a command that declines
   * beats an answer about something the caller did not mean.
   */
  test("asking by name is refused once two artefacts share it", async () => {
    const { enquiry } = await aCachedConstructionWithOneUnrecordedPart();

    // Before regenerating, the name is unambiguous and the question answerable.
    expect((await session.whatDependsOn(CONTROL)).claims.map((c) => c.asserts)).toEqual([PROPOSITION]);

    await session.recordObservations({
      enquiry,
      name: CONTROL,
      finding: "randomised control series, regenerated from an inferred algorithm",
      contentHash: "sha256:regenerated",
    });

    await expect((await afterwards()).whatDependsOn(CONTROL)).rejects.toThrow(/2 artefacts are named/);
  });

  /**
   * External review. A part the caller simply did not rebuild is not a part
   * that came back different.
   *
   * The first cut reported it `differing`, because the offered map had no entry
   * and "no entry" compared unequal to the recorded hash — claiming evidence of
   * inequality where there was only absence of a comparison. That is the exact
   * conflation this report was written to avoid, one branch away from the
   * branch that avoids it.
   *
   * Three reasons a part cannot be compared, and they are not the same: the
   * record never had a hash (`unverifiable`), or this attempt did not rebuild
   * it (`notRebuilt`). The first is a permanent property of the record; the
   * second is a property of this attempt and says nothing about the artefact.
   */
  test("a part that was not rebuilt is not a part that differs", async () => {
    const { parts, analysis, analysisClaims } = await aCachedConstructionWithOneUnrecordedPart();

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
    const { parts, analysis, analysisClaims } = await aCachedConstructionWithOneUnrecordedPart();

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
   * External review, and the correction to this build's own conclusion.
   *
   * PJ-021 first claimed that a regeneration needs no artefact lineage because
   * "direction is in the act". It is not. The regenerated part is created with
   * an ordinary `recordObservations()` that names nothing historical, and
   * `reproducibilityOf()` is a read that takes the historical parts as
   * arguments and persists nothing. So the direction lives in the caller's
   * variables and in prose, not in durable state.
   *
   * What this test pins is the half that IS demonstrable: the two artefacts
   * have distinct identity and distinct dependants.
   *
   * What it deliberately does **not** try to pin is the absence itself. An
   * earlier version ended with `expect(Object.keys(regenerated)).toEqual([...])`
   * and claimed that assertion was "what changes when lineage is earned". It
   * was not — an `Artefact -> Artefact` edge could be added tomorrow and an
   * opaque `ObservationsRef` should still be `{ kind, id }`. The assertion
   * pinned the public handle shape and nothing about lineage, so it was a
   * confident claim about coverage that the test did not have. Removed.
   *
   * The honest position, and the reason row F is `open` rather than refuted:
   * "no existing domain answer reconstructs their relationship" is an
   * **absence of capability**. Under PJ-011 §5 that earns nothing, and trying
   * to assert it strongly would mean inventing the very query the rule says
   * not to invent. The limitation lives in PJ-021 and the ledger, where a
   * limitation belongs; the executable part of this scenario asserts only what
   * it can actually observe.
   */
  test("BOUNDARY: nothing durable says what a regeneration was reconstructing", async () => {
    const { enquiry, parts } = await aCachedConstructionWithOneUnrecordedPart();
    const original = parts[3]!;

    const regenerated = await session.recordObservations({
      enquiry,
      name: CONTROL,
      finding: "randomised control series, regenerated from an inferred algorithm",
      contentHash: "sha256:regenerated",
    });

    const reader = await afterwards();
    // What S-9 did establish, and all this test claims to pin:
    expect(regenerated.id).not.toBe(original.id);
    expect((await reader.whatDependsOn(regenerated)).claims).toEqual([]);
    expect((await reader.whatDependsOn(original)).claims.map((c) => c.asserts)).toEqual([PROPOSITION]);
  });
});
