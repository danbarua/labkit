/**
 * Clock ordering — what a wound clock reaches, and what evidence times alone can order.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog } from "@labkit/core-domain";
import type { ClaimRef } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { windableClock, minutes, days } from "../helpers/clock";
import { claimNamed, claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";
import { evaluationsOf } from "../helpers/criteria";

let scenario: Scenario;

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});

/** Shared with the paired-world probes next door; kept in both because neither file owns the other. */
const CONVERGES = "the pruning schedule shifts the convergence point";

describe("Probe 5 — what a wound clock reaches, and what it does not", () => {
  /**
   * A frozen clock cannot distinguish ordering from argument, so this probe winds one. Of the
   * six places a write verb reads the clock, **one** reaches the graph — `evaluateCriterion`,
   * stamping `CriterionEvaluation.evaluated_at`.
   */
  test("an evaluation carries the time it was reached; a decision carries none", async () => {
    const graph = await scenario.begin();
    try {
      const winding = windableClock("2026-03-01T09:00:00.000Z");
      const s = new ResearchSession(graph, {
        clock: winding,
        events: inMemoryEventLog(),
      });

      const { enquiry } = await s.writes.openEnquiry("does the schedule move convergence?");
      const { criterion: check } = await s.writes.stateCriterion("stable across five seeds");
      const { observations } = await s.writes.recordObservations({
        enquiry,
        name: "sweep readings",
        finding: "twelve runs",
      });
      const { claims: analysisClaims } = await recordAnalysis(s.writes, {
        enquiry,
        method: "convergence-fit",
        from: [observations],
        concludes: [{ proposition: CONVERGES, finding: "moves by ~3 steps" }],
        heldTo: [check],
      });

      winding.wind(days(30));
      const whenEvaluated = winding.peek();
      await s.writes.evaluateCriterion({
        criterion: check,
        value: "spread 0.4 steps",
        outcome: "pass",
        citing: [claimOf(analysisClaims, CONVERGES)],
      });

      // A month later the question is closed -- a Decision, and the act that
      // changes what the programme believes.
      winding.wind(days(30));
      await s.writes.closeEnquiry({
        enquiry,
        answeredBy: [claimOf(analysisClaims, CONVERGES)],
      });

      const reader = new ResearchSession(await scenario.current(), {
        clock: winding,
        events: inMemoryEventLog(),
      });

      // The evaluation kept its instant, and it is the wound one rather than
      // the start -- so the clock genuinely drives durable state here.
      const why = await reader.reads.whySupported({ claim: claimOf(analysisClaims, CONVERGES) });
      expect(why.standard[0]?.decidedBy?.at).toBe(whenEvaluated);
      expect(why.standard[0]?.decidedBy?.at).not.toBe("2026-03-01T09:00:00.000Z");

      // The closure carries no instant at all. Sixty days of wound clock left no
      // durable trace of *when* the programme came to believe this, which is the
      // half of row Z that matters -- belief moves on decisions, not evaluations.
      const status = await reader.reads.enquiryStatus({ enquiry });
      expect(status.closure).toBe("answered");
      const timeFields = Object.keys(status).filter((k) => /_?at$|when|time|date/i.test(k));
      expect(timeFields).toEqual([]);
    } finally {
      await scenario.end();
    }
  });

  /** The clock refuses to run backwards. A clock that can is a variable. */
  test("winding is monotonic", () => {
    const c = windableClock("2026-03-01T09:00:00.000Z");
    c.wind(minutes(5));
    expect(() => c.wind(-1)).toThrow(/non-negative/);
    expect(() => c.windTo("2026-01-01T00:00:00.000Z")).toThrow(/before the current time/);
    expect(c.peek()).toBe("2026-03-01T09:05:00.000Z");
  });
});

// ---------------------------------------------------------------------------

