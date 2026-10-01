/**
 * S-1 — "A hunch that is not yet an experiment."
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, claimOf } from "../helpers/claims";
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

const NONLINEAR = "the encoding responds nonlinearly to its input";
const SMEAR = "the internal response is more than a nonlinear smear";

/**
 * The programme before the researcher says anything, planted as durable state so that "what do
 * we already know?" is answered from the record rather than from the conversation.
 */
async function priorState() {
  const { question: nonlinearity } = await session.writes.pose({
    question: "does the encoding respond nonlinearly at all?",
  });
  const { enquiry: nlEnquiry } = await session.writes.pursue({
    question: nonlinearity,
    approach: "response curvature sweep",
  });
  const { observations: nlObs } = await session.writes.recordObservations({
    enquiry: nlEnquiry,
    name: "curvature sweep readings",
    finding: "response departs from the linear fit across the sweep",
  });
  const { claims: nlAnalysisClaims } = await recordAnalysis(session.writes, {
    enquiry: nlEnquiry,
    method: "curvature-fit",
    from: [nlObs],
    // Prespecified, and separately vouched for below. Both, because they are
    // two facts: `standing` says the design was locked before the run, and the
    // `is <claim> confirmed` after this says somebody stands behind the result.
    // `established` is the second — a promotion is an act, with a date.
    concludes: [
      {
        proposition: NONLINEAR,
        finding: "departure from linearity well outside the fit interval",
        standing: "confirmatory",
      },
    ],
  });
  await session.writes.isConfirmed({
    claim: claimOf(nlAnalysisClaims, NONLINEAR),
    because:
      "the locked curvature criterion was met and the departure is well outside the fit interval",
  });
  await session.writes.closeEnquiry({
    enquiry: nlEnquiry,
    answeredBy: [claimOf(nlAnalysisClaims, NONLINEAR)],
  });

  const { question: smear } = await session.writes.pose({
    question: "does the encoding do anything beyond a nonlinear smear?",
  });
  const { enquiry: smearEnquiry } = await session.writes.pursue({
    question: smear,
    approach: "response-map inspection",
  });
  const { observations: smearObs } = await session.writes.recordObservations({
    enquiry: smearEnquiry,
    name: "response-map readings",
    finding: "response map recorded for eight input families",
  });
  await recordAnalysis(session.writes, {
    enquiry: smearEnquiry,
    method: "response-map-inspection",
    from: [smearObs],
    concludes: [
      {
        proposition: SMEAR,
        finding: "map differs by family, but the pattern flips between initial conditions",
      },
    ],
  });

  // Written down and never pursued. This is what makes "untested" a state of
  // the record rather than something the reader invents: the question is on
  // the books, nothing has ever addressed it.
  const { question: utility } = await session.writes.pose({
    question: "does the learned topology help on an external task?",
  });

  return { nonlinearity, smear, smearEnquiry, utility };
}

