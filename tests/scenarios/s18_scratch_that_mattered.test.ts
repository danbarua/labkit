/**
 * S-18 — "Scratch work that unexpectedly mattered."
 * docs/project-journal/008_user_story_mining.md, §1 story 18, §3 row K
 *
 * Promoted from a story rather than authored: §4 held it back with an explicit
 * condition — "if row K survives the build, promote this to a scenario" — and
 * row K survived S-8, which gave it no verdict.
 *
 * The story: low-friction exploration must be capturable without ephemeral
 * scratch becoming part of the scientific record by accident. Its rule is
 * *capture cheaply, promote before citing*. The premise matters — scratch is
 * recorded **before** anyone knows it will matter, so whatever standing it ends
 * up with cannot have been declared when it was written.
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

const QUESTION = "does the pruning schedule change the convergence point?";
const PROPOSITION = "the pruning schedule shifts the convergence point";

/**
 * Researcher: "I poked at this in a notebook over lunch. Nothing careful."
 *
 * Recorded the cheap way, which is the only way it could have been recorded —
 * nobody knew it would matter.
 */
async function scratchExploration() {
  const enquiry = await session.openEnquiry(QUESTION);
  const observations = await session.recordObservations({
    enquiry,
    name: "lunchtime sweep",
    finding: "twelve runs, no seed control",
  });
  const analysis = await session.recordAnalysis({
    enquiry,
    method: "notebook-sweep",
    from: [observations],
    concludes: [{ proposition: PROPOSITION, finding: "convergence point moves by ~3 steps" }],
  });
  return { enquiry, observations, analysis };
}

describe("S-18: scratch work that unexpectedly mattered", () => {
  /**
   * Afterward 1, carrying the wrong answer it replaced.
   *
   * **What this used to report.** Standing existed — `Conclusion.standing` has
   * defaulted to `exploratory` since S-7 — but almost nothing read it. Closing
   * this question on a lunchtime notebook sweep reported it settled and the
   * survey filed it under `established`, exactly as if a confirmatory result
   * stood behind it. That is ephemeral scratch becoming part of the scientific
   * record by accident, which is story 18's own sentence, and it was a
   * populated and confident answer rather than a missing one.
   *
   * **What it reports now.** Still answered — the question *is* settled as far
   * as anyone has taken it, and pretending otherwise would be its own lie — but
   * `provisional` rather than `established`, and the closure says what it rests
   * on. A reader asking "what do we actually know" no longer gets scratch mixed
   * in silently.
   */
  test("Afterward 1: a question settled on scratch is answered provisionally, not established", async () => {
    const { enquiry, analysis } = await scratchExploration();
    await session.closeEnquiry({ enquiry, answeredBy: { analysis, proposition: PROPOSITION } });

    const reader = await afterwards();
    const status = await reader.enquiryStatus(enquiry);
    expect(status.closure).toBe("answered");
    expect(status.answer).toBe("yes");
    expect(status.restsOn).toBe("exploratory");

    const known = await reader.whatIsKnown();
    expect(known.established).toEqual([]);
    expect(known.provisional.map((q) => q.asks)).toEqual([QUESTION]);
  });

  /**
   * Afterward 2. Promotion is an act, and it happens *after* the work — which
   * is the whole premise. The researcher could not have declared confirmatory
   * standing when the notebook sweep was recorded, because they did not yet
   * know it mattered.
   */
  test("Afterward 2: promoting is an act taken later, with a reason", async () => {
    const { enquiry, analysis } = await scratchExploration();

    await session.promote({
      claim: { analysis, proposition: PROPOSITION },
      because: "re-run under seed control on the held-out split, same direction and magnitude",
    });

    const reader = await afterwards();
    const why = await reader.whySupported({ analysis, proposition: PROPOSITION });
    expect(why.standing).toBe("confirmatory");
    expect(why.promotedBecause).toBe(
      "re-run under seed control on the held-out split, same direction and magnitude",
    );

    await session.closeEnquiry({ enquiry, answeredBy: { analysis, proposition: PROPOSITION } });
    const known = await (await afterwards()).whatIsKnown();
    expect(known.established.map((q) => q.asks)).toEqual([QUESTION]);
    expect(known.provisional).toEqual([]);
  });

  /**
   * Afterward 3. The scratch is still there. Promotion does not rewrite what
   * happened — the lunchtime sweep is still what the finding rests on, and the
   * record must not pretend it was always careful work.
   */
  test("Afterward 3: promotion does not erase what the finding actually rests on", async () => {
    const { analysis } = await scratchExploration();
    await session.promote({
      claim: { analysis, proposition: PROPOSITION },
      because: "re-run under seed control on the held-out split, same direction and magnitude",
    });

    const why = await (await afterwards()).whySupported({ analysis, proposition: PROPOSITION });
    expect(why.support.map((s) => ({ finding: s.finding, method: s.method }))).toEqual([
      { finding: "convergence point moves by ~3 steps", method: "notebook-sweep" },
    ]);
    expect(why.restingOn.map((a) => a.name)).toEqual(["lunchtime sweep"]);
    // And promoting must not read as retracting. `CHANGES: Decision -> Claim`
    // means "withdrawn" to `withdrawalOf()` (S-12), so reusing it for
    // promotion makes a promoted finding report as no longer asserted.
    expect(why.withdrawn).toBe(false);
    expect(why.supported).toBe(true);
  });

  /**
   * The control. Cheap capture must stay cheap: recording scratch takes no
   * ceremony, and an unpromoted finding is not a *failure*, it is simply not
   * confirmatory. PJ-001's "should not accumulate ceremony" bullet, from the
   * other side of S-14.
   */
  test("scratch that nobody promotes is provisional, not wrong", async () => {
    const { analysis } = await scratchExploration();

    const why = await (await afterwards()).whySupported({ analysis, proposition: PROPOSITION });
    expect(why.supported).toBe(true);
    expect(why.standing).toBe("exploratory");
    expect(why.promotedBecause).toBeUndefined();
    expect(why.challenged).toBe(false);
    expect(why.unmet.map((u) => u.requires)).toEqual([]);
  });

  /**
   * Promotion is about a claim, and a claim is identified by its proposition
   * within a line of enquiry — S-5, reaching standing. Two programmes can
   * explore the same sentence, and promoting one must not promote the other.
   */
  test("promoting one line of enquiry's finding does not promote another's", async () => {
    const { analysis } = await scratchExploration();

    const other = await session.openEnquiry("does the pruning schedule change convergence on the small model?");
    const otherObservations = await session.recordObservations({
      enquiry: other,
      name: "small-model sweep",
      finding: "eight runs, small model",
    });
    const otherAnalysis = await session.recordAnalysis({
      enquiry: other,
      method: "notebook-sweep",
      from: [otherObservations],
      concludes: [{ proposition: PROPOSITION, finding: "convergence point moves by ~1 step" }],
    });

    await session.promote({
      claim: { analysis, proposition: PROPOSITION },
      because: "re-run under seed control on the held-out split",
    });

    const reader = await afterwards();
    expect((await reader.whySupported({ analysis, proposition: PROPOSITION })).standing).toBe("confirmatory");
    expect((await reader.whySupported({ analysis: otherAnalysis, proposition: PROPOSITION })).standing).toBe(
      "exploratory",
    );
  });
});
