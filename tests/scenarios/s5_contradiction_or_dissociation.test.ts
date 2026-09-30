/**
 * S-5 — "Contradiction or dissociation?"
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, claimOf } from "../helpers/claims";
import { ref } from "@labkit/core-domain/report";
import { recordAnalysis } from "../helpers/analysis";
import { as, captureConversation } from "../helpers/conversation";

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
  session = new ResearchSession(graph, { clock, events, attribution: as("Researcher") });
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
 */
async function twoStages() {
  const { question: internal } = await session.writes.pose({ question: INTERNAL });
  const { enquiry: internalWork } = await session.writes.pursue({
    question: internal,
    approach: "internal mapping-strength comparison",
  });
  const { observations: internalReadings } = await session.writes.recordObservations({
    enquiry: internalWork,
    name: "mapping-strength readings across constructions",
    finding: "mapping strength measured for five graph constructions",
  });
  const { analysis: earlier, claims: earlierClaims } = await recordAnalysis(session.writes, {
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

  const { question: external } = await session.writes.pose({ question: EXTERNAL });
  const { enquiry: externalWork } = await session.writes.pursue({
    question: external,
    approach: "downstream classification comparison",
  });
  const { observations: externalReadings } = await session.writes.recordObservations({
    enquiry: externalWork,
    name: "downstream classification readings",
    finding: "held-out classification accuracy measured for the same five constructions",
  });
  const { analysis: later, claims: laterClaims } = await recordAnalysis(session.writes, {
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

/**
 * The earlier stage's reading narrowed: its own analysis concludes the narrower proposition in
 * place of the claim it drew, naming that claim by handle.
 */
async function narrowEarlierReading(programme: Awaited<ReturnType<typeof twoStages>>) {
  return session.writes.conclude({
    analysis: programme.earlier,
    proposition: "graph construction does not affect mapping strength within 0.02",
    finding: "all five constructions within 0.02 of each other on mapping strength",
    replacing: claimOf(programme.earlierClaims, IMMATERIAL),
  });
}

describe("S-5 — contradiction or dissociation?", () => {
  /**
   * Afterward 3 — does revising or withdrawing one interpretation affect the other?
   */
  test("withdrawing one reading leaves the identically worded one alone", async () => {
    const programme = await twoStages();

    await narrowEarlierReading(programme);

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });

    const withdrawn = await later.reads.whySupported({
      claim: claimOf(programme.earlierClaims, IMMATERIAL),
    });
    expect(withdrawn.withdrawn).toBe(true);

    // The other stage's claim is untouched: same words, different question,
    // nobody withdrew it.
    const untouched = await later.reads.whySupported({
      claim: claimOf(programme.laterClaims, IMMATERIAL),
    });
    expect(untouched.withdrawn).toBe(false);
    expect(untouched.challenged).toBe(true);
    expect(untouched.against).toHaveLength(1);
  });

  /**
   * Nothing about another line of enquiry's closure rests on this reading.
   */
  test("a question closed in another line of enquiry is not reported as resting on this reading", async () => {
    const programme = await twoStages();

    // A third line of work asserting the same sentence, and settling on it.
    const { question: alsoInternal } = await session.writes.pose({
      question: "does the graph construction matter for reconstruction error?",
    });
    const { enquiry: work } = await session.writes.pursue({
      question: alsoInternal,
      approach: "reconstruction-error comparison",
    });
    const { observations: readings } = await session.writes.recordObservations({
      enquiry: work,
      name: "reconstruction-error readings",
      finding: "reconstruction error measured for the same five constructions",
    });
    const { claims: settledClaims } = await recordAnalysis(session.writes, {
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
    await session.writes.closeEnquiry({
      enquiry: work,
      answeredBy: claimOf(settledClaims, IMMATERIAL),
    });

    await narrowEarlierReading(programme);

    // The reconstruction-error question was settled on its own reading, not
    // on this one.
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const settledStill = await later.reads.whySupported({
      claim: claimOf(settledClaims, IMMATERIAL),
    });
    expect(settledStill.withdrawn).toBe(false);
    expect(settledStill.verdict).toBe("supported");
  });

  /**
   * A sentence withdrawn in one line of enquiry does not block work in another.
   */
  test("withdrawing a sentence here does not block concluding it elsewhere", async () => {
    const programme = await twoStages();
    await narrowEarlierReading(programme);

    const { question: elsewhere } = await session.writes.pose({
      question: "does the graph construction matter for reconstruction error?",
    });
    const { enquiry: work } = await session.writes.pursue({
      question: elsewhere,
      approach: "reconstruction-error comparison",
    });
    const { observations: readings } = await session.writes.recordObservations({
      enquiry: work,
      name: "reconstruction-error readings",
      finding: "reconstruction error measured across constructions",
    });
    const { claims: freshClaims } = await recordAnalysis(session.writes, {
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
    const here = await later.reads.whySupported({
      claim: claimOf(programme.earlierClaims, IMMATERIAL),
    });
    const there = await later.reads.whySupported({ claim: claimOf(freshClaims, IMMATERIAL) });
    expect(here.withdrawn).toBe(true);
    expect(there.withdrawn).toBe(false);
    expect(there.verdict).toBe("supported");
  });

  /** A citation must be one the cited analysis actually made. */
  test("naming a claim that does not exist is refused", async () => {
    const programme = await twoStages();

    await expect(session.reads.whySupported({ claim: ref("claim", "CLM_9999") })).rejects.toThrow(
      /CLM_9999 not found/,
    );

    await expect(
      session.writes.conclude({
        analysis: programme.earlier,
        proposition: "narrower still",
        finding: "it should not get this far",
        replacing: ref("claim", "CLM_9999"),
      }),
    ).rejects.toThrow(/CLM_9999 not found/);
  });

  /**
   * A bare proposition is refused when it names more than one claim.
   */
  test("an ambiguous proposition is refused at the one place wording is resolved", async () => {
    const programme = await twoStages();

    // **The refusal lives in one place, and that is the point.** Both
    // `whySupported` and `conclude --replacing` take a handle, so neither has to guess
    // which claim was meant -- `claimsAsserting` is the single seam where
    // text becomes a handle. It reports every match rather than choosing.
    const found = await session.reads.claimsAsserting({ proposition: IMMATERIAL });
    expect(found).toHaveLength(2);
    expect(found.map((c) => c.claim).sort()).toEqual(
      [
        claimOf(programme.earlierClaims, IMMATERIAL),
        claimOf(programme.laterClaims, IMMATERIAL),
      ].sort(),
    );

    // A caller that resolves by wording and does not choose gets a refusal.
    await expect(claimNamed(session.reads, IMMATERIAL)).rejects.toThrow(/is claimed 2 times/);

    // And naming one is unambiguous: each answers about its own question.
    const earlier = await session.reads.whySupported({
      claim: claimOf(programme.earlierClaims, IMMATERIAL),
    });
    const later = await session.reads.whySupported({
      claim: claimOf(programme.laterClaims, IMMATERIAL),
    });
    expect(earlier.proposition).toBe(later.proposition);
    expect(earlier.support).not.toEqual(later.support);

    await captureConversation(
      {
        id: "S-5",
        title: "contradiction or dissociation?",
        about:
          "Two stages of one programme assert the same sentence with opposite evidence. Asked by its words, the sentence names two claims, and each answers about its own question.",
      },
      events,
    );
  });

  /** One sentence in one scope still reads by text — every earlier scenario depends on it. */
  test("an unambiguous proposition still answers to its own words", async () => {
    const programme = await twoStages();
    const solo = await session.reads.whySupported({
      claim: claimOf(programme.earlierClaims, IMMATERIAL),
    });

    const { question: enquiryOnly } = await session.writes.pose({
      question: "does the encoding respond nonlinearly?",
    });
    const { enquiry: work } = await session.writes.pursue({
      question: enquiryOnly,
      approach: "curvature sweep",
    });
    const { observations: readings } = await session.writes.recordObservations({
      enquiry: work,
      name: "curvature readings",
      finding: "response measured across the sweep",
    });
    await recordAnalysis(session.writes, {
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

    const byText = await session.reads.whySupported({
      claim: await claimNamed(session.reads, "the encoding responds nonlinearly"),
    });
    expect(byText.verdict).toBe("supported");
    expect(solo.verdict).toBe("supported");
  });
});
