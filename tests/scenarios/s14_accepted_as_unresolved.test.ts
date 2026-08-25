/**
 * S-14 — "Deliberately leaving something unresolved."
 * docs/project-journal/008_user_story_mining.md, §2 and §3 row J
 *
 * A marginal comparison that cannot be settled: the confirmatory dataset is
 * spent and there is no larger held-out sample. The researcher does not want it
 * pursued, and does not want it closed. They want it *accepted* as unresolved,
 * with the condition that would reopen it written down.
 *
 * The trap this scenario exists to catch is named in §2: a model that can only
 * express this as an open task has failed. So no `Task` is created anywhere
 * below, and none may be needed to make a query answer correctly — PJ-001's
 * "should not accumulate ceremony" bullet, made executable.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

let tick = 0;
const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 7, 20, 9, tick++)).toISOString(),
};

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  tick = 0;
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events });
});
afterEach(async () => {
  await scenario.end();
});

/** A second reader over the same graph — see tests/helpers/scenario.ts. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

const MARGINAL = "does the accelerated variant beat the reference on the marginal split?";
const PROPOSITION = "the accelerated variant beats the reference on the marginal split";
const CONDITION = "a genuinely new design, or a data source other than the spent confirmatory set";

/**
 * Researcher: "We ran it. It's marginal, and the confirmatory data is gone."
 *
 * Work was done — this is not a question nobody reached. That distinction is
 * the whole point of the first Afterward bullet.
 */
async function aMarginalComparisonWithNothingLeftToRunIt() {
  const enquiry = await session.openEnquiry(MARGINAL);
  const observations = await session.recordObservations({
    enquiry,
    name: "marginal split results",
    finding: "per-image accuracy on the marginal split",
  });
  const { analysis: analysis, claims: analysisClaims } = await session.recordAnalysis({
    enquiry,
    method: "paired-comparison",
    from: [observations],
    concludes: [{ proposition: PROPOSITION, finding: "difference 0.4%, CI spans zero" }],
  });
  return { enquiry, observations, analysis, analysisClaims };
}