describe("Probe 6 — rung 1: ordering derived from evidence times alone", () => {
  /**
   * The change bar's first rung, walked before anything is added to the model: **reader
   * semantics → existing relationships → new property → a new noun.**
   */
  const FIRST = {
    asks: "does pruning move convergence?",
    prop: "pruning moves convergence",
  };
  const SECOND = {
    asks: "does depth move convergence?",
    prop: "depth moves convergence",
  };

  /** A lower bound on when a question was settled, from evidence alone. Null when none exists. */
  async function settledNoEarlierThan(s: ResearchSession, claim: ClaimRef): Promise<string | null> {
    const why = await s.reads.whySupported({ claim });
    // Through the drill-down: a check carries which evaluation decided it and
    // when, not every evaluation's text -- see helpers/criteria.ts.
    const perCheck = await Promise.all(why.standard.map((c) => evaluationsOf(s, c)));
    const stamps = perCheck
      .flat()
      .map((e) => e.at)
      .sort();
    return stamps.at(-1) ?? null;
  }

  test("a closure with no prespecified check has no temporal anchor at all", async () => {
    const graph = await scenario.begin();
    try {
      const c = windableClock("2026-03-01T09:00:00.000Z");
      const s = new ResearchSession(graph, {
        clock: c,
        events: inMemoryEventLog(),
      });

      const { enquiry } = await s.writes.openEnquiry(FIRST.asks);
      const { observations: obs } = await s.writes.recordObservations({
        enquiry,
        name: "readings",
        finding: "twelve runs",
      });
      const { claims: analysisClaims } = await recordAnalysis(s.writes, {
        enquiry,
        method: "paired-comparison",
        from: [obs],
        concludes: [{ proposition: FIRST.prop, finding: "moves by ~3 steps" }],
      });
      c.wind(days(40));
      await s.writes.closeEnquiry({
        enquiry,
        answeredBy: [claimOf(analysisClaims, FIRST.prop)],
      });

      const reader = new ResearchSession(await scenario.current(), {
        clock: c,
        events: inMemoryEventLog(),
      });

      // Forty days passed between the analysis and the closure. Nothing recorded
      // either instant, and this is the ordinary case: a question answered on a
      // finding nobody held to a prespecified condition.
      expect(
        await settledNoEarlierThan(reader, await claimNamed(reader.reads, FIRST.prop)),
      ).toBeNull();
    } finally {
      await scenario.end();
    }
  });

  test("even with checks, the bound cannot order two closures", async () => {
    /**
     * The generous case for rung 1: *both* questions carry an evaluated criterion, so both have
     * a bound.
     */
    const prepare = async (s: ResearchSession, asks: string, prop: string) => {
      const { enquiry } = await s.writes.openEnquiry(asks);
      const { criterion: check } = await s.writes.stateCriterion(`prespecified check for ${prop}`);
      const { observations: obs } = await s.writes.recordObservations({
        enquiry,
        name: `${prop} readings`,
        finding: `runs for ${prop}`,
      });
      const { analysis, claims: analysisClaims } = await recordAnalysis(s.writes, {
        enquiry,
        method: "paired-comparison",
        from: [obs],
        concludes: [{ proposition: prop, finding: `result for ${prop}` }],
        heldTo: [check],
      });
      await s.writes.evaluateCriterion({
        criterion: check,
        value: "within tolerance",
        outcome: "pass",
        citing: [claimOf(analysisClaims, prop)],
      });
      return { enquiry, analysis, analysisClaims, prop };
    };

    const world = async (closeFirstThenSecond: boolean) => {
      const graph = await scenario.begin();
      try {
        const c = windableClock("2026-03-01T09:00:00.000Z");
        const s = new ResearchSession(graph, {
          clock: c,
          events: inMemoryEventLog(),
        });

        // Identical in both worlds: FIRST checked on 1 March, SECOND on 2 March.
        const a = await prepare(s, FIRST.asks, FIRST.prop);
        c.wind(days(1));
        const b = await prepare(s, SECOND.asks, SECOND.prop);

        // The only difference: which of them the programme settles first.
        c.wind(days(30));
        const [early, late] = closeFirstThenSecond ? [a, b] : [b, a];
        await s.writes.closeEnquiry({
          enquiry: early.enquiry,
          answeredBy: [await claimNamed(s.reads, early.prop)],
        });
        c.wind(days(60));
        await s.writes.closeEnquiry({
          enquiry: late.enquiry,
          answeredBy: [await claimNamed(s.reads, late.prop)],
        });

        const reader = new ResearchSession(await scenario.current(), {
          clock: c,
          events: inMemoryEventLog(),
        });
        return {
          first: await settledNoEarlierThan(reader, await claimNamed(reader.reads, a.prop)),
          second: await settledNoEarlierThan(reader, await claimNamed(reader.reads, b.prop)),
        };
      } finally {
        await scenario.end();
      }
    };

    const firstSettledEarly = await world(true);
    const firstSettledLate = await world(false);

    // Identical. Sixty days separate the two closures and the order reverses
    // between the worlds, and the best bound a consumer can build records
    // neither -- it records the evaluations, which were the same in both. Rung 1
    // cannot see the act it is being asked to order.
    expect(firstSettledEarly).toEqual(firstSettledLate);
    expect(firstSettledEarly.first).toBe("2026-03-01T09:00:00.000Z");
    expect(firstSettledEarly.second).toBe("2026-03-02T09:00:00.000Z");
  });
});
