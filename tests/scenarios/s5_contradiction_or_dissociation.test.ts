/**
 * S-5 — "Contradiction or dissociation?"
 * docs/project-journal/008_user_story_mining.md
 *
 * The first direct test of claim scope, and the first scenario built around
 * two claims worded **identically** on purpose. Every read verb in the domain
 * layer currently addresses a claim by its proposition text; S-5 is where that
 * stops being adequate, because the whole question is whether two sentences
 * that look the same are the same claim.
 *
 * Deliberately not pre-decided: whether scope needs a property on the claim,
 * whether a claim is a proposition or an occurrence of asserting one, and what
 * handle a caller should use to name one claim rather than another.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, claimOf } from "../helpers/claims";
import { ref } from "../../src/domain/report";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

const FIXED_NOW = "2026-08-19T10:00:00.000Z";
const clock: Clock = { now: () => FIXED_NOW };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events });
});
afterEach(async () => {
  await scenario.end();
});

/**
 * The same sentence, meant two different ways. This wording is deliberate: if
 * anything in LabKit resolves a claim by matching text, this is what breaks
 * it.
 */
const IMMATERIAL = "the graph construction is immaterial";

const INTERNAL = "does the graph construction matter for internal mapping strength?";
const EXTERNAL = "does the graph construction matter for external classification utility?";

/**
 * Two stages of one programme that appear to disagree.
 *
 * The earlier stage measured internal mapping strength and found the graph
 * choice made no difference. The later stage measured external classification
 * utility and ranked the constructions. Same sentence, different endpoints.
 */
async function twoStages() {
  const { question: internal } = await session.pose({ question: INTERNAL });
  const { enquiry: internalWork } = await session.pursue({
    question: internal,
    approach: "internal mapping-strength comparison",
  });
  const { observations: internalReadings } = await session.recordObservations({
    enquiry: internalWork,
    name: "mapping-strength readings across constructions",
    finding: "mapping strength measured for five graph constructions",
  });
  const { analysis: earlier, claims: earlierClaims } = await recordAnalysis(session, {
    enquiry: internalWork,
    method: "mapping-strength-comparison",
    from: [internalReadings],
    concludes: [
      {
        proposition: IMMATERIAL,
        finding: "all five constructions within 0.02 of each other on mapping strength",
      },
    ],
  });

  const { question: external } = await session.pose({ question: EXTERNAL });
  const { enquiry: externalWork } = await session.pursue({
    question: external,
    approach: "downstream classification comparison",
  });
  const { observations: externalReadings } = await session.recordObservations({
    enquiry: externalWork,
    name: "downstream classification readings",
    finding: "held-out classification accuracy measured for the same five constructions",
  });
  const { analysis: later, claims: laterClaims } = await recordAnalysis(session, {
    enquiry: externalWork,
    method: "downstream-classification",
    from: [externalReadings],
    concludes: [
      {
        proposition: IMMATERIAL,
        finding: "constructions separate by 11 points of held-out accuracy",
        bearing: "challenges",
      },
    ],
  });

  return {
    internal,
    internalWork,
    earlier,
    earlierClaims,
    external,
    externalWork,
    later,
    laterClaims,
  };
}

