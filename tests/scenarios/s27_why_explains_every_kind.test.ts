/**
 * S-27: why, of anything on the record.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, type Clock } from "../../src/domain";
import { LABEL_BY_KIND, kindOf, type AnyRef, type Kind } from "../../src/domain/report";
import { openScenario, type Scenario } from "../helpers/scenario";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;

let tick = 0;
const clock: Clock = { now: () => new Date(Date.UTC(2026, 8, 7, 9, tick++)).toISOString() };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  tick = 0;
  session = new ResearchSession(await scenario.begin(), { clock });
});
afterEach(async () => {
  await scenario.end();
});

const afterwards = async () => new ResearchSession(await scenario.current(), { clock });

/** One handle of as many kinds as a plain arc of work mints. */
async function anArcOfWork() {
  const { question, enquiry } = await session.openEnquiry("does T beat the control?");
  const { observations } = await session.recordObservations({
    enquiry,
    name: "stage 1 results",
    finding: "per-image accuracy",
  });
  const { claims, analysis } = await recordAnalysis(session, {
    enquiry,
    method: "paired comparison",
    from: [observations],
    concludes: [{ proposition: "T beats the control", finding: "p = 0.004" }],
  });
  const claim = claims[0]!.claim;
  const { criterion } = await session.stateCriterion("the median must agree");
  const { work } = await session.planWork({ objective: "run stage 2", acceptance: "a table" });
  const { gate } = await session.declareGate({
    governedBy: [criterion],
    consequence: "stage 2 does not start",
    protecting: [work],
  });
  await session.evaluateCriterion({ criterion, gate, value: "median p = 0.21", outcome: "fail" });
  const { note } = await session.note({ on: question, text: "the locked parameters live here" });
  const { review } = await session.recordReview({ of: analysis, verdict: "the method is sound" });
  const { decision } = await session.closeEnquiry({ enquiry, answeredBy: claim });
  return {
    question,
    enquiry,
    observations,
    analysis,
    claim,
    criterion,
    work,
    gate,
    note,
    review,
    decision,
  };
}

describe("S-27: why explains every kind", () => {
  test("Afterward: every kind on the record answers, and none refuses", async () => {
    const built = await anArcOfWork();
    const reader = await afterwards();

    // Derived from what the arc actually minted, never a hand-written list of
    // kinds: a kind added to the model and left without a case has to fail
    // here rather than be forgotten.
    const handles = Object.values(built) as AnyRef[];
    const kinds = new Set(handles.map((h) => kindOf(h)));
    expect(kinds.size).toBeGreaterThanOrEqual(10);

    for (const handle of handles) {
      const explained = await reader.why(handle);
      expect(explained.subject as AnyRef).toBe(handle);
      expect(explained.kind).toBe(kindOf(handle) as Kind);
      // A sentence, not an empty string: every kind says what it is even when
      // it holds no prose of its own.
      expect(explained.is.length).toBeGreaterThan(0);
    }
  });

  test("Afterward: a decision says what it settled — the kind with the most edges, once refused", async () => {
    const { decision, question, claim } = await anArcOfWork();

    const explained = await (await afterwards()).why(decision);

    // Its own reason, which is the only place a person's words for an act live.
    expect(explained.is).toContain("T beats the control");
    const reached = explained.because.map((c) => c.handle);
    expect(reached).toContain(question);
    // And how it is joined, in words a researcher would use.
    const settled = explained.because.find((c) => c.handle === question);
    expect(settled!.wording).toContain("settled");
    expect(claim).toBeTruthy();
  });

  test("Afterward: a note concerns what it was written on, and says so", async () => {
    const { note, question } = await anArcOfWork();

    const explained = await (await afterwards()).why(note);

    expect(explained.is).toBe("the locked parameters live here");
    expect(explained.because.map((c) => c.handle)).toEqual([question]);
    expect(explained.because[0]!.wording).toContain("concerns");
  });

  test("no answer names a stored label — the vocabulary is the researcher's", async () => {
    const built = await anArcOfWork();
    const reader = await afterwards();

    const labels = Object.values(LABEL_BY_KIND);
    for (const handle of Object.values(built) as AnyRef[]) {
      const explained = await reader.why(handle);
      const text = [explained.is, ...explained.because.map((c) => c.wording)].join(" ");
      // Not the node labels, and not the edge labels either: an edge is
      // rendered as a phrase, so nothing SHOUTING reaches a reader.
      for (const label of labels) expect(text).not.toContain(label);
      expect(text).not.toMatch(/\b[A-Z]{4,}(_[A-Z]+)*\b/);
    }
  });
});
