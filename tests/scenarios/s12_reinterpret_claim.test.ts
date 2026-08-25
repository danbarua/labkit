/**
 * S-12 — "The numbers are right; the sentence about them is wrong."
 * docs/project-journal/008_user_story_mining.md
 *
 * The first probe of what a `Claim` actually is. Everything underneath stays
 * valid — computations, artefacts, observations, findings — and only the
 * interpretation changes. That is the one thing `replaceAnalysis` cannot
 * express, because its whole mechanism is invalidating the output.
 *
 * Deliberately not pre-decided: whether claims supersede claims, whether a
 * claim is a proposition or an occurrence of asserting one, and whether the
 * review that caused a narrowing needs a relationship of its own. Predictions
 * for each were recorded in PJ-008 §3 before this file existed.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { claimNamed } from "../helpers/claims";
import { ref } from "../../src/domain/report";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

const FIXED_NOW = "2026-08-19T10:00:00.000Z";
const clock: Clock = { now: () => FIXED_NOW };

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });
beforeEach(async () => {
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events });
});
afterEach(async () => { await scenario.end(); });

const PREFERENTIAL = "the encoding preferentially preserves discriminative signal";
const NARROWER = "discriminative signal attenuates less than non-discriminative signal";

/**
 * One proposition, asserted twice from two independent runs.
 *
 * The duplication is the point, not incidental setup: an interpretation that
 * two analyses arrived at is the normal case, and withdrawing it has to
 * withdraw all of it.
 */
async function assertedTwice() {
  const enquiry = await session.openEnquiry("does the encoding preferentially preserve discriminative signal?");

  const firstReadings = await session.recordObservations({
    enquiry,
    name: "attenuation readings, cohort A",
    finding: "signal amplitude before and after encoding, both signal types, cohort A",
  });
  const { analysis: first, claims: firstClaims } = await session.recordAnalysis({
    enquiry,
    method: "attenuation-ratio",
    from: [firstReadings],
    concludes: [{ proposition: PREFERENTIAL, finding: "discriminative amplitude ratio 0.81, non-discriminative 0.44" }],
  });

  const secondReadings = await session.recordObservations({
    enquiry,
    name: "attenuation readings, cohort B",
    finding: "signal amplitude before and after encoding, both signal types, cohort B",
  });
  const { analysis: second, claims: secondClaims } = await session.recordAnalysis({
    enquiry,
    method: "attenuation-ratio",
    from: [secondReadings],
    concludes: [{ proposition: PREFERENTIAL, finding: "discriminative amplitude ratio 0.79, non-discriminative 0.41" }],
  });

  return { enquiry, first, firstClaims, second, secondClaims, firstReadings, secondReadings };
}

