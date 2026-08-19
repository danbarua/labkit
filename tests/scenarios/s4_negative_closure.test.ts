/**
 * S-4 — "A negative result that closes the question."
 * docs/project-journal/008_user_story_mining.md
 *
 * First scenario to exercise question lifecycle rather than the control
 * chain. Three things are deliberately NOT pre-decided here — whether
 * `Question` and `LineOfEnquiry` are genuinely distinct, whether closure
 * polarity belongs on `Decision`, and how a well-supported null should be
 * represented. The scenario is written to discriminate.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

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

const SPECIFICITY = "the learned construction is special on the internal mapping measure";
const TRANSFORMATION = "the encoding performs structured internal transformation";

/**
 * The surrounding programme: structured transformation is established, and a
 * separate enquiry asks whether the learned construction is special.
 */
async function aProgrammeWithOneOpenQuestion() {
  const established = await session.openEnquiry("does the encoding transform structure at all?");
  const priorObs = await session.recordObservations({
    enquiry: established,
    name: "response-map measurements",
    finding: "response maps across 40 initial conditions",
  });
  await session.recordAnalysis({
    enquiry: established,
    method: "response-map-analysis",
    from: [priorObs],
    concludes: [{ proposition: TRANSFORMATION, finding: "structured response, reproducible across seeds" }],
  });

  const specificity = await session.openEnquiry("is the learned construction special on the internal measure?");
  const observations = await session.recordObservations({
    enquiry: specificity,
    name: "five-construction comparison",
    finding: "internal mapping strength for all five graph constructions",
  });
  return { established, specificity, observations };
}

describe("S-4: a negative result that closes the question", () => {
  test("the conversation runs end to end through research verbs alone", async () => {
    const { specificity, observations } = await aProgrammeWithOneOpenQuestion();

    // Agent: no detectable evidence of that. All five form a tight cluster.
    const nullResult = await session.recordAnalysis({
      enquiry: specificity,
      method: "cluster-comparison",
      from: [observations],
      concludes: [
        {
          proposition: SPECIFICITY,
          finding: "all five constructions within 0.02 of each other; no separation detectable",
          bearing: "challenges",
        },
      ],
    });

    // Researcher: then close that question for this endpoint.
    await session.closeEnquiry({ enquiry: specificity, answeredBy: nullResult });

    const status = await session.enquiryStatus(specificity);
    expect(status.open).toBe(false);
  });

  test("Afterward 1 & 2: closed, and specifically ANSWERED — not abandoned, not deferred", async () => {
    const { specificity, observations } = await aProgrammeWithOneOpenQuestion();
    const nullResult = await session.recordAnalysis({
      enquiry: specificity,
      method: "cluster-comparison",
      from: [observations],
      concludes: [{ proposition: SPECIFICITY, finding: "no separation detectable", bearing: "challenges" }],
    });
    await session.closeEnquiry({ enquiry: specificity, answeredBy: nullResult });

    const status = await session.enquiryStatus(specificity);
    expect(status.open).toBe(false);
    expect(status.closure).toBe("answered");
    // The three must not be one state.
    expect(status.closure).not.toBe("abandoned");
    expect(status.closure).not.toBe("deferred");
  });

  test("Afterward 2, polarity: answered NEGATIVELY, and that is queryable", async () => {
    const { specificity, observations } = await aProgrammeWithOneOpenQuestion();
    const nullResult = await session.recordAnalysis({
      enquiry: specificity,
      method: "cluster-comparison",
      from: [observations],
      concludes: [{ proposition: SPECIFICITY, finding: "no separation detectable", bearing: "challenges" }],
    });
    await session.closeEnquiry({ enquiry: specificity, answeredBy: nullResult });

    const status = await session.enquiryStatus(specificity);
    expect(status.answer).toBe("no");
  });

  test("Afterward 3: the neighbouring supported claim is untouched, and LabKit says so", async () => {
    const { specificity, observations } = await aProgrammeWithOneOpenQuestion();
    const nullResult = await session.recordAnalysis({
      enquiry: specificity,
      method: "cluster-comparison",
      from: [observations],
      concludes: [{ proposition: SPECIFICITY, finding: "no separation detectable", bearing: "challenges" }],
    });
    await session.closeEnquiry({ enquiry: specificity, answeredBy: nullResult });

    // Reconstructible from a fresh reader, not from a value we kept.
    const reader = new ResearchSession(await scenario.current(), { clock });
    const neighbour = await reader.whySupported(TRANSFORMATION);
    expect(neighbour.supported).toBe(true);
    expect(neighbour.superseded).toEqual([]);

    const closed = await reader.whySupported(SPECIFICITY);
    expect(closed.supported).toBe(false);
  });

  test("Afterward 4: the null result is cited AS evidence, not as an absence of it", async () => {
    const { specificity, observations } = await aProgrammeWithOneOpenQuestion();
    const nullResult = await session.recordAnalysis({
      enquiry: specificity,
      method: "cluster-comparison",
      from: [observations],
      concludes: [
        {
          proposition: SPECIFICITY,
          finding: "all five constructions within 0.02 of each other; no separation detectable",
          bearing: "challenges",
        },
      ],
    });
    await session.closeEnquiry({ enquiry: specificity, answeredBy: nullResult });

    const status = await session.enquiryStatus(specificity);
    expect(status.evidence).toHaveLength(1);
    expect(status.evidence[0]).toContain("no separation detectable");
  });

  /**
   * Row I outside the gate machinery: a question closed with no evidence at
   * all is abandoned, not answered. Absence of evidence must not read as a
   * substantive negative finding.
   */
  test("closing a question with no evidence reads as abandoned, not answered", async () => {
    const { specificity } = await aProgrammeWithOneOpenQuestion();

    await session.closeEnquiry({ enquiry: specificity });

    const status = await session.enquiryStatus(specificity);
    expect(status.open).toBe(false);
    expect(status.closure).toBe("abandoned");
    expect(status.answer).toBeNull();
    expect(status.evidence).toEqual([]);
  });

  /**
   * Row I, outside the gate machinery for the first time. A claim refuted by
   * a null result and a claim nobody has ever examined are scientifically
   * very different. PJ-001's doctrine is that absence of evidence must not be
   * confused with failure.
   */
  test("a refuted claim is distinguishable from one nobody has examined", async () => {
    const { specificity, observations } = await aProgrammeWithOneOpenQuestion();
    await session.recordAnalysis({
      enquiry: specificity,
      method: "cluster-comparison",
      from: [observations],
      concludes: [{ proposition: SPECIFICITY, finding: "no separation detectable", bearing: "challenges" }],
    });

    const refuted = await session.whySupported(SPECIFICITY);
    const neverExamined = await session.whySupported("nobody has ever asked this");

    expect(refuted.supported).toBe(false);
    expect(neverExamined.supported).toBe(false);
    // ...but they must not be the same answer.
    expect(refuted.challenged).toBe(true);
    expect(neverExamined.challenged).toBe(false);
    expect(refuted.against).toHaveLength(1);
    expect(refuted.against[0]!.finding).toContain("no separation detectable");
    expect(neverExamined.against).toEqual([]);
  });

  test("an enquiry nobody has closed is open, and that is not a kind of closure", async () => {
    const { specificity } = await aProgrammeWithOneOpenQuestion();

    const status = await session.enquiryStatus(specificity);
    expect(status.open).toBe(true);
    expect(status.closure).toBeNull();
  });
});