describe("S-14: deliberately leaving something unresolved", () => {
  /**
   * Afterward 1. "Is this question open?" — yes, and *accepted* as open. Three
   * states where the model had two: closed, awaiting work, and accepted.
   *
   * Before this scenario the third was unreachable. `enquiryStatus()` could
   * report `closure: "deferred"` and no verb had ever written the edge behind
   * it, so an accepted question and an untouched one returned the same answer.
   */
  test("Afterward 1: accepted-as-open is a state of its own, not 'still being worked'", async () => {
    const { enquiry, analysis, analysisClaims } = await aMarginalComparisonWithNothingLeftToRunIt();

    const stillWorking = await session.enquiryStatus(enquiry);
    expect(stillWorking.question!.open).toBe(true);
    expect(stillWorking.question!.closure).toBeNull();

    await session.acceptAsUnresolved({
      enquiry,
      because: "the confirmatory dataset is spent and there is no larger held-out sample",
      until: CONDITION,
      inLightOf: claimOf(analysisClaims, PROPOSITION),
    });

    const status = await (await afterwards()).enquiryStatus(enquiry);
    expect(status.question!.open).toBe(true);
    expect(status.question!.closure).toBe("accepted-as-unresolved");
    // Not answered. Accepting a question is not deciding it.
    expect(status.question!.answer).toBeNull();
  });

  /**
   * Afterward 2. "Does it block anything?" — no, and nothing was invented to
   * make that true. The record must not have produced a to-do item whose only
   * purpose is turning the survey green.
   */
  test("Afterward 2: accepting creates no work, and the survey stops calling it pending", async () => {
    const { enquiry, analysis, analysisClaims } = await aMarginalComparisonWithNothingLeftToRunIt();
    await session.acceptAsUnresolved({
      enquiry,
      because: "the confirmatory dataset is spent and there is no larger held-out sample",
      until: CONDITION,
      inLightOf: claimOf(analysisClaims, PROPOSITION),
    });

    const reader = await afterwards();
    const known = await reader.whatIsKnown();
    // Neither established nor awaiting work. A fourth bucket, because
    // "accepted" is not "unresolved" in the sense the survey meant.
    expect(known.established.map((q) => q.asks)).not.toContain(MARGINAL);
    expect(known.unresolved.map((q) => q.asks)).not.toContain(MARGINAL);
    expect(known.untested.map((q) => q.asks)).not.toContain(MARGINAL);
    expect(known.accepted.map((q) => q.asks)).toEqual([MARGINAL]);

    // The ceremony test is that nothing above needed a `Task` to come out
    // right, and none was created. A `blocking: []` field was drafted here and
    // removed: its only consumer would have been this assertion, which is
    // inventing API to satisfy a test — and inventing a to-do list in order to
    // report it empty is precisely the ceremony the scenario forbids. The
    // survey putting this question outside `unresolved` is the observable
    // claim, and it is made above.
  });

  /**
   * Afterward 3. "What would change this?" — the named condition, and it must
   * be about the world rather than about running the same analysis again.
   */
  test("Afterward 3: the condition that would reopen it is recorded, and is not 'more analysis'", async () => {
    const { enquiry, analysis, analysisClaims } = await aMarginalComparisonWithNothingLeftToRunIt();
    await session.acceptAsUnresolved({
      enquiry,
      because: "the confirmatory dataset is spent and there is no larger held-out sample",
      until: CONDITION,
      inLightOf: claimOf(analysisClaims, PROPOSITION),
    });

    const status = await (await afterwards()).enquiryStatus(enquiry);
    expect(status.question!.reopensIf).toBe(CONDITION);
  });

  /**
   * Afterward 4. "Why was it accepted rather than pursued?" — the exhausted
   * dataset, recorded, and the finding it was accepted in light of.
   *
   * Asserted from durable state with the event log empty, as S-1 established:
   * a reason that survives only in the event stream has not been recorded.
   */
  test("Afterward 4: the reasoning survives, and so does what was known at the time", async () => {
    const { enquiry, analysis, analysisClaims } = await aMarginalComparisonWithNothingLeftToRunIt();
    await session.acceptAsUnresolved({
      enquiry,
      because: "the confirmatory dataset is spent and there is no larger held-out sample",
      until: CONDITION,
      inLightOf: claimOf(analysisClaims, PROPOSITION),
    });

    const status = await (await afterwards()).enquiryStatus(enquiry);
    expect(status.question!.acceptedBecause).toBe(
      "the confirmatory dataset is spent and there is no larger held-out sample",
    );
    expect(status.question!.evidence.map((e) => e.states)).toEqual([
      "difference 0.4%, CI spans zero",
    ]);
  });

  /**
   * The control, and the reason this is not just a relabelling: a question
   * genuinely awaiting work must still read that way. If accepting is
   * indistinguishable from not-yet-reached in either direction, nothing has
   * been gained.
   */
  test("a question nobody has accepted still reads as open work", async () => {
    const { enquiry } = await aMarginalComparisonWithNothingLeftToRunIt();

    const status = await (await afterwards()).enquiryStatus(enquiry);
    expect(status.question!.open).toBe(true);
    expect(status.question!.closure).toBeNull();
    expect(status.question!.reopensIf).toBeUndefined();

    const known = await (await afterwards()).whatIsKnown();
    expect(known.accepted).toEqual([]);
    expect(known.unresolved.map((q) => q.asks)).toEqual([MARGINAL]);
  });

  /**
   * Accepting is not closing, and the record must refuse to let it become so
   * by accident. A question accepted as unresolved that later *is* answered
   * has been answered — but the acceptance must not have pre-empted it.
   */
  test("an accepted question can still be answered later, and then reads as answered", async () => {
    const { enquiry, analysis, analysisClaims } = await aMarginalComparisonWithNothingLeftToRunIt();
    await session.acceptAsUnresolved({
      enquiry,
      because: "the confirmatory dataset is spent and there is no larger held-out sample",
      until: CONDITION,
      inLightOf: claimOf(analysisClaims, PROPOSITION),
    });

    // A new data source turns up -- the named condition, met.
    const fresh = await session.recordObservations({
      enquiry,
      name: "external replication cohort",
      finding: "per-image accuracy, independent cohort",
    });
    const { analysis: settled, claims: settledClaims } = await session.recordAnalysis({
      enquiry,
      method: "paired-comparison, external cohort",
      from: [fresh],
      concludes: [
        {
          proposition: PROPOSITION,
          finding: "difference 2.1%, CI excludes zero",
        },
      ],
    });
    await session.closeEnquiry({
      enquiry,
      answeredBy: claimOf(settledClaims, PROPOSITION),
    });

    const status = await (await afterwards()).enquiryStatus(enquiry);
    expect(status.question!.open).toBe(false);
    expect(status.question!.closure).toBe("answered");
    expect(status.question!.answer).toBe("yes");
  });

  /**
   * The wrong answer, against shipped behaviour, kept as the contrast that
   * gives `acceptAsUnresolved()` its meaning.
   *
   * This is not merely a missing feature manufacturing an empty result. A
   * researcher who wants the record to say "we are leaving this" has a verb
   * available today — `closeEnquiry()` with nothing cited — and it reports the
   * question **abandoned**: nobody worked on it, no result behind it. Work was
   * done, and the reason is specific and recorded nowhere. That is a confident
   * misreading of a deliberate decision as neglect, which is the worst
   * available answer rather than the absence of one.
   *
   * It still reports that, and correctly: abandoning is a real thing that
   * happens. What was missing was a way to say the other thing.
   */
  test("closing it without a result reads as abandoned, which is the opposite of accepted", async () => {
    const { enquiry } = await aMarginalComparisonWithNothingLeftToRunIt();

    await session.closeEnquiry({ enquiry });

    const status = await (await afterwards()).enquiryStatus(enquiry);
    expect(status.question!.open).toBe(false);
    expect(status.question!.closure).toBe("abandoned");
    // The work that was done, and the reason it stopped, are both absent.
    expect(status.question!.evidence).toEqual([]);
  });
});
