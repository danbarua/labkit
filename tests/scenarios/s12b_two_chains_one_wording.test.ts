/**
 * S-12b — "Two revision chains that meet at a sentence."
 * External review of PR #2, discriminator 4.
 *
 * S-12 established that a reinterpretation narrows a *reading*, and that a
 * reading two analyses reached must be withdrawn in full. This asks the
 * question one step along: when two **independent** chains happen to pass
 * through the same wording, can each still be read back?
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
import { recordAnalysis } from "../../fragments";

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

/**
 * Two chains, three claims each, meeting only at their middle wording.
 *
 * Different lines of enquiry, so nothing about this is a duplicate reading:
 * these are two programmes that happened to arrive at the same sentence, which
 * S-5 already established is the ordinary case rather than a collision.
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
