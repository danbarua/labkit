/**
 * S-12b — "Two revision chains that meet at a sentence."
 * External review of PR #2, discriminator 4.
 *
 * A reinterpretation narrows a *reading*, and a reading two analyses reached
 * must be withdrawn in full. This asks the question one step along: when two
 * **independent** chains happen to pass through the same wording, can each
 * still be read back?
 *
 * The review's framing, which is this repo's own lesson arriving from outside:
 *
 * > same proposition text != same claim identity
 *
 * `interpretationHistory` took a handle and keyed its loop guard by id, but
 * each step found the previous claim by the *name* of the one after it. Two
 * chains sharing an intermediate wording is exactly what that cannot express:
 * both histories threw `is not a single line`, refusing a legitimate ask.
 *
 * **A prediction this refuted.** The queued row said walking by id "wants the
 * revision chain to carry an edge a caller can follow, which is a model
 * question rather than a projection". It wanted nothing of the sort. Every
 * step was already reachable by identity — `reinterpret` writes
 * `Decision -MOTIVATES-> narrower` and `Decision -CHANGES-> each withdrawn
 * claim`, both with natural ids — so the whole remedy was a different query
 * over structure that had been there since the verb was written. The row had
 * been sitting in "needs a model decision" on an assumption nobody checked.
 *
 * It also moved the `is not a single line` guard from a statement about
 * wording to one about structure: it now fires when a history *merges*, which
 * is a real thing to refuse, rather than when two unrelated chains happen to
 * read alike.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { recordAnalysis, replaceAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;

const clock: Clock = { now: () => "2026-08-24T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  session = new ResearchSession(await scenario.begin(), {
    clock,
    events: inMemoryEventLog(),
  });
});
afterEach(async () => {
  await scenario.end();
});

/** The sentence both chains pass through. Two claims, two enquiries, one wording. */
const SHARED = "the effect holds under condition X";

const A1 = "the effect holds";
const A3 = "the effect holds under condition X in subgroup Y";
const B1 = "the instrument drifts";
const B3 = "the instrument drifts above 40 degrees";

/** One enquiry, two readings that turn out to be the same, then narrowed once more. */
const LEFT = "the input queue fills";
const RIGHT = "the writer holds the lock";
const MET = "the sampler stalls at the batch boundary";
const NARROWER = "the sampler stalls at the batch boundary above eight workers";

/**
 * Two chains, three claims each, meeting only at their middle wording.
 *
 * Different lines of enquiry, so nothing about this is a duplicate reading:
 * these are two programmes that happened to arrive at the same sentence,
 * which is the ordinary case rather than a collision.
 */
async function twoChains() {
  const chain = async (opens: string, first: string, middle: string, last: string) => {
    const { enquiry } = await session.openEnquiry(opens);
    const { observations } = await session.recordObservations({
      enquiry,
      name: `${opens} readings`,
      finding: "measured",
    });
    const { claims } = await recordAnalysis(session, {
      enquiry,
      method: "fit",
      from: [observations],
      concludes: [{ proposition: first, finding: `${first}, on the fit` }],
    });
    const narrowed = await session.reinterpret({
      of: claimOf(claims, first),
      as: middle,
      because: "the fit only covers condition X",
    });
    const narrower = await session.reinterpret({
      of: narrowed.nowClaims.claim,
      as: last,
      because: "and only in that subgroup",
    });
    return {
      enquiry,
      first: claimOf(claims, first),
      middle: narrowed.nowClaims,
      last: narrower.nowClaims,
    };
  };

  const a = await chain("does the effect hold?", A1, SHARED, A3);
  const b = await chain("does the instrument drift?", B1, SHARED, B3);
  return { a, b };
}

describe("S-12b — two revision chains that pass through one sentence", () => {
  test("the two middle claims are different records that read alike", async () => {
    const { a, b } = await twoChains();
    expect(a.middle.asserts).toBe(SHARED);
    expect(b.middle.asserts).toBe(SHARED);
    expect(a.middle.claim).not.toBe(b.middle.claim);
  });

  test("each history reads back its own chain, and none of the other's", async () => {
    const { a, b } = await twoChains();
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });

    const historyA = await later.interpretationHistory(a.last.claim);
    expect(historyA.revisions.map((r) => r.nowClaims.asserts)).toEqual([SHARED, A3]);
    expect(historyA.originally.map((c) => c.claim)).toEqual([a.first]);
    // The step through the shared wording is A's record, not B's.
    expect(historyA.revisions[1]!.previously.map((c) => c.claim)).toEqual([a.middle.claim]);

    const historyB = await later.interpretationHistory(b.last.claim);
    expect(historyB.revisions.map((r) => r.nowClaims.asserts)).toEqual([SHARED, B3]);
    expect(historyB.originally.map((c) => c.claim)).toEqual([b.first]);
    expect(historyB.revisions[1]!.previously.map((c) => c.claim)).toEqual([b.middle.claim]);
  });
});

