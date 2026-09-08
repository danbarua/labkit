/**
 * Clock ordering — what a wound clock reaches, and the two rungs row Z walked.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  ResearchSession,
  inMemoryEventLog,
  type AnalysisRef,
  type EnquiryRef,
} from "../../src/domain";
import type { ClaimRef } from "../../src/domain";
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

      const { enquiry } = await s.openEnquiry("does the schedule move convergence?");
      const { criterion: check } = await s.stateCriterion("stable across five seeds");
      const { observations } = await s.recordObservations({
        enquiry,
        name: "sweep readings",
        finding: "twelve runs",
      });
      const { claims: analysisClaims } = await recordAnalysis(s, {
        enquiry,
        method: "convergence-fit",
        from: [observations],
        concludes: [{ proposition: CONVERGES, finding: "moves by ~3 steps" }],
        heldTo: [check],
      });

      winding.wind(days(30));
      const whenEvaluated = winding.peek();
      await s.evaluateCriterion({
        criterion: check,
        value: "spread 0.4 steps",
        outcome: "pass",
        citing: [claimOf(analysisClaims, CONVERGES)],
      });

      // A month later the question is closed -- a Decision, and the act that
      // changes what the programme believes.
      winding.wind(days(30));
      await s.closeEnquiry({
        enquiry,
        answeredBy: claimOf(analysisClaims, CONVERGES),
      });

      const reader = new ResearchSession(await scenario.current(), {
        clock: winding,
        events: inMemoryEventLog(),
      });

      // The evaluation kept its instant, and it is the wound one rather than
      // the start -- so the clock genuinely drives durable state here.
      const why = await reader.whySupported(claimOf(analysisClaims, CONVERGES));
      expect(why.standard[0]?.decidedBy?.at).toBe(whenEvaluated);
      expect(why.standard[0]?.decidedBy?.at).not.toBe("2026-03-01T09:00:00.000Z");

      // The closure carries no instant at all. Sixty days of wound clock left no
      // durable trace of *when* the programme came to believe this, which is the
      // half of row Z that matters -- belief moves on decisions, not evaluations.
      const status = await reader.enquiryStatus(enquiry);
      expect(status.question!.closure).toBe("answered");
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
    const why = await s.whySupported(claim);
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

      const { enquiry } = await s.openEnquiry(FIRST.asks);
      const { observations: obs } = await s.recordObservations({
        enquiry,
        name: "readings",
        finding: "twelve runs",
      });
      const { claims: analysisClaims } = await recordAnalysis(s, {
        enquiry,
        method: "paired-comparison",
        from: [obs],
        concludes: [{ proposition: FIRST.prop, finding: "moves by ~3 steps" }],
      });
      c.wind(days(40));
      await s.closeEnquiry({
        enquiry,
        answeredBy: claimOf(analysisClaims, FIRST.prop),
      });

      const reader = new ResearchSession(await scenario.current(), {
        clock: c,
        events: inMemoryEventLog(),
      });

      // Forty days passed between the analysis and the closure. Nothing recorded
      // either instant, and this is the ordinary case: a question answered on a
      // finding nobody held to a prespecified condition.
      expect(await settledNoEarlierThan(reader, await claimNamed(reader, FIRST.prop))).toBeNull();
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
      const { enquiry } = await s.openEnquiry(asks);
      const { criterion: check } = await s.stateCriterion(`prespecified check for ${prop}`);
      const { observations: obs } = await s.recordObservations({
        enquiry,
        name: `${prop} readings`,
        finding: `runs for ${prop}`,
      });
      const { analysis, claims: analysisClaims } = await recordAnalysis(s, {
        enquiry,
        method: "paired-comparison",
        from: [obs],
        concludes: [{ proposition: prop, finding: `result for ${prop}` }],
        heldTo: [check],
      });
      await s.evaluateCriterion({
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
        await s.closeEnquiry({
          enquiry: early.enquiry,
          answeredBy: await claimNamed(s, early.prop),
        });
        c.wind(days(60));
        await s.closeEnquiry({
          enquiry: late.enquiry,
          answeredBy: await claimNamed(s, late.prop),
        });

        const reader = new ResearchSession(await scenario.current(), {
          clock: c,
          events: inMemoryEventLog(),
        });
        return {
          first: await settledNoEarlierThan(reader, await claimNamed(reader, a.prop)),
          second: await settledNoEarlierThan(reader, await claimNamed(reader, b.prop)),
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

// ---------------------------------------------------------------------------

describe("Probe 7 — rung 3: the as-of view, once decisions carry an instant", () => {
  /**
   * Rung 1 was built first and shown to fail (probe 6); rung 2 was declined by argument rather
   * than demonstration — sequence is a property of each act, not a relation between two, and an
   * `AFTER` edge would leave a reader reconstructing a total order from pairs.
   */
  const FIRST = {
    asks: "does pruning move convergence?",
    prop: "pruning moves convergence",
  };
  const SECOND = {
    asks: "does depth move convergence?",
    prop: "depth moves convergence",
  };

  const MARCH = "2026-03-01T09:00:00.000Z";

  /** Settles two questions in a stated order, thirty days apart, and reads the record back. */
  async function programme(order: [typeof FIRST, typeof FIRST]) {
    const graph = await scenario.begin();
    try {
      const c = windableClock(MARCH);
      const s = new ResearchSession(graph, {
        clock: c,
        events: inMemoryEventLog(),
      });

      const prepared: Array<{
        asks: string;
        prop: string;
        enquiry: EnquiryRef;
        analysis: AnalysisRef;
      }> = [];
      for (const q of [FIRST, SECOND]) {
        const { enquiry } = await s.openEnquiry(q.asks);
        const { observations: obs } = await s.recordObservations({
          enquiry,
          name: `${q.prop} readings`,
          finding: `runs for ${q.prop}`,
        });
        const { analysis } = await recordAnalysis(s, {
          enquiry,
          method: "paired-comparison",
          from: [obs],
          concludes: [{ proposition: q.prop, finding: `result for ${q.prop}` }],
        });
        prepared.push({ ...q, enquiry, analysis });
      }
      const find = (q: typeof FIRST) => prepared.find((p) => p.prop === q.prop)!;

      // Thirty days in, the first of them is settled. Sixty days in, the other.
      c.wind(days(30));
      const early = find(order[0]);
      await s.closeEnquiry({
        enquiry: early.enquiry,
        answeredBy: await claimNamed(s, early.prop),
      });
      c.wind(days(30));
      const late = find(order[1]);
      await s.closeEnquiry({
        enquiry: late.enquiry,
        answeredBy: await claimNamed(s, late.prop),
      });

      // A second reader over the same graph, and an empty event log: whatever it
      // answers is reconstructed from what was written down.
      const reader = new ResearchSession(await scenario.current(), {
        clock: c,
        events: inMemoryEventLog(),
      });
      const atDay45 = await reader.whatWasKnown("2026-04-15T09:00:00.000Z");
      return {
        settledByDay45: atDay45.provisional.map((q) => q.asks),
        openAtDay45: atDay45.open.map((q) => q.asks).sort(),
        nowSettled: (await reader.whatIsKnown()).provisional.map((q) => q.asks).sort(),
      };
    } finally {
      await scenario.end();
    }
  }

  test("two orderings of the same beliefs now read apart", async () => {
    const firstThenSecond = await programme([FIRST, SECOND]);
    const secondThenFirst = await programme([SECOND, FIRST]);

    // Both programmes end holding both beliefs. That was never the finding, and
    // it is still true -- the present-tense answer is identical.
    expect(firstThenSecond.nowSettled).toEqual(secondThenFirst.nowSettled);
    expect(firstThenSecond.nowSettled).toEqual([SECOND.asks, FIRST.asks].sort());

    // Mid-way through, they differ -- which is what probe 2 could not see.
    expect(firstThenSecond.settledByDay45).toEqual([FIRST.asks]);
    expect(secondThenFirst.settledByDay45).toEqual([SECOND.asks]);
    expect(firstThenSecond.openAtDay45).toEqual([SECOND.asks]);
    expect(secondThenFirst.openAtDay45).toEqual([FIRST.asks]);
  });

  test("a promotion cannot establish a question before it happened", async () => {
    /**
     * The wrong answer `025` predicted I would write, and would have: keying the as-of survey
     * on `Claim.kind` reports the present.
     */
    const graph = await scenario.begin();
    try {
      const c = windableClock(MARCH);
      const s = new ResearchSession(graph, {
        clock: c,
        events: inMemoryEventLog(),
      });

      const { enquiry } = await s.openEnquiry(FIRST.asks);
      const { observations: obs } = await s.recordObservations({
        enquiry,
        name: "readings",
        finding: "twelve runs",
      });
      const { claims: analysisClaims } = await recordAnalysis(s, {
        enquiry,
        method: "paired-comparison",
        from: [obs],
        concludes: [{ proposition: FIRST.prop, finding: "moves by ~3 steps" }],
      });
      c.wind(days(10));
      await s.closeEnquiry({
        enquiry,
        answeredBy: claimOf(analysisClaims, FIRST.prop),
      });
      c.wind(days(40));
      await s.is({
        state: "confirmed" as const,
        claim: claimOf(analysisClaims, FIRST.prop),
        because: "replicated under seed control",
      });

      const reader = new ResearchSession(await scenario.current(), {
        clock: c,
        events: inMemoryEventLog(),
      });

      // Day 25: settled, and resting on nothing anyone had promoted.
      const midway = await reader.whatWasKnown("2026-03-26T09:00:00.000Z");
      expect(midway.provisional.map((q) => q.asks)).toEqual([FIRST.asks]);
      expect(midway.established).toEqual([]);

      // Day 60: the promotion has happened, and only now is it established.
      const after = await reader.whatWasKnown("2026-05-01T09:00:00.000Z");
      expect(after.established.map((q) => q.asks)).toEqual([FIRST.asks]);
      expect(after.provisional).toEqual([]);

      // The present-tense read collapses that distinction, correctly -- it is
      // answering a different question.
      expect((await reader.whatIsKnown()).established.map((q) => q.asks)).toEqual([FIRST.asks]);
    } finally {
      await scenario.end();
    }
  });

  /**
   * A question is open only between being asked and being settled. Before it exists, and after
   * it exists but before anything settles it, are two different moments — asking "what was
   * known" in the first must not read back as `open`; only the second moment is.
   */
  test("a question is open only between being asked and being settled", async () => {
    const graph = await scenario.begin();
    try {
      const c = windableClock(MARCH);
      const s = new ResearchSession(graph, {
        clock: c,
        events: inMemoryEventLog(),
      });
      const { enquiry } = await s.openEnquiry(FIRST.asks);
      const { observations: obs } = await s.recordObservations({
        enquiry,
        name: "readings",
        finding: "runs",
      });
      const { claims: analysisClaims } = await recordAnalysis(s, {
        enquiry,
        method: "pc",
        from: [obs],
        concludes: [{ proposition: FIRST.prop, finding: "a result" }],
      });
      c.wind(days(10));
      await s.closeEnquiry({
        enquiry,
        answeredBy: claimOf(analysisClaims, FIRST.prop),
      });

      const reader = new ResearchSession(await scenario.current(), {
        clock: c,
        events: inMemoryEventLog(),
      });

      // February: the question had not been posed. Absent, not open.
      const before = await reader.whatWasKnown("2026-02-01T00:00:00.000Z");
      expect(before.open).toEqual([]);
      expect(before.established).toEqual([]);
      expect(before.provisional).toEqual([]);
      expect(before.accepted).toEqual([]);
      expect(before.at).toBe("2026-02-01T00:00:00.000Z");

      // Five days in: asked, and nothing has settled it.
      const during = await reader.whatWasKnown("2026-03-06T09:00:00.000Z");
      expect(during.open.map((q) => q.asks)).toEqual([FIRST.asks]);
      expect(during.provisional).toEqual([]);
    } finally {
      await scenario.end();
    }
  });
});
