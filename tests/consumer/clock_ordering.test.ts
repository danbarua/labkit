/**
 * Clock ordering — what a wound clock reaches, and the two rungs row Z walked.
 *
 * docs/consumer-contract/024_vertical_slice_results.md (probe 5),
 * `025` and `026` (row Z's predictions and outcomes).
 *
 * **Split out of `vertical_slice.test.ts` on 2026-08-21, for containment.** The
 * suite is flaky and it concentrates here: five consecutive plain `bun test`
 * runs gave 0, 2, 2, 9 and 1 failures, and the nine was one file cascading
 * after a single death — the shape `tests/helpers/db.ts` documents, where a
 * connection hitting the pglite-socket defect desyncs permanently and stays
 * broken for the rest of its life. Every file gets its own PGlite and its own
 * socket server, so splitting the file halves the blast radius: a connection
 * that dies in here can no longer take the paired-world probes with it.
 *
 * **Containment, not a fix.** The root cause is not known — see
 * `docs/TASKS.md`, which records what is established and what is not, including
 * two failed experiments worth not repeating. If the flake follows this file
 * rather than staying with it, that is itself a result.
 *
 * The seam is real rather than convenient. Everything here winds a clock;
 * everything left behind freezes one, deliberately, so that two worlds cannot
 * be told apart by elapsed time. `tests/helpers/clock.ts` explains why a
 * constant function is a frozen *value* and not a clock at all — a distinction
 * `024` got wrong and had to withdraw.
 *
 * Imports only src/domain, never src/db (enforced — see .dependency-cruiser.cjs).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  ResearchSession,
  inMemoryEventLog,
  type AnalysisRef,
  type Clock,
  type EnquiryRef,
} from "../../src/domain";
import type { ClaimRef } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { windableClock, minutes, days, type WindableClock } from "../helpers/clock";
import { claimNamed, claimOf } from "../helpers/claims";

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
   * `024` claimed a pinned clock meant this harness "structurally cannot
   * evaluate whether row Z's ordering can be derived from `closed_at` or event
   * stamps". **Withdrawn.** The limitation was the fixture's: a constant
   * function is a frozen value, not a clock, and winding one is all it took.
   *
   * Wound, the answer is observable rather than argued. Of the six places a
   * write verb reads the clock, **one** reaches the graph — `evaluateCriterion`,
   * stamping `CriterionEvaluation.evaluated_at`. The other five reach only the
   * event stream, which CLAUDE.md excludes from "what is true now".
   *
   * So row Z is narrower than "the record has no time in it", and the narrower
   * statement is the useful one: **evaluations are ordered, decisions are not**.
   * A frozen clock could not have shown this, because every stamp was identical.
   */
  test("an evaluation carries the time it was reached; a decision carries none", async () => {
    const graph = await scenario.begin();
    try {
      const winding = windableClock("2026-03-01T09:00:00.000Z");
      const s = new ResearchSession(graph, {
        clock: winding,
        events: inMemoryEventLog(),
      });

      const enquiry = await s.openEnquiry("does the schedule move convergence?");
      const check = await s.stateCriterion("stable across five seeds");
      const observations = await s.recordObservations({
        enquiry,
        name: "sweep readings",
        finding: "twelve runs",
      });
      const { analysis: analysis, claims: analysisClaims } = await s.recordAnalysis({
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
        citing: claimOf(analysisClaims, CONVERGES),
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
      expect(why.standard[0]?.evaluations[0]?.at).toBe(whenEvaluated);
      expect(why.standard[0]?.evaluations[0]?.at).not.toBe("2026-03-01T09:00:00.000Z");

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
   * The change bar's first rung, walked before anything is added to the model:
   * **reader semantics → existing relationships → new property → a new noun.**
   *
   * Rows P and F are why this is not a formality. P looked like missing
   * structure across two builds and was resolved in the query; F looked like a
   * missing edge and was answered by a refusal. A property added without
   * walking the rungs is a guess that happened to work.
   *
   * The best ordering a consumer can build today: a closure that cites a finding
   * held to an evaluated criterion is **no earlier than** that evaluation. The
   * probe implements exactly that, using only public reads, and asks it to
   * separate two programmes that settled the same questions in opposite orders.
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
    const stamps = why.standard.flatMap((c) => c.evaluations.map((e) => e.at)).sort();
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

      const enquiry = await s.openEnquiry(FIRST.asks);
      const obs = await s.recordObservations({
        enquiry,
        name: "readings",
        finding: "twelve runs",
      });
      const { analysis: analysis, claims: analysisClaims } = await s.recordAnalysis({
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
     * The generous case for rung 1: *both* questions carry an evaluated
     * criterion, so both have a bound. It still fails, and the reason is what
     * kills the rung — the bound records when the *evidence* was checked, not
     * when the question was settled, and a programme can sit on checked evidence
     * for months before closing on it.
     *
     * The variable has to be isolated, and the first draft of this test failed
     * to: it wound the clock before each closure, so delaying one closure also
     * delayed the *next question's evaluation*, and the two worlds differed in
     * evidence times as well as closure order. The bounds duly differed, and for
     * the wrong reason. Both worlds now evaluate both checks at the same two
     * instants and differ **only** in which question is closed first.
     */
    const prepare = async (s: ResearchSession, asks: string, prop: string) => {
      const enquiry = await s.openEnquiry(asks);
      const check = await s.stateCriterion(`prespecified check for ${prop}`);
      const obs = await s.recordObservations({
        enquiry,
        name: `${prop} readings`,
        finding: `runs for ${prop}`,
      });
      const { analysis: analysis, claims: analysisClaims } = await s.recordAnalysis({
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
        citing: claimOf(analysisClaims, prop),
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
   * Row Z, closed as far as the contract requires. Rung 1 was built first and
   * shown to fail (probe 6); rung 2 was declined by argument rather than
   * demonstration — sequence is a property of each act, not a relation between
   * two, and an `AFTER` edge would leave a reader reconstructing a total order
   * from pairs. Then, and only then, one property: `Decision.decided_at`.
   *
   * The success condition was stated in `025` before any of it was written: two
   * programmes settling the same questions in **opposite orders** return
   * *different* as-of answers, each correct, from durable state — with the event
   * log empty beside it, as S-1 established.
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
        const enquiry = await s.openEnquiry(q.asks);
        const obs = await s.recordObservations({
          enquiry,
          name: `${q.prop} readings`,
          finding: `runs for ${q.prop}`,
        });
        const { analysis: analysis, claims: analysisClaims } = await s.recordAnalysis({
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
     * The wrong answer `025` predicted I would write, and would have: keying the
     * as-of survey on `Claim.kind` reports the present. Here the promotion comes
     * a month after the closure, so there is a window in which the question is
     * settled but not established -- and the current-state read cannot see it.
     */
    const graph = await scenario.begin();
    try {
      const c = windableClock(MARCH);
      const s = new ResearchSession(graph, {
        clock: c,
        events: inMemoryEventLog(),
      });

      const enquiry = await s.openEnquiry(FIRST.asks);
      const obs = await s.recordObservations({
        enquiry,
        name: "readings",
        finding: "twelve runs",
      });
      const { analysis: analysis, claims: analysisClaims } = await s.recordAnalysis({
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
      await s.promote({
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
   * **Rewritten on 2026-08-21. It used to assert the bug.**
   *
   * The old form posed a question in March, asked what was known in *February*,
   * and asserted the question came back `open` — "before anything was decided,
   * everything is open". That reads like a boundary case and is a wrong answer:
   * in February the question had not been asked. Nothing was open because
   * nothing existed. The test passed because `whatWasKnown()` began
   * `MATCH (q:Question)` and dropped every unclassified row into `open`, so the
   * assertion and the defect agreed with each other.
   *
   * Worth leaving the note rather than quietly editing the file. A test that
   * encodes the behaviour it was written to pin is the same shape as PJ-027's
   * comments — a second copy of the code's opinion, mistaken for a check on it.
   *
   * The two moments are now separated: before the question exists, and after it
   * exists but before anything settles it. Only the second is `open`.
   */
  test("a question is open only between being asked and being settled", async () => {
    const graph = await scenario.begin();
    try {
      const c = windableClock(MARCH);
      const s = new ResearchSession(graph, {
        clock: c,
        events: inMemoryEventLog(),
      });
      const enquiry = await s.openEnquiry(FIRST.asks);
      const obs = await s.recordObservations({
        enquiry,
        name: "readings",
        finding: "runs",
      });
      const { analysis: analysis, claims: analysisClaims } = await s.recordAnalysis({
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