/**
 * Two readings inside **one** enquiry that were separately narrowed to the
 * same sentence, and then narrowed again together.
 *
 * `reinterpret` withdraws every claim in scope asserting the reading it
 * replaces, so the last act takes both branches at once and the history
 * behind it is a merge rather than a line.
 */
async function twoBranchesThatMeet() {
  const { enquiry } = await session.openEnquiry("why does the sampler stall?");
  const { observations } = await session.recordObservations({
    enquiry,
    name: "stall traces",
    finding: "measured",
  });
  const { claims } = await recordAnalysis(session, {
    enquiry,
    method: "fit",
    from: [observations],
    concludes: [
      { proposition: LEFT, finding: `${LEFT}, on the fit` },
      { proposition: RIGHT, finding: `${RIGHT}, on the fit` },
    ],
  });
  const viaLeft = await session.reinterpret({
    of: claimOf(claims, LEFT),
    as: MET,
    because: "the queue only fills at the boundary",
  });
  const viaRight = await session.reinterpret({
    of: claimOf(claims, RIGHT),
    as: MET,
    because: "the lock is only held at the boundary",
  });
  const after = await session.reinterpret({
    of: viaLeft.nowClaims.claim,
    as: NARROWER,
    because: "and only above eight workers",
  });
  return {
    left: claimOf(claims, LEFT),
    right: claimOf(claims, RIGHT),
    viaLeft: viaLeft.nowClaims,
    viaRight: viaRight.nowClaims,
    after: after.nowClaims,
  };
}

describe("S-12b — a history that merges", () => {
  /**
   * **Researcher:** Two separate readings turned out to be the same thing, and
   * I narrowed that once more. Show me how I got here.
   *
   * **Agent:** Both branches, and the act that joined them. Neither branch is
   * older than the other and I do not pretend one is.
   */
  test("a merge is answered with both branches, not refused", async () => {
    const { left, right, viaLeft, viaRight, after } = await twoBranchesThatMeet();
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });

    const history = await later.interpretationHistory(after.claim);

    // The last act withdrew both branches at once, which is what makes this a
    // merge rather than two histories.
    const joining = history.revisions.find((r) => r.nowClaims.claim === after.claim)!;
    expect(joining.previously.map((c) => c.claim).sort()).toEqual(
      [viaLeft.claim, viaRight.claim].sort(),
    );

    // Both first readings are where this started. Reporting one would name a
    // branch the record does not rank.
    expect(history.originally.map((c) => c.claim).sort()).toEqual([left, right].sort());
    expect(history.revisions).toHaveLength(3);
  });

  /**
   * The same shape one act shorter, which does **not** throw today and answers
   * wrong: one branch is a claim nobody narrowed, so the walk finds no decision
   * for it and drops it out of `originally` without saying so.
   */
  test("a branch that was never narrowed is still where the reading started", async () => {
    const { enquiry } = await session.openEnquiry("why does the sampler stall?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "stall traces",
      finding: "measured",
    });
    const { claims } = await recordAnalysis(session, {
      enquiry,
      method: "fit",
      from: [observations],
      concludes: [
        { proposition: LEFT, finding: `${LEFT}, on the fit` },
        { proposition: MET, finding: `${MET}, read straight off the fit` },
      ],
    });
    const narrowed = await session.reinterpret({
      of: claimOf(claims, LEFT),
      as: MET,
      because: "the queue only fills at the boundary",
    });
    const after = await session.reinterpret({
      of: narrowed.nowClaims.claim,
      as: NARROWER,
      because: "and only above eight workers",
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const history = await later.interpretationHistory(after.nowClaims.claim);

    // Two readings were withdrawn together: the one this chain narrowed to, and
    // one an analysis concluded outright. The second was never narrowed, so no
    // decision leads back from it -- and it is still a reading this history
    // started from.
    expect(history.originally.map((c) => c.claim).sort()).toEqual(
      [claimOf(claims, LEFT), claimOf(claims, MET)].sort(),
    );
  });

  /**
   * The degenerate case the merge rule has to keep right: a claim nobody
   * narrowed started from nothing, because nothing was withdrawn to reach it.
   */
  test("a claim nobody narrowed has no revisions and nothing behind it", async () => {
    const { enquiry } = await session.openEnquiry("why does the sampler stall?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "stall traces",
      finding: "measured",
    });
    const { claims } = await recordAnalysis(session, {
      enquiry,
      method: "fit",
      from: [observations],
      concludes: [{ proposition: LEFT, finding: `${LEFT}, on the fit` }],
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const history = await later.interpretationHistory(claimOf(claims, LEFT));
    expect(history.revisions).toEqual([]);
    expect(history.originally).toEqual([]);
    expect(history.nowClaims.claim).toBe(claimOf(claims, LEFT));
  });
});

