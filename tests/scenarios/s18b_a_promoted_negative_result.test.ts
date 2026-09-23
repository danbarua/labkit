/**
 * S-18b — "The answer is no, and somebody vouched for it."
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

const NOW = "2026-08-24T14:00:00.000Z";
const clock: Clock = { now: () => NOW };

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

const ASKS = "does the coating reduce fatigue cracking?";
const PROP = "the coating reduces fatigue cracking";

/** A question answered *no*, on a finding somebody then vouched for. */
async function aVouchedForNo() {
  const { enquiry } = await session.writes.openEnquiry(ASKS);
  const { observations } = await session.writes.recordObservations({
    enquiry,
    name: "cycle counts",
    finding: "forty coupons, coated and bare",
  });
  const { claims } = await recordAnalysis(session.writes, {
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
  await session.writes.isConfirmed({
    claim,
    because: "re-counted blind by a second reader",
  });
  await session.writes.closeEnquiry({ enquiry, answeredBy: claim });
  return { enquiry, claim };
}

describe("S-18b — a negative result that somebody vouched for", () => {
  test("the enquiry reports it answered no, resting on confirmatory work", async () => {
    const { enquiry } = await aVouchedForNo();
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });

    const status = await later.reads.enquiryStatus({ enquiry });
    expect(status.bearing).toBe("challenges");
    // The promotion happened and is what a reader deciding whether to build on
    // this needs to see. `exploratory` here says nobody vouched for it.
    expect(status.restsOn).toBe("confirmatory");

    await captureConversation(
      {
        id: "S-18b",
        title: "A negative result that somebody vouched for",
        about:
          "A coating turns out not to work, a second reader confirms the counts, and the question closes as answered no on work somebody vouched for.",
      },
      events,
    );
  });

  test("the survey counts it as established, not as resting on scratch", async () => {
    await aVouchedForNo();
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });

    const known = await later.reads.whatIsKnown();
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
    const then = await later.reads.whatWasKnown({ at: NOW });
    expect(then.established.map((q) => q.asks)).toContain(ASKS);
    expect(then.provisional.map((q) => q.asks)).not.toContain(ASKS);
  });

  /**
   * The control. A negative result nobody promoted must still read as scratch,
   * or the fix above would have made every closure look vouched-for.
   */
  test("an unpromoted negative result still reads as provisional", async () => {
    const { enquiry } = await session.writes.openEnquiry("does the sealant reduce cracking?");
    const { observations } = await session.writes.recordObservations({
      enquiry,
      name: "sealant counts",
      finding: "forty coupons",
    });
    const { claims } = await recordAnalysis(session.writes, {
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
    await session.writes.closeEnquiry({
      enquiry,
      answeredBy: claimOf(claims, "the sealant reduces cracking"),
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const status = await later.reads.enquiryStatus({ enquiry });
    expect(status.bearing).toBe("challenges");
    expect(status.restsOn).toBe("exploratory");

    const known = await later.reads.whatIsKnown();
    expect(known.provisional.map((q) => q.asks)).toContain("does the sealant reduce cracking?");
    expect(known.established.map((q) => q.asks)).not.toContain("does the sealant reduce cracking?");
  });
});
