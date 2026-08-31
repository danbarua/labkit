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

/** An analysis, reviewed as defective — everything a replacement needs. */
async function aDefectiveAnalysis() {
  const { enquiry } = await session.openEnquiry("does the treatment shorten recovery?");
  const { observations } = await session.recordObservations({
    enquiry,
    name: "recovery times",
    finding: "sixty patients, two arms",
  });
  const { analysis, claims } = await session.recordAnalysis({
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

    const report = await session.replaceAnalysis({
      supersedes: analysis,
      because: review,
      enquiry,
      method: "severity-adjusted comparison",
      // The analysis being replaced, named as the replacement's input.
      from: [analysis],
      concludes: [{ proposition: PROP, finding: "one day shorter, adjusted" }],
    });

    // `why` was the fixed sentence "not produced by the replaced analysis",
    // which is the opposite of true here: this artefact was produced by it and
    // retracted by this very call. The entry stays in the list — the
    // replacement really does rest on it — and says so.
    expect(report.unaffected).toHaveLength(1);
    expect(report.unaffected[0]!.what).toEqual(analysis);
    expect(report.unaffected[0]!.invalidated).toBe(true);
    expect(report.unaffected[0]!.why).not.toContain("not produced by the replaced analysis");

    // An ordinary input is unchanged, so the flag is a discriminator and not a
    // relabelling of every row.
    const clean = await aDefectiveAnalysis();
    const ordinary = await session.replaceAnalysis({
      supersedes: clean.analysis,
      because: clean.review,
      enquiry: clean.enquiry,
      method: "severity-adjusted comparison",
      from: [clean.observations],
      concludes: [{ proposition: PROP, finding: "one day shorter, adjusted" }],
    });
    expect(ordinary.unaffected[0]!.invalidated).toBeUndefined();
    expect(ordinary.unaffected[0]!.why).toContain("not produced by the replaced analysis");
  });

  test("the replacement's conclusion does not stand on a retracted record", async () => {
    const { enquiry, analysis, review } = await aDefectiveAnalysis();
    const report = await session.replaceAnalysis({
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

    // `supported: true` stays, and that is the design rather than an oversight:
    // invalidating a record deliberately does not withdraw what rests on it,
    // because S-11 makes the consequence *enumerable* instead of automatic.
    // What was missing is the half that makes the doctrine honest — the reader
    // could not see, from this answer, that the sole input had been retracted.
    expect(why.supported).toBe(true);
    expect(why.restingOn).toHaveLength(1);
    expect(why.restingOn[0]!.invalidated).toBe(true);

    // And the enumerable route actually reaches this claim, which is what
    // "not automatic" is relying on. If it did not, `supported: true` would be
    // a wrong answer with no way to find out.
    const affected = await later.whatDependsOn(why.restingOn[0]!.part);
    expect(affected.claims.map((c) => c.claim)).toContain(report.claims[0]!.claim);
  });
});