/** One reading, narrowed; then the same sentence concluded afresh. */
const ONCE = "the sampler stalls";
const NARROWED_ONCE = "the sampler stalls at the batch boundary under load";
const NARROWED_AGAIN = "the sampler stalls at the batch boundary above eight workers";

describe("S-12b — a reading is narrowed once", () => {
  /**
   * **Researcher:** I narrowed that reading last week and forgot. What happens
   * if I narrow it again?
   *
   * **Agent:** Refused, with the reading that stands in its place. Two
   * narrowings of one reading would put two successors on it with nothing
   * saying which the record now asserts.
   */
  test("a reading that has already been narrowed is refused, naming what stands instead", async () => {
    const { enquiry } = await session.openEnquiry("why does the sampler stall?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "stall traces",
      finding: "measured",
    });
    const { claims } = await recordAnalysis(session, {
      enquiry,
      method: "fit",
      from: [observations],
      concludes: [{ proposition: ONCE, finding: `${ONCE}, on the fit` }],
    });
    const original = claimOf(claims, ONCE);
    const narrowed = await session.reinterpret({
      of: original,
      as: NARROWED_ONCE,
      because: "the fit only covers the boundary",
    });

    await expect(
      session.reinterpret({
        of: original,
        as: NARROWED_AGAIN,
        because: "and only above eight workers",
      }),
    ).rejects.toThrow(new RegExp(`no longer stands[\\s\\S]*${narrowed.nowClaims.claim}`));

    // Nothing was written: the reading still has exactly one successor.
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const history = await later.interpretationHistory(narrowed.nowClaims.claim);
    expect(history.revisions).toHaveLength(1);
    expect(history.originally.map((c) => c.claim)).toEqual([original]);
  });

  /**
   * Why only the named claim is checked, and not every claim the wording match
   * returns.
   *
   * A reading is withdrawn in full — `reinterpret` takes every claim in scope
   * asserting it — and `recordAnalysis` refuses to put the sentence back. So
   * within one scope the claims asserting a reading are standing together or
   * withdrawn together, and a withdrawn one cannot sit in the match beside a
   * standing one. Without this, the guard above would need a filter over the
   * whole match, and that filter would be one nothing could make fire.
   */
  test("a withdrawn reading cannot be put back, so the match never mixes the two", async () => {
    const { enquiry } = await session.openEnquiry("why does the sampler stall?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "stall traces",
      finding: "measured",
    });
    const { claims: first } = await recordAnalysis(session, {
      enquiry,
      method: "fit",
      from: [observations],
      concludes: [{ proposition: ONCE, finding: `${ONCE}, on the first fit` }],
    });
    const narrowed = await session.reinterpret({
      of: claimOf(first, ONCE),
      as: NARROWED_ONCE,
      because: "the fit only covers the boundary",
    });

    await expect(
      recordAnalysis(session, {
        enquiry,
        method: "refit",
        from: [observations],
        concludes: [{ proposition: ONCE, finding: `${ONCE}, on the refit` }],
      }),
    ).rejects.toThrow(
      new RegExp(`was withdrawn in favour of "${NARROWED_ONCE}" \\(${narrowed.nowClaims.claim}\\)`),
    );
  });

  /**
   * A finding can stop standing without its reading ever being narrowed:
   * replacing the analysis supersedes the claim instead. Both acts leave a
   * reading nobody should narrow, and AGE has no edge alternation, so the two
   * predicates are two clauses and reading one is silent.
   */
  test("a reading whose finding was superseded is refused too, not only a narrowed one", async () => {
    const { enquiry } = await session.openEnquiry("why does the sampler stall?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "stall traces",
      finding: "measured",
    });
    const { analysis, claims } = await recordAnalysis(session, {
      enquiry,
      method: "fit",
      from: [observations],
      concludes: [{ proposition: ONCE, finding: `${ONCE}, on the fit` }],
    });
    const { review } = await session.recordReview({
      of: analysis,
      verdict: "the fit was taken over the wrong window",
    });
    const replacement = await replaceAnalysis(session, {
      supersedes: analysis,
      because: review,
      enquiry,
      method: "refit over the right window",
      from: [observations],
      concludes: [{ proposition: ONCE, finding: `${ONCE}, on the refit` }],
    });

    await expect(
      session.reinterpret({
        of: claimOf(claims, ONCE),
        as: NARROWED_ONCE,
        because: "narrowing a finding that no longer stands",
      }),
      // The successor is named: `conclude` recorded the replacement standing
      // in place of the finding it re-answered, so the refusal can say where
      // to go instead of only that the claim fell.
    ).rejects.toThrow(new RegExp(`no longer stands[\\s\\S]*${claimOf(replacement.claims, ONCE)}`));
  });
});
