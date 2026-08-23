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
import { claimNamed, claimOf } from "../helpers/claims";

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

/** A second reader over the same graph — see tests/helpers/scenario.ts on what this proves. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

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
    const { analysis: nullResult, claims: nullResultClaims } = await session.recordAnalysis({
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
    await session.closeEnquiry({ enquiry: specificity, answeredBy: claimOf(nullResultClaims, SPECIFICITY) });

    const status = await session.enquiryStatus(specificity);
    expect(await (await afterwards()).enquiryStatus(specificity)).toEqual(status);
    expect(status.question!.open).toBe(false);
  });

  test("Afterward 1 & 2: closed, and specifically ANSWERED — not abandoned, not deferred", async () => {
    const { specificity, observations } = await aProgrammeWithOneOpenQuestion();
    const { analysis: nullResult, claims: nullResultClaims } = await session.recordAnalysis({
      enquiry: specificity,
      method: "cluster-comparison",
      from: [observations],
      concludes: [{ proposition: SPECIFICITY, finding: "no separation detectable", bearing: "challenges" }],
    });
    await session.closeEnquiry({ enquiry: specificity, answeredBy: claimOf(nullResultClaims, SPECIFICITY) });

    const status = await session.enquiryStatus(specificity);
    expect(await (await afterwards()).enquiryStatus(specificity)).toEqual(status);
    expect(status.question!.open).toBe(false);
    expect(status.question!.closure).toBe("answered");
    // The three must not be one state.
    expect(status.question!.closure).not.toBe("abandoned");
    expect(status.question!.closure).not.toBe("deferred");
  });

  test("Afterward 2, polarity: answered NEGATIVELY, and that is queryable", async () => {
    const { specificity, observations } = await aProgrammeWithOneOpenQuestion();
    const { analysis: nullResult, claims: nullResultClaims } = await session.recordAnalysis({
      enquiry: specificity,
      method: "cluster-comparison",
      from: [observations],
      concludes: [{ proposition: SPECIFICITY, finding: "no separation detectable", bearing: "challenges" }],
    });
    await session.closeEnquiry({ enquiry: specificity, answeredBy: claimOf(nullResultClaims, SPECIFICITY) });

    const status = await session.enquiryStatus(specificity);
    expect(await (await afterwards()).enquiryStatus(specificity)).toEqual(status);
    expect(status.question!.answer).toBe("no");
  });

  test("Afterward 3: the neighbouring supported claim is untouched, and LabKit says so", async () => {
    const { specificity, observations } = await aProgrammeWithOneOpenQuestion();
    const { analysis: nullResult, claims: nullResultClaims } = await session.recordAnalysis({
      enquiry: specificity,
      method: "cluster-comparison",
      from: [observations],
      concludes: [{ proposition: SPECIFICITY, finding: "no separation detectable", bearing: "challenges" }],
    });
    await session.closeEnquiry({ enquiry: specificity, answeredBy: claimOf(nullResultClaims, SPECIFICITY) });

    // Reconstructible from a fresh reader, not from a value we kept.
    const reader = new ResearchSession(await scenario.current(), { clock });
    const neighbour = await reader.whySupported(await claimNamed(reader, TRANSFORMATION));
    expect(neighbour.supported).toBe(true);
    expect(neighbour.superseded).toEqual([]);

    const closed = await reader.whySupported(await claimNamed(reader, SPECIFICITY));
    expect(closed.supported).toBe(false);
  });

  test("Afterward 4: the null result is cited AS evidence, not as an absence of it", async () => {
    const { specificity, observations } = await aProgrammeWithOneOpenQuestion();
    const { analysis: nullResult, claims: nullResultClaims } = await session.recordAnalysis({
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
    await session.closeEnquiry({ enquiry: specificity, answeredBy: claimOf(nullResultClaims, SPECIFICITY) });

    const status = await session.enquiryStatus(specificity);
    expect(await (await afterwards()).enquiryStatus(specificity)).toEqual(status);
    expect(status.question!.evidence).toHaveLength(1);
    expect(status.question!.evidence[0]!.states).toContain("no separation detectable");
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
    expect(await (await afterwards()).enquiryStatus(specificity)).toEqual(status);
    expect(status.question!.open).toBe(false);
    expect(status.question!.closure).toBe("abandoned");
    expect(status.question!.answer).toBeNull();
    expect(status.question!.evidence).toEqual([]);
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

    const refuted = await session.whySupported(await claimNamed(session, SPECIFICITY));

    // **A sentence nobody claimed has no claim to ask about.** `whySupported`
    // used to take text and answer `supported: false, challenged: false` for
    // one; it takes a handle now, and there is no handle to hand it. The
    // distinction the scenario exists for survives, one step earlier: a
    // refuted claim EXISTS and is challenged, an unexamined sentence does not
    // exist at all -- which is a stronger statement than a false flag.
    expect(await session.claimsAsserting("nobody has ever asked this")).toEqual([]);

    expect(refuted.supported).toBe(false);
    expect(refuted.challenged).toBe(true);
    expect(refuted.against).toHaveLength(1);
    expect(refuted.against[0]!.finding).toContain("no separation detectable");
  });

  /**
   * A question can only be answered by work that was actually pursuing it.
   * Without this, an unrelated analysis's findings become the stated basis
   * for resolving a question they never addressed.
   */
  test("an analysis from a different enquiry cannot answer this question", async () => {
    const { established, specificity, observations } = await aProgrammeWithOneOpenQuestion();
    const elsewhere = await session.recordObservations({
      enquiry: established,
      name: "unrelated measurements",
      finding: "unrelated",
    });
    const { analysis: unrelated, claims: unrelatedClaims } = await session.recordAnalysis({
      enquiry: established,
      method: "unrelated-analysis",
      from: [elsewhere],
      concludes: [{ proposition: SPECIFICITY, finding: "irrelevant", bearing: "challenges" }],
    });

    await expect(
      session.closeEnquiry({ enquiry: specificity, answeredBy: claimOf(unrelatedClaims, SPECIFICITY) }),
    ).rejects.toThrow(/no claim CLM_99999|does not belong to enquiry/);

    // Nothing was written on the way to failing.
    const status = await session.enquiryStatus(specificity);
    expect(await (await afterwards()).enquiryStatus(specificity)).toEqual(status);
    expect(status.question!.open).toBe(true);
    expect(status.question!.closure).toBeNull();
    expect(observations.kind).toBe("observations");
  });

  test("a question cannot be answered on a proposition the analysis never concluded", async () => {
    const { specificity, observations } = await aProgrammeWithOneOpenQuestion();
    const { analysis: analysis, claims: analysisClaims } = await session.recordAnalysis({
      enquiry: specificity,
      method: "cluster-comparison",
      from: [observations],
      concludes: [{ proposition: SPECIFICITY, finding: "no separation", bearing: "challenges" }],
    });

    await expect(
      session.closeEnquiry({ enquiry: specificity, answeredBy: { kind: "claim" as const, id: "CLM_99999" } }),
    ).rejects.toThrow(/no claim CLM_99999|does not belong to enquiry/);

    const status = await session.enquiryStatus(specificity);
    expect(await (await afterwards()).enquiryStatus(specificity)).toEqual(status);
    expect(status.question!.open).toBe(true);
  });

  /**
   * Polarity must come from the finding that answers THIS question, not from
   * "any cited finding challenges anything". An analysis can support the
   * proposition answering one question while challenging a secondary one.
   */
  test("polarity comes from the answering finding, not from any finding in the analysis", async () => {
    const { specificity, observations } = await aProgrammeWithOneOpenQuestion();
    const { analysis: mixed, claims: mixedClaims } = await session.recordAnalysis({
      enquiry: specificity,
      method: "mixed-analysis",
      from: [observations],
      concludes: [
        { proposition: SPECIFICITY, finding: "clear separation between constructions" },
        { proposition: "a secondary side-proposition", finding: "not borne out", bearing: "challenges" },
      ],
    });

    await session.closeEnquiry({ enquiry: specificity, answeredBy: claimOf(mixedClaims, SPECIFICITY) });

    const status = await session.enquiryStatus(specificity);
    expect(await (await afterwards()).enquiryStatus(specificity)).toEqual(status);
    expect(status.question!.closure).toBe("answered");
    // "yes" -- the answering finding supports it, despite the analysis also
    // challenging an unrelated proposition.
    expect(status.question!.answer).toBe("yes");
    expect(status.question!.evidence.map((e) => e.states)).toEqual(["clear separation between constructions"]);
  });

  /**
   * Overlap regression, per review: making CHALLENGES live exposed
   * SUPPORTS-only assumptions in query paths written before it existed.
   */
  test("a withdrawn challenge is historical, and propagates as an affected claim", async () => {
    const { specificity, observations } = await aProgrammeWithOneOpenQuestion();
    const { analysis: refutation, claims: refutationClaims } = await session.recordAnalysis({
      enquiry: specificity,
      method: "cluster-comparison",
      from: [observations],
      concludes: [{ proposition: SPECIFICITY, finding: "no separation detectable", bearing: "challenges" }],
    });

    const before = await session.whySupported(claimOf(refutationClaims, SPECIFICITY));
    expect(before.challenged).toBe(true);
    expect(before.against).toHaveLength(1);

    const review = await session.recordReview({ of: refutation, verdict: "the clustering metric was misapplied" });
    const report = await session.replaceAnalysis({
      supersedes: refutation,
      because: review,
      enquiry: specificity,
      method: "corrected-cluster-comparison",
      from: [observations],
      concludes: [{ proposition: SPECIFICITY, finding: "still no separation, corrected metric", bearing: "challenges" }],
    });

    // conclusionsOf() saw nothing at all when an analysis only challenged.
    expect(report.affected).toEqual([SPECIFICITY]);
    expect(report.changed).toHaveLength(1);

    // After the replacement the sentence is claimed twice; this asks about
    // the original, which is the one that was withdrawn.
    const after = await session.whySupported(claimOf(refutationClaims, SPECIFICITY));
    // The old challenge is withdrawn, not still standing.
    expect(after.against.map((a) => a.finding)).toEqual(["still no separation, corrected metric"]);
    expect(after.superseded).toHaveLength(1);
    expect(after.superseded[0]).toMatchObject({
      finding: "no separation detectable",
      bearing: "challenges",
      reason: "the clustering metric was misapplied",
    });

    // ...and invalidating the record enumerates the challenged claim.
    const downstream = await session.whatDependsOn("cluster-comparison output");
    expect(downstream.claims.map((c) => c.asserts)).toContain(SPECIFICITY);
  });

  test("an enquiry nobody has closed is open, and that is not a kind of closure", async () => {
    const { specificity } = await aProgrammeWithOneOpenQuestion();

    const status = await session.enquiryStatus(specificity);
    expect(await (await afterwards()).enquiryStatus(specificity)).toEqual(status);
    expect(status.question!.open).toBe(true);
    expect(status.question!.closure).toBeNull();
  });
});
