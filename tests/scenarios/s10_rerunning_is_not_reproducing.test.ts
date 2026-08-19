/**
 * S-10 — "Rerunning is not reproducing."
 * docs/project-journal/008_user_story_mining.md, §2 and §3 rows E, P
 *
 * A historical result whose initial conditions were never written down. The
 * protocol can be run again, but not *reproduced*: the new run specifies its
 * own conditions, so agreement between the two is agreement between two
 * different executions, and disagreement would not be evidence against the
 * original either.
 *
 * The scenario exists to find out whether the model can hold "related to that
 * claim, but not the same execution" without an evidence-to-evidence
 * relationship. Row E predicts it cannot. An *empty* answer would not settle
 * that — the first test is here to establish whether the answer is instead
 * confidently wrong.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

let tick = 0;
const clock: Clock = { now: () => new Date(Date.UTC(2026, 7, 19, 9, tick++)).toISOString() };

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });
beforeEach(async () => {
  tick = 0;
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events });
});
afterEach(async () => { await scenario.end(); });

/** A second reader over the same graph — see tests/helpers/scenario.ts. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

const PROPOSITION = "the annealed protocol converges below tolerance";

/**
 * Researcher: "There's a result from the old study saying the annealed
 *  protocol converges. Nobody wrote down what it started from."
 *
 * The historical run consumed nothing that was recorded — which is the whole
 * situation, and is expressible today.
 */
async function aHistoricalResultWithNoRecordedInputs() {
  const enquiry = await session.openEnquiry("does the annealed protocol converge below tolerance?");
  const historical = await session.recordAnalysis({
    enquiry,
    method: "annealing-v1",
    from: [],
    concludes: [{ proposition: PROPOSITION, finding: "converged, residual 3.1e-4" }],
  });
  return { enquiry, historical };
}

