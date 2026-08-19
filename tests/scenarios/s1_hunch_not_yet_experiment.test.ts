/**
 * S-1 — "A hunch that is not yet an experiment."
 * docs/project-journal/008_user_story_mining.md
 *
 * The first scenario to ask what `Question` and `LineOfEnquiry` mean beyond
 * closure. S-4 proved they are distinct because closure attaches to the
 * question; it never made one question carry two pursuits, and never created
 * a question from anything other than a researcher typing one.
 *
 * Three things are deliberately NOT pre-decided:
 *   - whether question-to-question lineage needs an edge of its own;
 *   - whether "what did we know then" needs a durable event store;
 *   - whether identity of a question is its wording.
 * The Afterward queries are written to discriminate, and the wording one is
 * probed from both sides: two pursuits of one question must not become two
 * questions, and two identically-worded questions must not become one.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink, type QuestionRef } from "../../src/domain";
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

const NONLINEAR = "the encoding responds nonlinearly to its input";
const SMEAR = "the internal response is more than a nonlinear smear";

/**
 * The programme before the researcher says anything, planted as durable state
 * so that "what do we already know?" is answered from the record rather than
 * from the conversation.
 *
 * Three different scientific states, deliberately arranged so that no two of
 * them can be told apart by reading text:
 *   - nonlinearity: pursued, analysed, closed on a cited result;
 *   - the smear question: pursued, analysed, nothing closed;
 *   - external task utility: written down and never pursued at all.
 */
async function priorState() {
  const nonlinearity = await session.pose("does the encoding respond nonlinearly at all?");
  const nlEnquiry = await session.pursue({ question: nonlinearity, approach: "response curvature sweep" });
  const nlObs = await session.recordObservations({
    enquiry: nlEnquiry,
    name: "curvature sweep readings",
    finding: "response departs from the linear fit across the sweep",
  });
  const nlAnalysis = await session.recordAnalysis({
    enquiry: nlEnquiry,
    method: "curvature-fit",
    from: [nlObs],
    concludes: [{ proposition: NONLINEAR, finding: "departure from linearity well outside the fit interval" }],
  });
  await session.closeEnquiry({
    enquiry: nlEnquiry,
    answeredBy: { analysis: nlAnalysis, proposition: NONLINEAR },
  });

  const smear = await session.pose("does the encoding do anything beyond a nonlinear smear?");
  const smearEnquiry = await session.pursue({ question: smear, approach: "response-map inspection" });
  const smearObs = await session.recordObservations({
    enquiry: smearEnquiry,
    name: "response-map readings",
    finding: "response map recorded for eight input families",
  });
  await session.recordAnalysis({
    enquiry: smearEnquiry,
    method: "response-map-inspection",
    from: [smearObs],
    concludes: [{ proposition: SMEAR, finding: "map differs by family, but the pattern flips between initial conditions" }],
  });

  // Written down and never pursued. This is what makes "untested" a state of
  // the record rather than something the reader invents: the question is on
  // the books, nothing has ever addressed it.
  const utility = await session.pose("does the learned topology help on an external task?");

  return { nonlinearity, smear, smearEnquiry, utility };
}

