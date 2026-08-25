/**
 * The historical survey, put under a wound clock.
 *
 * Prompted by an external review of the consumer branch (2026-08-21), which
 * read `whatWasKnown()` and predicted two wrong answers without running
 * anything. This file runs them. A candidate is not a finding until someone
 * does — PJ-027 — so the tests below are written to *demonstrate*, and each
 * one names what it expects the current code to do.
 *
 * Both probes clear PJ-011 §5 rather than `023`'s bar 4: the survey does not
 * return an empty or absent answer, it returns a **confidently incorrect** one.
 * A question is placed in a bucket it could not have been in.
 *
 * Imports only src/domain, never src/db (enforced — see .dependency-cruiser.cjs).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { windableClock, days } from "../helpers/clock";
import { claimOf } from "../helpers/claims";

let scenario: Scenario;
let graph: Awaited<ReturnType<Scenario["begin"]>>;

beforeAll(async () => {
  scenario = await openScenario();
});
// `begin()` in a hook, not a test body: bun runs beforeEach/afterEach OUTSIDE
// the 5000ms per-test budget, so setup paid here does not count against the
// ceiling. `end()` was already off-budget for the same reason.
beforeEach(async () => {
  graph = await scenario.begin();
});
afterEach(async () => {
  await scenario.end();
});
afterAll(async () => {
  await scenario.close();
});

const asked = (survey: {
  established: Array<{ asks: string }>;
  provisional: Array<{ asks: string }>;
  accepted: Array<{ asks: string }>;
  open: Array<{ asks: string }>;
}) => ({
  established: survey.established.map((q) => q.asks),
  provisional: survey.provisional.map((q) => q.asks),
  accepted: survey.accepted.map((q) => q.asks),
  open: survey.open.map((q) => q.asks),
});

describe("what was known, as of an instant", () => {
  /**
   * **A question posed in April was not open in March. It did not exist.**
   *
   * `whatWasKnown()` starts `MATCH (q:Question)` — every question that exists
   * *now* — and classifies each by whether a dated `Decision` resolved,
   * promoted or accepted it by the stated instant. A question posed after that
   * instant has none of those, so it falls through every branch into `open`.
   *
   * That is not an absence. `open` is an assertion: this question was on the
   * record and nothing had settled it. Reported for a question nobody had
   * asked yet, it back-dates the programme's own agenda — the mirror of the
   * failure the method's docstring already guards against for promotion
   * ("it would report a question `established` in March on the strength of a
   * promotion made in August").
   */
  test("a question posed after the instant is not reported as open at it", async () => {
    const clock = windableClock("2026-03-01T09:00:00.000Z");
    const s = new ResearchSession(graph, { clock, events: inMemoryEventLog() });

    await s.openEnquiry("does the schedule move convergence?");
    clock.wind(days(31));
    await s.openEnquiry("does batch size interact with it?");

    const march = await s.whatWasKnown("2026-03-15T00:00:00.000Z");
    expect(asked(march).open).toEqual(["does the schedule move convergence?"]);
    expect(asked(march).open).not.toContain("does batch size interact with it?");
  });

  /**
   * **`at` is compared as a string, so a valid instant with an offset orders
   * wrongly.**
   *
   * The instant is validated with `Date.parse()`, which accepts any ISO-8601
   * form, and then compared with `<=` against a `decided_at` the clock always
   * writes as UTC. `2026-03-01T09:00:00-05:00` is 14:00Z — *after* a decision
   * at 10:00Z — but sorts lexically before it. The survey reports the question
   * unresolved at a moment when it had been resolved for four hours.
   *
   * Same severity as the probe above and a much smaller fix: canonicalise the
   * caller's instant once, rather than trusting that two ISO strings sort the
   * way the moments they name do.
   */
  test("an instant given with a UTC offset is compared as a moment, not as text", async () => {
    const clock = windableClock("2026-03-01T08:00:00.000Z");
    const s = new ResearchSession(graph, { clock, events: inMemoryEventLog() });

    const enquiry = await s.openEnquiry("does the schedule move convergence?");
    const observations = await s.recordObservations({
      enquiry,
      name: "sweep readings",
      finding: "twelve runs",
    });
    const { analysis: analysis, claims: analysisClaims } = await s.recordAnalysis({
      enquiry,
      from: [observations],
      method: "paired comparison",
      concludes: [
        {
          proposition: "the schedule moves convergence",
          finding: "moves by ~3 steps",
        },
      ],
    });
    clock.windTo("2026-03-01T10:00:00.000Z");
    await s.closeEnquiry({
      enquiry,
      answeredBy: claimOf(analysisClaims, "the schedule moves convergence"),
    });

    // 14:00Z, four hours after the close — but "09" sorts before "10".
    const offset = await s.whatWasKnown("2026-03-01T09:00:00-05:00");
    expect(asked(offset).provisional).toEqual(["does the schedule move convergence?"]);
    expect(asked(offset).open).toEqual([]);
  });
});
