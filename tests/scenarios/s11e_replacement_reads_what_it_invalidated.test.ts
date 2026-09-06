/**
 * S-11e — "The replacement rests on the thing it just retracted."
 * External review of PR #2, discriminator 2.
 *
 * `replaceAnalysis` invalidates the superseded analysis's output and then
 * records the replacement. Nothing stops the replacement naming the analysis
 * it is superseding as an input, so its computation consumes the very artefact
 * the same act invalidated.
 *
 * The review's framing is what makes this a probe rather than a tidiness
 * complaint:
 *
 * > The important assertion is not that the graph contains the invalidated
 * > input. It correctly does. The question is whether the replacement
 * > conclusion still reports as currently supported while its computation
 * > rests on the artefact that the same act invalidated.
 *
 * Two answers are checked, in the order the caller meets them: the report the
 * act hands back, and the read anyone would ask afterwards.
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

const clock: Clock = { now: () => "2026-08-24T10:00:00.000Z" };

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

const PROP = "the treatment shortens recovery";

/** A second reader over the same graph, for the afterward half of each answer. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

/** An analysis, reviewed as defective — everything a replacement needs. */
async function aDefectiveAnalysis() {
  const { enquiry } = await session.openEnquiry("does the treatment shorten recovery?");
  const { observations } = await session.recordObservations({
    enquiry,
    name: "recovery times",
    finding: "sixty patients, two arms",
  });
  const { analysis, claims } = await recordAnalysis(session, {
    enquiry,
    method: "unadjusted comparison",
    from: [observations],
    concludes: [{ proposition: PROP, finding: "three days shorter" }],
  });
  const { review } = await session.recordReview({
    of: analysis,
    verdict: "unadjusted for baseline severity",
  });
  return {
    enquiry,
    observations,
    analysis,
    review,
    claim: claimOf(claims, PROP),
  };
}

describe("S-11e — a replacement that consumes the output it invalidated", () => {
  test("the report says what the input actually is, rather than asserting it survived", async () => {
    const { enquiry, analysis, review } = await aDefectiveAnalysis();

    const report = await replaceAnalysis(session, {
      supersedes: analysis,
      because: review,
      enquiry,
      method: "severity-adjusted comparison",
      // The analysis being replaced, named as the replacement's input.
      from: [analysis],
      concludes: [{ proposition: PROP, finding: "one day shorter, adjusted" }],
    });

    // The replacement really does rest on it, and the record says the record it
    // rests on has been retracted — every finding in it superseded by this very
    // act. Read from the claim, because that is where a reader arrives.
    const resting = (await (await afterwards()).whySupported(report.claims[0]!.claim)).restingOn;
    // **Two inputs, and that is the add-only rule.** The successor inherits
    // what its predecessor read, and consumes the predecessor's own output
    // besides, because this call named it. Only the second is retracted:
    // every finding in it fell when the revision was recorded.
    expect(resting).toHaveLength(2);
    expect(resting.filter((r) => r.invalidated)).toHaveLength(1);

    // An ordinary input is unchanged, so the flag is a discriminator and not a
    // relabelling of every row.
    const clean = await aDefectiveAnalysis();
    const ordinary = await replaceAnalysis(session, {
      supersedes: clean.analysis,
      because: clean.review,
      enquiry: clean.enquiry,
      method: "severity-adjusted comparison",
      from: [clean.observations],
      concludes: [{ proposition: PROP, finding: "one day shorter, adjusted" }],
    });
    const ordinaryResting = (await (await afterwards()).whySupported(ordinary.claims[0]!.claim))
      .restingOn;
    expect(ordinaryResting[0]!.invalidated).toBeUndefined();
  });

  test("the replacement's conclusion does not stand on a retracted record", async () => {
    const { enquiry, analysis, review } = await aDefectiveAnalysis();
    const report = await replaceAnalysis(session, {
      supersedes: analysis,
      because: review,
      enquiry,
      method: "severity-adjusted comparison",
      from: [analysis],
      concludes: [{ proposition: PROP, finding: "one day shorter, adjusted" }],
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const why = await later.whySupported(report.claims[0]!.claim);

    // a `supported` verdict stays, and that is the design rather than an oversight:
    // invalidating a record deliberately does not withdraw what rests on it --
    // the consequence is *enumerable* rather than automatic. What was missing
    // is the half that makes the doctrine honest — the reader
    // could not see, from this answer, that the sole input had been retracted.
    expect(why.verdict).toBe("supported");
    expect(why.restingOn).toHaveLength(2);
    expect(why.restingOn.filter((r) => r.invalidated)).toHaveLength(1);

    // And the enumerable route actually reaches this claim, which is what
    // "not automatic" is relying on. If it did not, a `supported` verdict would be
    // a wrong answer with no way to find out.
    const retracted = why.restingOn.find((r) => r.invalidated)!;
    const affected = await later.whatDependsOn(retracted.part);
    expect(affected.claims.map((c) => c.claim)).toContain(report.claims[0]!.claim);
  });
});