describe("S-1 — a hunch that is not yet an experiment", () => {
  test("the conversation runs end to end through research verbs alone", async () => {
    const prior = await priorState();

    // Researcher: the learned topology seems to be doing something
    //             computationally interesting.
    const hunch = await session.pose("is the learned topology doing something computationally interesting?");

    // Agent:      what do we already know?
    // LabKit:     nonlinearity is established; the smear question is
    //             unresolved; external task utility has not been tested.
    const known = await session.whatIsKnown();
    expect(known.established.map((q) => q.question)).toEqual([prior.nonlinearity.id]);
    expect(known.unresolved.map((q) => q.question)).toContain(prior.smear.id);
    expect(known.untested.map((q) => q.question)).toContain(prior.utility.id);

    // Researcher: fine. Let's pursue whether different inputs map to
    //             reproducibly different internal responses.
    const sharper = await session.sharpen({
      from: hunch,
      into: "do different inputs map to reproducibly different internal responses?",
      because: "the vague form is not testable; this one names what would count as an answer",
    });

    expect(sharper.id).not.toBe(hunch.id);
  });

  /**
   * Afterward 1 — what is established, what is unresolved, what is untested?
   *
   * Three answers, not two. The untested question must not appear as
   * unresolved, and nothing here may render as a failure: nobody has run
   * anything that failed.
   */
  test("three states of knowledge, and untested is not a kind of failure", async () => {
    const prior = await priorState();

    const known = await session.whatIsKnown();
    const ids = (qs: Array<{ question: string }>) => qs.map((q) => q.question);

    expect(ids(known.established)).toContain(prior.nonlinearity.id);
    expect(ids(known.unresolved)).toContain(prior.smear.id);
    expect(ids(known.untested)).toContain(prior.utility.id);

    // The three buckets are disjoint -- an entry appearing in two of them
    // would mean the reader is guessing.
    expect(ids(known.unresolved)).not.toContain(prior.utility.id);
    expect(ids(known.established)).not.toContain(prior.smear.id);
    expect(ids(known.untested)).not.toContain(prior.smear.id);

    // Untested is not failure and not a negative result. The disjointness
    // above is what carries that; this pins the weaker companion claim -- that
    // posing a question mints nothing that could later be read as a finding
    // against it. It would hold for any string, and is here to stay holding.
    const untestedProposition = await session.whySupported("does the learned topology help on an external task?");
    expect(untestedProposition.challenged).toBe(false);
    expect(untestedProposition.against).toEqual([]);
    expect(untestedProposition.supported).toBe(false);

    // Afterward, from a second reader over the same graph.
    const later = new ResearchSession(await scenario.current(), { clock });
    const again = await later.whatIsKnown();
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

    const nonlinear = await session.whySupported(NONLINEAR);
    expect(nonlinear.supported).toBe(true);

    const stronger = await session.enquiryStatus(prior.smearEnquiry);
    expect(stronger.open).toBe(true);
    expect(stronger.closure).toBeNull();

    const known = await session.whatIsKnown();
    expect(known.unresolved.map((q) => q.question)).toContain(prior.smear.id);
  });

  /**
   * Afterward 2 — where did the current sharper question come from?
   *
   * Traceable to the vague original, without that original having been
   * rewritten to look like it was always this precise, and without it having
   * been closed by an act that only said "narrow".
   */
  test("the sharper question is traceable to the hunch, which is neither rewritten nor closed", async () => {
    const hunch = await session.pose("is the learned topology doing something computationally interesting?");
    const sharper = await session.sharpen({
      from: hunch,
      into: "do different inputs map to reproducibly different internal responses?",
      because: "the vague form is not testable",
    });

    const origin = await session.originOf(sharper);
    expect(origin?.from).toBe(hunch.id);
    expect(origin?.reason).toContain("not testable");

    // From a second reader: the original still asks what it originally asked.
    const later = new ResearchSession(await scenario.current(), { clock });
    const durable = await later.originOf(sharper);
    expect(durable?.from).toBe(hunch.id);
    expect(durable?.fromAsks).toBe("is the learned topology doing something computationally interesting?");

    // Narrowing is not answering. Nothing has been shown about the hunch, so
    // it is still on the books untested -- not established, and not a failure.
    const known = await later.whatIsKnown();
    expect(known.established.map((q) => q.question)).not.toContain(hunch.id);
    expect(known.untested.map((q) => q.question)).toContain(hunch.id);
    expect(known.untested.map((q) => q.asks)).toContain("is the learned topology doing something computationally interesting?");
  });

  /**
   * Afterward 3 — what was the state of knowledge at the moment this question
   * was sharpened, asked after later evidence has arrived?
   *
   * The hunch is sharpened twice, with a result landing in between. If the two
   * sharpenings report the same knowledge, the model cannot attribute a
   * sharpening to what preceded it -- which is a wrong answer, not an empty
   * one, because the second answer would be back-dated onto the first.
   */
  test("the knowledge behind a sharpening is the knowledge that existed then", async () => {
    const prior = await priorState();
    const hunch = await session.pose("is the learned topology doing something computationally interesting?");

    const first = await session.sharpen({
      from: hunch,
      into: "do different inputs map to reproducibly different internal responses?",
      because: "the vague form is not testable",
    });

    // Later evidence arrives on the smear question -- after the first
    // sharpening, before the second.
    const lateObs = await session.recordObservations({
      enquiry: prior.smearEnquiry,
      name: "seed-controlled response maps",
      finding: "response maps recorded with initial conditions held fixed",
    });
    await session.recordAnalysis({
      enquiry: prior.smearEnquiry,
      method: "seed-controlled-inspection",
      from: [lateObs],
      concludes: [{ proposition: SMEAR, finding: "family separation survives when initial conditions are held fixed" }],
    });

    const second = await session.sharpen({
      from: hunch,
      into: "does the same input map to the same internal response across seeds?",
      because: "reproducibility is now the part in doubt",
    });

    const behindFirst = await session.originOf(first);
    const behindSecond = await session.originOf(second);

    // The finding that arrived after the first sharpening must not appear
    // behind it, and must appear behind the second.
    const LATE = "family separation survives when initial conditions are held fixed";
    expect(behindSecond?.knownAtTheTime).toContain(LATE);
    expect(behindFirst?.knownAtTheTime).not.toContain(LATE);

    // ...and the two sharpenings are told apart at all.
    expect(behindFirst?.knownAtTheTime).not.toEqual(behindSecond?.knownAtTheTime ?? []);

    // Afterward, from a second reader with an event log of its own -- which is
    // empty. The historical answer is reconstructed from durable scientific
    // state, not replayed from the stream of what this session happened to do.
    const later = new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
    expect(later.events.all()).toHaveLength(0);
    expect((await later.originOf(first))?.knownAtTheTime).not.toContain(LATE);
    expect((await later.originOf(second))?.knownAtTheTime).toContain(LATE);
  });

  /**
   * Sharpening validates before it writes anything.
   *
   * The act writes a decision, two edges per standing finding, and a question.
   * A rejection partway through would leave a decision recording a narrowing
   * that produced nothing — which is precisely the unreadable state row D was
   * about. Same shape as S-4's closure guards.
   */
  test("sharpening a question that is not on the record writes nothing", async () => {
    await priorState();
    const before = await session.whatIsKnown();

    const absent: QuestionRef = { kind: "question", id: "Q_404" };

    // The message is the assertion. Sharpening a missing question would fail
    // either way -- but failing on the *second* write, when the narrowing edge
    // finds no endpoint, means a decision was already on the record. Only the
    // up-front guard produces this wording, so a rejection that stops saying
    // it is a rejection that started writing first.
    await expect(
      session.sharpen({ from: absent, into: "a sharper form of nothing", because: "it should not get this far" }),
    ).rejects.toThrow(/no question Q_404 to sharpen/);

    const later = new ResearchSession(await scenario.current(), { clock });
    const after = await later.whatIsKnown();
    const census = (k: Awaited<ReturnType<typeof later.whatIsKnown>>) =>
      [...k.established, ...k.unresolved, ...k.untested].map((q) => q.question).sort();
    expect(census(after)).toEqual(census(before));

    // Nothing on the record cites the sharpening that never happened.
    for (const question of census(after)) {
      const origin = await later.originOf({ kind: "question", id: question });
      expect(origin?.reason).not.toBe("it should not get this far");
    }
  });

  /**
   * Afterward 4 — one question, pursued more than one way.
   *
   * Two pursuits of the same question, worded similarly, must remain one
   * question; two questions worded identically must remain two. Identity is
   * the handle the caller holds, never the text.
   */
  test("a second pursuit of one question does not mint a second question", async () => {
    const question = await session.pose("do different inputs map to reproducibly different internal responses?");
    const byMapping = await session.pursue({ question, approach: "response-map separation" });
    const byProbe = await session.pursue({ question, approach: "response-map separation, probe variant" });

    expect(byMapping.id).not.toBe(byProbe.id);

    const later = new ResearchSession(await scenario.current(), { clock });
    const pursuits = await later.pursuitsOf(question);
    expect(pursuits.map((p) => p.id).sort()).toEqual([byMapping.id, byProbe.id].sort());

    // One question on the books, not two.
    const known = await later.whatIsKnown();
    const all = [...known.established, ...known.unresolved, ...known.untested];
    expect(all.filter((q) => q.question === question.id)).toHaveLength(1);
  });

  test("two questions worded identically are two questions", async () => {
    const wording = "does the learned topology help on an external task?";
    const first = await session.pose(wording);
    const second = await session.pose(wording);

    expect(second.id).not.toBe(first.id);

    const later = new ResearchSession(await scenario.current(), { clock });
    const known = await later.whatIsKnown();
    const all = [...known.established, ...known.unresolved, ...known.untested];
    expect(all.filter((q) => q.asks === wording)).toHaveLength(2);
  });
});