describe("S-12 — the numbers are right; the sentence about them is wrong", () => {
  test("the conversation runs end to end through research verbs alone", async () => {
    const programme = await assertedTwice();

    // Reviewer:   these numbers don't support the sentence you've written.
    // Researcher: are the calculations wrong?
    // Reviewer:   no. The interpretation is backwards -- both signal types
    //             attenuate, and the discriminative one attenuates more.
    const report = await session.reinterpret({
      of: claimOf(programme.firstClaims, PREFERENTIAL),
      as: NARROWER,
      because: "both types attenuate; the ratio is a difference in degree, not preservation",
    });

    // LabKit:     evidence stands; the claim is superseded by a narrower
    //             interpretation.
    expect(report.nowClaims.asserts).toBe(NARROWER);
    // Both records that asserted the old reading, by handle. The report said
    // the sentence and nothing else, so a caller could not name either claim
    // this withdrew -- and a single handle here would have picked between two
    // records arbitrarily, which is the whole of PJ-030.
    expect(report.previously.map((c) => c.asserts)).toEqual([PREFERENTIAL, PREFERENTIAL]);
    expect(report.previously.map((c) => c.claim).sort()).toEqual(
      [
        claimOf(programme.firstClaims, PREFERENTIAL),
        claimOf(programme.secondClaims, PREFERENTIAL),
      ].sort(),
    );
    expect(report.requiresRecomputation).toBe(false);
    expect(report.evidenceStanding.map((f) => f.states).sort()).toEqual([
      "discriminative amplitude ratio 0.79, non-discriminative 0.41",
      "discriminative amplitude ratio 0.81, non-discriminative 0.44",
    ]);
    void programme;
  });

  /**
   * Afterward 1 — what does the record claim now, and what did it claim before?
   *
   * The original is still readable and reads as withdrawn. This is the
   * assertion that the duplicate-claim case exists to break: withdrawing an
   * interpretation two analyses reached must withdraw all of it, not the one
   * node that happened to be found first.
   */
  test("the withdrawn interpretation stops standing, in full", async () => {
    const programme = await assertedTwice();
    const beforehand = await session.whySupported(claimOf(programme.firstClaims, PREFERENTIAL));
    expect(beforehand.supported).toBe(true);
    expect(beforehand.support).toHaveLength(2);

    const narrowing = await session.reinterpret({
      of: claimOf(programme.firstClaims, PREFERENTIAL),
      as: NARROWER,
      because: "both types attenuate",
    });

    const later = new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
    const withdrawn = await later.whySupported(claimOf(programme.firstClaims, PREFERENTIAL));
    expect(withdrawn.supported).toBe(false);

    // Withdrawn is its own state. Nobody asserts the sentence any more, and
    // that is not the same as evidence bearing against it -- no measurement
    // contradicted anything here, the reading of it changed.
    expect(withdrawn.withdrawn).toBe(true);
    expect(withdrawn.challenged).toBe(false);
    // The same record the verb said it minted, not merely something worded
    // like it. Matching on the sentence would not have noticed either way.
    expect(withdrawn.replacedBy?.claim).toEqual(narrowing.nowClaims.claim);
    expect(withdrawn.replacedBy?.asserts).toBe(NARROWER);
    // Its findings are still there, and still say what they said.
    expect(withdrawn.support).toHaveLength(2);

    // Still readable, and readable as history rather than as something that
    // never happened.
    // Asked with the handle the verb returned -- no round trip back through
    // the wording to re-find the record this very call created.
    const history = await later.interpretationHistory(narrowing.nowClaims.claim);
    expect(history.originally.map((c) => c.asserts)).toEqual([PREFERENTIAL, PREFERENTIAL]);
    expect(history.nowClaims.asserts).toBe(NARROWER);
    expect(history.revisions).toHaveLength(1);
    expect(history.revisions[0]!.reason).toContain("both types attenuate");
  });

  /**
   * Afterward 2 — which evidence remains valid, and does this require
   * recomputation?
   *
   * No. Nothing about the computations or artefacts changed, and the narrower
   * interpretation rests on exactly the findings the original rested on.
   */
  test("every finding survives, and nothing was invalidated", async () => {
    const programme = await assertedTwice();
    await session.reinterpret({
      of: claimOf(programme.firstClaims, PREFERENTIAL),
      as: NARROWER,
      because: "both types attenuate",
    });

    const later = new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
    const now = await later.whySupported(await claimNamed(later, NARROWER));
    expect(now.supported).toBe(true);
    expect(now.support.map((s) => s.finding).sort()).toEqual([
      "discriminative amplitude ratio 0.79, non-discriminative 0.41",
      "discriminative amplitude ratio 0.81, non-discriminative 0.44",
    ]);

    // The observations underneath are untouched -- this is what separates a
    // reinterpretation from S-11's replacement, where the output was
    // invalidated and the findings became historical.
    expect(now.restingOn.map((a) => a.name).sort()).toEqual([
      "attenuation readings, cohort A",
      "attenuation readings, cohort B",
    ]);
    expect(now.superseded).toEqual([]);

    // And the withdrawn interpretation's findings are not reported as
    // withdrawn evidence: nothing about them changed.
    const withdrawn = await later.whySupported(claimOf(programme.firstClaims, PREFERENTIAL));
    expect(withdrawn.superseded).toEqual([]);
    void programme;
  });

  /**
   * Afterward 3 — does anything downstream of the original claim need
   * revisiting?
   *
   * Enumerable, and a different answer from S-11's: there the inputs became
   * invalid, here they did not. What is at risk is anything that was decided
   * on the strength of the sentence, not anything computed from the numbers.
   */
  test("a question closed on the old interpretation is surfaced as resting on it", async () => {
    const programme = await assertedTwice();
    await session.closeEnquiry({
      enquiry: programme.enquiry,
      answeredBy: claimOf(programme.firstClaims, PREFERENTIAL),
    });

    const report = await session.reinterpret({
      of: claimOf(programme.firstClaims, PREFERENTIAL),
      as: NARROWER,
      because: "both types attenuate",
    });

    expect(report.restingOnTheOldReading.map((q) => q.asks)).toEqual([
      "does the encoding preferentially preserve discriminative signal?",
    ]);

    const later = new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
    const history = await later.interpretationHistory(await claimNamed(later, NARROWER));
    expect(history.revisions[0]!.restingOnTheOldReading.map((q) => q.asks)).toEqual([
      "does the encoding preferentially preserve discriminative signal?",
    ]);
  });

  /**
   * Afterward 4 — a second narrowing, ordered against the first.
   *
   * Same probe as S-7's: asked after both happened, from a session with an
   * empty event log, with no timestamp on anything.
   */
  test("successive reinterpretations are ordered without timestamps or an event log", async () => {
    const programme = await assertedTwice();
    const EVEN_NARROWER = "discriminative signal attenuates less in cohort A only";

    await session.reinterpret({ of: claimOf(programme.firstClaims, PREFERENTIAL), as: NARROWER, because: "both types attenuate" });
    await session.reinterpret({ of: await claimNamed(session, NARROWER), as: EVEN_NARROWER, because: "the cohort B ratio does not separate" });

    const later = new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
    expect((await later.events.all())).toHaveLength(0);

    const history = await later.interpretationHistory(await claimNamed(later, EVEN_NARROWER));
    expect(history.originally.map((c) => c.asserts)).toEqual([PREFERENTIAL, PREFERENTIAL]);
    expect(history.nowClaims.asserts).toBe(EVEN_NARROWER);
    expect(history.revisions.map((r) => r.nowClaims.asserts)).toEqual([NARROWER, EVEN_NARROWER]);
    // Plural per step, and the counts differ: the first reinterpretation
    // withdrew the two claims that had reached the same reading, the second
    // withdrew the one narrower claim that replaced them.
    expect(history.revisions.map((r) => r.previously.map((c) => c.asserts))).toEqual([
      [PREFERENTIAL, PREFERENTIAL],
      [NARROWER],
    ]);
  });

  /**
   * A claim can be challenged without its source evidence becoming invalid.
   *
   * This is the third thing S-12 has to keep apart: challenged is about the
   * proposition, invalidated is about the analysis output. S-4 made challenge
   * real; here it has to coexist with evidence that is entirely fine.
   */
  test("challenging a claim leaves its evidence standing", async () => {
    const programme = await assertedTwice();

    const contrary = await session.recordObservations({
      enquiry: programme.enquiry,
      name: "attenuation readings, cohort C",
      finding: "signal amplitude before and after encoding, cohort C",
    });
    await session.recordAnalysis({
      enquiry: programme.enquiry,
      method: "attenuation-ratio",
      from: [contrary],
      concludes: [{
        proposition: PREFERENTIAL,
        finding: "cohort C shows no separation between signal types",
        bearing: "challenges",
      }],
    });

    const later = new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
    const standing = await later.whySupported(claimOf(programme.firstClaims, PREFERENTIAL));
    expect(standing.challenged).toBe(true);
    // Challenged, but nobody withdrew it -- the two states must not collapse.
    expect(standing.withdrawn).toBe(false);
    expect(standing.supported).toBe(true);
    expect(standing.against).toHaveLength(1);
    // Challenged, but its own evidence is untouched -- two supporting findings
    // still stand, and nothing is superseded.
    expect(standing.support).toHaveLength(2);
    expect(standing.superseded).toEqual([]);
  });

  /**
   * A withdrawn interpretation cannot be re-asserted by side effect.
   *
   * The ordinary case, not an exotic one: a colleague who has not read the
   * review records an analysis concluding the sentence again. Nothing about
   * that reverses the withdrawal, and if a fresh claim node quietly restored
   * it, the record would un-retract itself while the reviewer's objection
   * still stood. Re-opening a withdrawn reading is a deliberate act and LabKit
   * has no verb for it yet, so it refuses rather than doing it accidentally.
   */
  test("recording the withdrawn sentence again does not quietly restore it", async () => {
    const programme = await assertedTwice();
    await session.reinterpret({ of: claimOf(programme.firstClaims, PREFERENTIAL), as: NARROWER, because: "both types attenuate" });

    const moreReadings = await session.recordObservations({
      enquiry: programme.enquiry,
      name: "attenuation readings, cohort D",
      finding: "signal amplitude before and after encoding, cohort D",
    });
    await expect(
      session.recordAnalysis({
        enquiry: programme.enquiry,
        method: "attenuation-ratio",
        from: [moreReadings],
        concludes: [{ proposition: PREFERENTIAL, finding: "discriminative amplitude ratio 0.80, non-discriminative 0.43" }],
      }),
    ).rejects.toThrow(/"the encoding preferentially preserves discriminative signal" was withdrawn/);

    const later = new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
    const still = await later.whySupported(claimOf(programme.firstClaims, PREFERENTIAL));
    expect(still.withdrawn).toBe(true);
    expect(still.replacedBy?.asserts).toBe(NARROWER);
    expect(still.supported).toBe(false);
  });

  /** Reinterpreting something nobody claimed writes nothing. */
  test("reinterpreting a proposition that is not on the record writes nothing", async () => {
    const programme = await assertedTwice();
    const before = await session.whySupported(claimOf(programme.firstClaims, PREFERENTIAL));

    await expect(
      session.reinterpret({
        of: ref("claim", "CLM_9999"),
        as: "some narrower version of it",
        because: "it should not get this far",
      }),
    ).rejects.toThrow(/no claim CLM_9999/);

    const later = new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
    expect(await later.whySupported(claimOf(programme.firstClaims, PREFERENTIAL))).toEqual(before);
  });
});