describe("S-1 — a hunch that is not yet an experiment", () => {
  test("the conversation runs end to end through research verbs alone", async () => {
    const prior = await priorState();

    // Researcher: the learned topology seems to be doing something
    //             computationally interesting.
    const { question: hunch } = await session.writes.pose({
      question: "is the learned topology doing something computationally interesting?",
    });

    // Agent:      what do we already know?
    // LabKit:     nonlinearity is established; the smear question is
    //             unresolved; external task utility has not been tested.
    const known = await session.reads.whatIsKnown();
    expect(known.established.map((q) => q.question)).toEqual([prior.nonlinearity]);
    expect(known.unresolved.map((q) => q.question)).toContain(prior.smear);
    expect(known.untested.map((q) => q.question)).toContain(prior.utility);

    // Researcher: fine. Let's pursue whether different inputs map to
    //             reproducibly different internal responses.
    const { note: why } = await session.writes.note({
      text: "the vague form is not testable; this one names what would count as an answer",
      on: hunch,
    });
    const { question: sharper } = await session.writes.pose({
      question: "do different inputs map to reproducibly different internal responses?",
      from: why,
    });

    expect(sharper).not.toBe(hunch);

    await captureConversation(
      {
        id: "S-1",
        title: "A hunch that is not yet an experiment",
        about:
          "A researcher has a vague idea about what a learned topology is doing. Before anything is run, the record says what is already established, what is still open and what has never been tested, and the hunch is narrowed into a question that could be answered.",
      },
      events,
    );
  });

  /**
   * Afterward 1 — what is established, what is unresolved, what is untested?
   */
  test("three states of knowledge, and untested is not a kind of failure", async () => {
    const prior = await priorState();

    const known = await session.reads.whatIsKnown();
    const ids = (qs: Array<{ question: string }>) => qs.map((q) => q.question);

    expect(ids(known.established)).toContain(prior.nonlinearity);
    expect(ids(known.unresolved)).toContain(prior.smear);
    expect(ids(known.untested)).toContain(prior.utility);

    // The three buckets are disjoint -- an entry appearing in two of them
    // would mean the reader is guessing.
    expect(ids(known.unresolved)).not.toContain(prior.utility);
    expect(ids(known.established)).not.toContain(prior.smear);
    expect(ids(known.untested)).not.toContain(prior.smear);

    // Untested is not failure and not a negative result. The disjointness above is what carries
    // that; this pins the weaker companion claim -- that posing a question mints nothing that
    // could later be read as a finding against it. It would hold for any string, and is here to
    // stay holding.
    expect(
      await session.reads.claimsAsserting({
        proposition: "does the learned topology help on an external task?",
      }),
    ).toEqual([]);

    // Afterward, from a second reader over the same graph.
    const later = new ResearchSession(await scenario.current(), { clock });
    const again = await later.reads.whatIsKnown();
    expect(ids(again.established)).toEqual(ids(known.established));
    expect(ids(again.unresolved)).toEqual(ids(known.unresolved));
    expect(ids(again.untested)).toEqual(ids(known.untested));
  });

  /**
   * Afterward 1b — a weaker established result coexists with a stronger
   * unresolved question, and nothing has to match their text to see it.
   */
  test("an established weaker result does not discharge the stronger open question", async () => {
    const prior = await priorState();

    const nonlinear = await session.reads.whySupported({
      claim: await claimNamed(session.reads, NONLINEAR),
    });
    expect(nonlinear.verdict).toBe("supported");

    const stronger = await session.reads.enquiryStatus({ enquiry: prior.smearEnquiry });
    expect(stronger.open).toBe(true);
    expect(stronger.closure).toBeNull();

    const known = await session.reads.whatIsKnown();
    expect(known.unresolved.map((q) => q.question)).toContain(prior.smear);
  });

  /**
   * Afterward 4 — one question, pursued more than one way.
   */
  test("a second pursuit of one question does not mint a second question", async () => {
    const { question } = await session.writes.pose({
      question: "do different inputs map to reproducibly different internal responses?",
    });
    const { enquiry: byMapping } = await session.writes.pursue({
      question,
      approach: "response-map separation",
    });
    const { enquiry: byProbe } = await session.writes.pursue({
      question,
      approach: "response-map separation, probe variant",
    });

    expect(byMapping).not.toBe(byProbe);

    const later = new ResearchSession(await scenario.current(), { clock });
    const pursuits = (await later.reads.enquiryList()).filter((e) => e.question === question);
    expect(pursuits.map((p) => p.enquiry).sort()).toEqual([byMapping, byProbe].sort());

    // One question on the books, not two.
    const known = await later.reads.whatIsKnown();
    const all = [...known.established, ...known.unresolved, ...known.untested];
    expect(all.filter((q) => q.question === question)).toHaveLength(1);
  });

  test("two questions worded identically are two questions", async () => {
    const wording = "does the learned topology help on an external task?";
    const { question: first } = await session.writes.pose({ question: wording });
    const { question: second } = await session.writes.pose({ question: wording });

    expect(second).not.toBe(first);

    const later = new ResearchSession(await scenario.current(), { clock });
    const known = await later.reads.whatIsKnown();
    const all = [...known.established, ...known.unresolved, ...known.untested];
    expect(all.filter((q) => q.asks === wording)).toHaveLength(2);
  });
});
