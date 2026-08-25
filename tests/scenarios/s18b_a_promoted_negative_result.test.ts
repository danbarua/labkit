/**
 * S-18b — "The answer is no, and somebody vouched for it."
 * External peer review of PR #2, merge blocker 2. An S-4 × S-18 overlap.
 *
 * S-4 established that a question can be substantively answered **no**, by
 * evidence that `CHALLENGES` the claim answering it. S-18 established that
 * `promote()` moves a finding from scratch to citable. Each has a scenario;
 * neither crosses the other, and the reviewer predicted the crossing is broken:
 *
 * > three read paths still discover the promoted closing claim using only
 * > `Evidence -SUPPORTS-> Claim`, not `CHALLENGES`.
 *
 * A negative result somebody checked and vouched for is an ordinary and
 * valuable thing — arguably the most valuable kind — and reporting it as
 * resting on scratch tells a reader not to build on it. That is the same
 * SUPPORTS-only assumption already fixed twice in this codebase, in `scopeOf`
 * and in `closeEnquiry`'s ownership check, surviving in the read layer.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";

let scenario: Scenario;
let session: ResearchSession;

const NOW = "2026-08-24T14:00:00.000Z";
const clock: Clock = { now: () => NOW };

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

const ASKS = "does the coating reduce fatigue cracking?";
const PROP = "the coating reduces fatigue cracking";

/** A question answered *no*, on a finding somebody then vouched for. */
async function aVouchedForNo() {
  const enquiry = await session.openEnquiry(ASKS);
  const observations = await session.recordObservations({
    enquiry,
    name: "cycle counts",
    finding: "forty coupons, coated and bare",
  });
  const { claims } = await session.recordAnalysis({
    enquiry,
    method: "survival comparison",
    from: [observations],
    concludes: [
      {
        proposition: PROP,
        finding: "no separation at any cycle count",
        bearing: "challenges",
      },
    ],
  });
  const claim = claimOf(claims, PROP);
  await session.promote({
    claim,
    because: "re-counted blind by a second reader",
  });
  await session.closeEnquiry({ enquiry, answeredBy: claim });
  return { enquiry, claim };
}

describe("S-18b — a negative result that somebody vouched for", () => {
  test("the enquiry reports it answered no, resting on confirmatory work", async () => {
    const { enquiry } = await aVouchedForNo();
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });

    const status = await later.enquiryStatus(enquiry);
    expect(status.question?.answer).toBe("no");
    // The promotion happened and is what a reader deciding whether to build on
    // this needs to see. `exploratory` here says nobody vouched for it.
    expect(status.question?.restsOn).toBe("confirmatory");
  });

  test("the survey counts it as established, not as resting on scratch", async () => {
    await aVouchedForNo();
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });

    const known = await later.whatIsKnown();
    expect(known.established.map((q) => q.asks)).toContain(ASKS);
    expect(known.provisional.map((q) => q.asks)).not.toContain(ASKS);
  });

  test("and the historical survey agrees with the current one", async () => {
    await aVouchedForNo();
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });

    // Same SUPPORTS-only shape, one query over. Asked at an instant after the
    // promotion and the closure.
    const then = await later.whatWasKnown(NOW);
    expect(then.established.map((q) => q.asks)).toContain(ASKS);
    expect(then.provisional.map((q) => q.asks)).not.toContain(ASKS);
  });

  /**
   * The control. A negative result nobody promoted must still read as scratch,
   * or the fix above would have made every closure look vouched-for.
   */
  test("an unpromoted negative result still reads as provisional", async () => {
    const enquiry = await session.openEnquiry("does the sealant reduce cracking?");
    const observations = await session.recordObservations({
      enquiry,
      name: "sealant counts",
      finding: "forty coupons",
    });
    const { claims } = await session.recordAnalysis({
      enquiry,
      method: "survival comparison",
      from: [observations],
      concludes: [
        {
          proposition: "the sealant reduces cracking",
          finding: "no separation",
          bearing: "challenges",
        },
      ],
    });
    await session.closeEnquiry({
      enquiry,
      answeredBy: claimOf(claims, "the sealant reduces cracking"),
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const status = await later.enquiryStatus(enquiry);
    expect(status.question?.answer).toBe("no");
    expect(status.question?.restsOn).toBe("exploratory");

    const known = await later.whatIsKnown();
    expect(known.provisional.map((q) => q.asks)).toContain("does the sealant reduce cracking?");
    expect(known.established.map((q) => q.asks)).not.toContain("does the sealant reduce cracking?");
  });
});