describe("S-5 — contradiction or dissociation?", () => {
  test("the conversation runs end to end through research verbs alone", async () => {
    const programme = await twoStages();

    // Researcher: didn't the earlier stage prove the graph choice doesn't
    //             matter? Why does this one rank them?
    const verdict = await session.doTheseConflict(
      claimOf(programme.earlierClaims, IMMATERIAL),
      claimOf(programme.laterClaims, IMMATERIAL),
    );

    // LabKit:     the earlier stage tested internal mapping strength; this one
    //             tested external classification utility. Those are distinct
    //             claims.
    expect(verdict.sides.map((s) => s.asks)).toEqual([INTERNAL, EXTERNAL]);

    // Researcher: so this is a dissociation, not a contradiction.
    // LabKit:     correct. Support for equivalence on one endpoint does not
    //             imply equivalence on another.
    expect(verdict.conflict).toBe(false);
    expect(verdict.relation).toBe("dissociation");
    expect(verdict.differsBy).toBe("scope");
  });

  /**
   * Afterward 1 — which question does each claim answer, and what bears on it?
   *
   * Derived from what each claim is attached to. Nothing in this test compares
   * one sentence to another, and the two sentences are identical anyway.
   */
  test("each claim carries its own question and its own evidence", async () => {
    const programme = await twoStages();

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const verdict = await later.doTheseConflict(
      claimOf(programme.earlierClaims, IMMATERIAL),
      claimOf(programme.laterClaims, IMMATERIAL),
    );

    const [first, second] = verdict.sides;
    expect(first!.proposition).toBe(IMMATERIAL);
    expect(second!.proposition).toBe(IMMATERIAL);
    expect(first!.asks).toBe(INTERNAL);
    expect(second!.asks).toBe(EXTERNAL);

    expect(first!.supportedBy.map((f) => f.states)).toEqual([
      "all five constructions within 0.02 of each other on mapping strength",
    ]);
    expect(first!.challengedBy).toEqual([]);
    expect(second!.supportedBy).toEqual([]);
    expect(second!.challengedBy.map((f) => f.states)).toEqual([
      "constructions separate by 11 points of held-out accuracy",
    ]);
  });

  /**
   * Afterward 2 — what would a genuine contradiction look like here?
   *
   * Two claims of the same scope with opposing support. Built, so the verdict
   * is discriminating rather than always saying "dissociation".
   */
  test("two opposing findings within one question are a contradiction", async () => {
    const programme = await twoStages();

    const { observations: rerun } = await session.recordObservations({
      enquiry: programme.internalWork,
      name: "mapping-strength readings, wider construction set",
      finding: "mapping strength measured for twelve graph constructions",
    });
    const { claims: dissentingClaims } = await recordAnalysis(session, {
      enquiry: programme.internalWork,
      method: "mapping-strength-comparison",
      from: [rerun],
      concludes: [
        {
          proposition: IMMATERIAL,
          finding: "two of the twelve constructions fall 0.3 below the rest on mapping strength",
          bearing: "challenges",
        },
      ],
    });

    const verdict = await session.doTheseConflict(
      claimOf(programme.earlierClaims, IMMATERIAL),
      claimOf(dissentingClaims, IMMATERIAL),
    );

    expect(verdict.conflict).toBe(true);
    expect(verdict.relation).toBe("contradiction");
    expect(verdict.differsBy).toBeNull();
    expect(verdict.sides.map((s) => s.asks)).toEqual([INTERNAL, INTERNAL]);

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const durable = await later.doTheseConflict(
      claimOf(programme.earlierClaims, IMMATERIAL),
      claimOf(dissentingClaims, IMMATERIAL),
    );
    expect(durable.relation).toBe("contradiction");
  });

  /**
   * Afterward 3 — does revising or withdrawing one interpretation affect the
   * other?
   *
   * It must not. This is the sharpest consequence of a revision path meeting
   * two identically worded claims: withdrawing one reading in one line of
   * work, and finding an unrelated line of work silently retracted, with no
   * decision anywhere saying so.
   */
  test("withdrawing one reading leaves the identically worded one alone", async () => {
    const programme = await twoStages();

    await session.reinterpret({
      of: claimOf(programme.earlierClaims, IMMATERIAL),
      as: "graph construction does not affect mapping strength within 0.02",
      because: "immaterial overstates it; the measurement was of mapping strength alone",
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });

    const withdrawn = await later.whySupported(claimOf(programme.earlierClaims, IMMATERIAL));
    expect(withdrawn.withdrawn).toBe(true);

    // The other stage's claim is untouched: same words, different question,
    // nobody withdrew it.
    const untouched = await later.whySupported(claimOf(programme.laterClaims, IMMATERIAL));
    expect(untouched.withdrawn).toBe(false);
    expect(untouched.challenged).toBe(true);
    expect(untouched.against).toHaveLength(1);
  });

  /**
   * Nothing about another line of enquiry's closure rests on this reading.
   *
   * The sharpest remaining leak, because it is invisible when only one scope
   * ever closes anything: a question closed elsewhere on an identically worded
   * claim would be reported as depending on a reading nobody there held.
   */
  test("a question closed in another line of enquiry is not reported as resting on this reading", async () => {
    const programme = await twoStages();

    // A third line of work asserting the same sentence, and settling on it.
    const { question: alsoInternal } = await session.pose({
      question: "does the graph construction matter for reconstruction error?",
    });
    const { enquiry: work } = await session.pursue({
      question: alsoInternal,
      approach: "reconstruction-error comparison",
    });
    const { observations: readings } = await session.recordObservations({
      enquiry: work,
      name: "reconstruction-error readings",
      finding: "reconstruction error measured for the same five constructions",
    });
    const { claims: settledClaims } = await recordAnalysis(session, {
      enquiry: work,
      method: "reconstruction-error-comparison",
      from: [readings],
      concludes: [
        {
          proposition: IMMATERIAL,
          finding: "reconstruction error within 0.01 across constructions",
        },
      ],
    });
    await session.closeEnquiry({
      enquiry: work,
      answeredBy: claimOf(settledClaims, IMMATERIAL),
    });

    const report = await session.reinterpret({
      of: claimOf(programme.earlierClaims, IMMATERIAL),
      as: "graph construction does not affect mapping strength within 0.02",
      because: "immaterial overstates it",
    });

    // The reconstruction-error question was settled on its own reading, not
    // on this one.
    expect(report.restingOnTheOldReading).toEqual([]);

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const settledStill = await later.whySupported(claimOf(settledClaims, IMMATERIAL));
    expect(settledStill.withdrawn).toBe(false);
    expect(settledStill.verdict).toBe("supported");
  });

  /**
   * A sentence withdrawn in one line of enquiry does not block work in
   * another.
   *
   * A guard refuses to re-assert a withdrawn proposition. Unscoped, that
   * guard would have the defect this scenario is about, in the opposite
   * direction: it would block legitimate work.
   */
  test("withdrawing a sentence here does not block concluding it elsewhere", async () => {
    const programme = await twoStages();
    await session.reinterpret({
      of: claimOf(programme.earlierClaims, IMMATERIAL),
      as: "graph construction does not affect mapping strength within 0.02",
      because: "immaterial overstates it",
    });

    const { question: elsewhere } = await session.pose({
      question: "does the graph construction matter for reconstruction error?",
    });
    const { enquiry: work } = await session.pursue({
      question: elsewhere,
      approach: "reconstruction-error comparison",
    });
    const { observations: readings } = await session.recordObservations({
      enquiry: work,
      name: "reconstruction-error readings",
      finding: "reconstruction error measured across constructions",
    });
    const { claims: freshClaims } = await recordAnalysis(session, {
      enquiry: work,
      method: "reconstruction-error-comparison",
      from: [readings],
      concludes: [
        {
          proposition: IMMATERIAL,
          finding: "reconstruction error within 0.01 across constructions",
        },
      ],
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const here = await later.whySupported(claimOf(programme.earlierClaims, IMMATERIAL));
    const there = await later.whySupported(claimOf(freshClaims, IMMATERIAL));
    expect(here.withdrawn).toBe(true);
    expect(there.withdrawn).toBe(false);
    expect(there.verdict).toBe("supported");
  });

  /** A citation must be one the cited analysis actually made. */
  test("naming a claim that does not exist is refused", async () => {
    const _programme = await twoStages();

    await expect(session.whySupported(ref("claim", "CLM_9999"))).rejects.toThrow(
      /no claim CLM_9999/,
    );

    await expect(
      session.reinterpret({
        of: ref("claim", "CLM_9999"),
        as: "narrower still",
        because: "it should not get this far",
      }),
    ).rejects.toThrow(/no claim CLM_9999/);
  });

  /**
   * A bare proposition is refused when it names more than one claim.
   *
   * Text remains the right handle when a sentence is asserted once, which is
   * the ordinary case and every earlier scenario. When it is not, LabKit says
   * so rather than picking one — the wrong answer here is not "no result", it
   * is a confident answer about a claim the caller did not mean.
   */
  test("an ambiguous proposition is refused at the one place wording is resolved", async () => {
    const programme = await twoStages();

    // **The refusal lives in one place, and that is the point.** Both
    // `whySupported` and `reinterpret` take a handle, so neither has to guess
    // which claim was meant -- `claimsAsserting` is the single seam where
    // text becomes a handle. It reports every match rather than choosing.
    const found = await session.claimsAsserting(IMMATERIAL);
    expect(found).toHaveLength(2);
    expect(found.map((c) => c.claim).sort()).toEqual(
      [
        claimOf(programme.earlierClaims, IMMATERIAL),
        claimOf(programme.laterClaims, IMMATERIAL),
      ].sort(),
    );

    // A caller that resolves by wording and does not choose gets a refusal.
    await expect(claimNamed(session, IMMATERIAL)).rejects.toThrow(/is claimed 2 times/);

    // And naming one is unambiguous: each answers about its own question.
    const earlier = await session.whySupported(claimOf(programme.earlierClaims, IMMATERIAL));
    const later = await session.whySupported(claimOf(programme.laterClaims, IMMATERIAL));
    expect(earlier.proposition).toBe(later.proposition);
    expect(earlier.support).not.toEqual(later.support);
  });

  /** One sentence in one scope still reads by text — every earlier scenario depends on it. */
  test("an unambiguous proposition still answers to its own words", async () => {
    const programme = await twoStages();
    const solo = await session.whySupported(claimOf(programme.earlierClaims, IMMATERIAL));

    const { question: enquiryOnly } = await session.pose({
      question: "does the encoding respond nonlinearly?",
    });
    const { enquiry: work } = await session.pursue({
      question: enquiryOnly,
      approach: "curvature sweep",
    });
    const { observations: readings } = await session.recordObservations({
      enquiry: work,
      name: "curvature readings",
      finding: "response measured across the sweep",
    });
    await recordAnalysis(session, {
      enquiry: work,
      method: "curvature-fit",
      from: [readings],
      concludes: [
        {
          proposition: "the encoding responds nonlinearly",
          finding: "departure from linearity across the sweep",
        },
      ],
    });

    const byText = await session.whySupported(
      await claimNamed(session, "the encoding responds nonlinearly"),
    );
    expect(byText.verdict).toBe("supported");
    expect(solo.verdict).toBe("supported");
  });
});
