/**
 * S-11e — "The replacement rests on the thing it just retracted." External review of PR #2,
 * discriminator 2.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { reanalyse, recordAnalysis } from "../helpers/analysis";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
/** The same graph, spoken to by the person who reviews rather than the one who ran it. */
let reviewer: ResearchSession;
let events: EventSink;

const clock: Clock = { now: () => "2026-08-24T10:00:00.000Z" };

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
  reviewer = new ResearchSession(graph, { clock, events, attribution: as("Reviewer") });
});
afterEach(async () => {
  await scenario.end();
});

const PROP = "the treatment shortens recovery";

/** A second reader over the same graph, for the afterward half of each answer. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

/** An analysis, with a reviewer's note that it is defective — everything a replacement needs. */
async function aDefectiveAnalysis() {
  const { enquiry } = await session.writes.openEnquiry("does the treatment shorten recovery?");
  const { observations } = await session.writes.recordObservations({
    enquiry,
    name: "recovery times",
    finding: "sixty patients, two arms",
  });
  const { analysis, claims } = await recordAnalysis(session.writes, {
    enquiry,
    method: "unadjusted comparison",
    from: [observations],
    concludes: [{ proposition: PROP, finding: "three days shorter" }],
  });
  await reviewer.writes.note({ text: "unadjusted for baseline severity", on: analysis });
  return {
    enquiry,
    observations,
    analysis,
    claim: claimOf(claims, PROP),
  };
}

describe("S-11e — a replacement that consumes the output it invalidated", () => {
  test("the report says what the input actually is, rather than asserting it survived", async () => {
    const { enquiry, observations, analysis, claim } = await aDefectiveAnalysis();

    const report = await reanalyse(session.writes, {
      enquiry,
      method: "severity-adjusted comparison",
      // The analysis being replaced, named as the replacement's input.
      from: [observations, analysis],
      concludes: [{ proposition: PROP, finding: "one day shorter, adjusted", replacing: claim }],
    });

    // The replacement really does rest on it, and the record says the record it
    // rests on has been retracted — every finding in it superseded by this very
    // act. Read from the claim, because that is where a reader arrives.
    const resting = (
      await (await afterwards()).reads.whySupported({ claim: report.claims[0]!.claim })
    ).restingOn;
    // Two inputs: the observations, and the predecessor's own output. Only the
    // second is retracted: every finding in it fell when the replacement named it.
    expect(resting).toHaveLength(2);
    expect(resting.filter((r) => r.invalidated)).toHaveLength(1);

    // An ordinary input is unchanged, so the flag is a discriminator and not a
    // relabelling of every row.
    const clean = await aDefectiveAnalysis();
    const ordinary = await reanalyse(session.writes, {
      enquiry: clean.enquiry,
      method: "severity-adjusted comparison",
      from: [clean.observations],
      concludes: [
        { proposition: PROP, finding: "one day shorter, adjusted", replacing: clean.claim },
      ],
    });
    const ordinaryResting = (
      await (await afterwards()).reads.whySupported({ claim: ordinary.claims[0]!.claim })
    ).restingOn;
    expect(ordinaryResting[0]!.invalidated).toBeUndefined();
  });

  test("the replacement's conclusion does not stand on a retracted record", async () => {
    const { enquiry, observations, analysis, claim } = await aDefectiveAnalysis();
    const report = await reanalyse(session.writes, {
      enquiry,
      method: "severity-adjusted comparison",
      from: [observations, analysis],
      concludes: [{ proposition: PROP, finding: "one day shorter, adjusted", replacing: claim }],
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const why = await later.reads.whySupported({ claim: report.claims[0]!.claim });

    // A `supported` verdict stays: retracting a record does not withdraw what rests
    // on it. The answer says which input was retracted instead.
    expect(why.verdict).toBe("supported");
    expect(why.restingOn).toHaveLength(2);
    expect(why.restingOn.filter((r) => r.invalidated)).toHaveLength(1);

    await captureConversation(
      {
        id: "S-11e",
        title: "A replacement that consumes the output it invalidated",
        about:
          "A replacement analysis is built on the very analysis a review found defective. Its conclusion still reads as supported, and the record names the retracted input rather than hiding it.",
      },
      events,
      why,
    );
  });
});