describe("S-10: rerunning is not reproducing", () => {
  /**
   * The wrong answer this scenario was built on, kept as the contrast that
   * gives `reverify()` its meaning.
   *
   * Before `REVERIFIES` this was the *only* way to record a re-run: an analysis
   * in the same line of enquiry concluding the same proposition, which S-5's
   * scope rules resolve to the same claim. The record then said the proposition
   * rested on two independent findings when it rested on one, checked twice,
   * by a run that specified conditions the original never recorded.
   *
   * It still says that, and correctly. Recording two analyses is a claim of
   * two independent results, which is a real and different situation from a
   * re-verification — so `recordAnalysis()` is not made to refuse this the way
   * `declareGate()` refuses a phantom gate (S-3b). What was missing was a way
   * to say the other thing, not a way to stop saying this one. The two tests
   * below run the identical pair of executions through `reverify()` and get a
   * different answer; that difference is the whole finding.
   */
  test("recorded as two analyses, the re-run reads as independent confirmation", async () => {
    const { enquiry, historical } = await aHistoricalResultWithNoRecordedInputs();

    const conditions = await session.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    await session.recordAnalysis({
      enquiry,
      method: "annealing-v1, re-run",
      from: [conditions],
      concludes: [{ proposition: PROPOSITION, finding: "converged, residual 2.9e-4" }],
    });

    const why = await (await afterwards()).whySupported({ analysis: historical, proposition: PROPOSITION });
    expect(why.supported).toBe(true);
    // Two findings, presented alike, with nothing saying one re-checked the
    // other or that their executions differ.
    expect(why.support).toHaveLength(2);
    expect(why.support.map((s) => s.via).sort()).toEqual(["annealing-v1", "annealing-v1, re-run"]);
  });

  /**
   * Afterward 1. "Is the historical result reproduced?" — its conclusion,
   * possibly; its execution, no. Two answers, and collapsing them into one
   * boolean is the mistake the scenario is named after.
   */
  test("Afterward 1: the conclusion may be reproduced; the execution is not", async () => {
    const { enquiry, historical } = await aHistoricalResultWithNoRecordedInputs();
    const conditions = await session.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    const rerun = await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [conditions],
      concludes: { proposition: PROPOSITION, finding: "converged, residual 2.9e-4" },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    expect(report.conclusion).toBe("agrees");
    expect(report.execution).toBe("not-reproduced");
  });

  /**
   * Afterward 2. "What differs between the two runs?" — the initial
   * conditions, named as **unrecorded** rather than as equal. Absence of a
   * record is not evidence the two agree; that is row I's distinction, asked
   * of execution instead of evidence.
   */
  test("Afterward 2: the difference is named as unrecorded, not as equal", async () => {
    const { enquiry, historical } = await aHistoricalResultWithNoRecordedInputs();
    const conditions = await session.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    const rerun = await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [conditions],
      concludes: { proposition: PROPOSITION, finding: "converged, residual 2.9e-4" },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    expect(report.differs).toEqual([
      { what: "initial conditions, newly specified", standing: "unrecorded-in-the-original" },
    ]);
  });

  /**
   * Afterward 3. "Does the new run raise or lower confidence?" — answerable,
   * and distinct from "confirms it". An agreeing re-verification strengthens
   * the claim without reproducing it, and the report must not let a reader
   * take the first for the second.
   */
  test("Afterward 3: bearing on the historical claim is answerable and is not confirmation", async () => {
    const { enquiry, historical } = await aHistoricalResultWithNoRecordedInputs();
    const conditions = await session.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    const rerun = await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [conditions],
      concludes: { proposition: PROPOSITION, finding: "converged, residual 2.9e-4" },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    expect(report.bearing).toBe("raises");
    expect(report.confirms).toBe(false);

    // And the claim itself now reads as re-verified rather than as twice
    // independently established.
    const why = await (await afterwards()).whySupported({ analysis: historical, proposition: PROPOSITION });
    expect(why.support.map((s) => s.via)).toEqual(["annealing-v1"]);
    expect(why.reverifiedBy).toEqual(["annealing-v1, re-run"]);
  });

  /**
   * Afterward 4. "Can the two be compared numerically?" — no, and the record
   * says so unprompted, alongside the rest of the answer.
   *
   * Predicted as a refusing verb (S-5's shape) and built as a field instead.
   * LabKit has no verb that plots or compares numbers, so a `compareNumerically()`
   * existing only to reject its arguments would be a feature invented to
   * manufacture a wrong answer — PJ-011 §5, from the other side. The caveat has
   * to travel with the report a reader already asks for.
   */
  test("Afterward 4: the two are reported as not numerically comparable, with the reason", async () => {
    const { enquiry, historical } = await aHistoricalResultWithNoRecordedInputs();
    const conditions = await session.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    const rerun = await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [conditions],
      concludes: { proposition: PROPOSITION, finding: "converged, residual 2.9e-4" },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    expect(report.comparable).toBe(false);
    expect(report.incomparableBecause).toMatch(/initial conditions/);
  });

  /**
   * The control. Two runs that BOTH recorded their inputs, and the same
   * inputs, are a literal reproduction — the distinction has to cut both ways
   * or it is just a blanket caveat on every second run.
   */
  test("two runs over the same recorded inputs are a reproduction, and comparable", async () => {
    const enquiry = await session.openEnquiry("does the annealed protocol converge below tolerance?");
    const conditions = await session.recordObservations({
      enquiry,
      name: "initial conditions",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    const first = await session.recordAnalysis({
      enquiry,
      method: "annealing-v1",
      from: [conditions],
      concludes: [{ proposition: PROPOSITION, finding: "converged, residual 3.1e-4" }],
    });
    const rerun = await session.reverify({
      historical: first,
      enquiry,
      method: "annealing-v1, re-run",
      under: [conditions],
      concludes: { proposition: PROPOSITION, finding: "converged, residual 3.1e-4" },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    expect(report.execution).toBe("reproduced");
    expect(report.differs).toEqual([]);
    expect(report.comparable).toBe(true);
    expect(report.incomparableBecause).toBeUndefined();
  });
});
