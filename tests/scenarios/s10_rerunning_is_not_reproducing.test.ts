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
  const { analysis: historical } = await session.recordAnalysis({
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
    expect(why.support.map((s) => s.method).sort()).toEqual(["annealing-v1", "annealing-v1, re-run"]);
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
    expect(report.differs.map((d) => ({ what: d.what.name, standing: d.standing }))).toEqual([
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
    // `confirms` was removed after external review: S-10 established that
    // "raises confidence" and "reproduced the execution" are different, not
    // that an independent re-check can never confirm a claim. Those two fields
    // already say everything demonstrated, without settling what the overloaded
    // word means.
    expect(report.execution).toBe("not-reproduced");

    // And the claim itself now reads as re-verified rather than as twice
    // independently established.
    const why = await (await afterwards()).whySupported({ analysis: historical, proposition: PROPOSITION });
    expect(why.support.map((s) => s.method)).toEqual(["annealing-v1"]);
    expect(why.reverifiedBy.map((r) => r.method)).toEqual(["annealing-v1, re-run"]);
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
    const { analysis: first } = await session.recordAnalysis({
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

  /**
   * External review, finding 3a. Execution equality was compared by artefact
   * *name*, which is the identity-versus-wording mistake this project has now
   * found in four unrelated places (S-5, S-12, S-3b, and here).
   *
   * Two runs can each record "initial conditions" and mean different data.
   */
  test("two inputs sharing a name are not the same input", async () => {
    const enquiry = await session.openEnquiry("does the annealed protocol converge below tolerance?");
    const theirs = await session.recordObservations({
      enquiry,
      name: "initial conditions",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    const mine = await session.recordObservations({
      enquiry,
      name: "initial conditions",
      finding: "seed 91, tolerance 1e-3, 64 steps",
    });
    const { analysis: historical } = await session.recordAnalysis({
      enquiry,
      method: "annealing-v1",
      from: [theirs],
      concludes: [{ proposition: PROPOSITION, finding: "converged, residual 3.1e-4" }],
    });
    const rerun = await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [mine],
      concludes: { proposition: PROPOSITION, finding: "converged, residual 2.9e-4" },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    expect(report.execution).toBe("not-reproduced");
    // Both directions, and both are true: the re-run read an "initial
    // conditions" the original did not, and the original read one the re-run
    // did not. Identical names, two artefacts, two differences.
    //
    // This test named that situation and then asserted the two entries by their
    // identical names, which could not tell them apart -- the defect S-10c
    // found, sitting inside the test whose own comment describes it. The
    // entries now carry identity, so "which one changed" is answerable.
    expect(report.differs.map((d) => d.what.name)).toEqual([
      "initial conditions",
      "initial conditions",
    ]);
    // Both standings present, on two distinct artefacts. Not asserted as an
    // ordered list: entries now sort by name and then by identity, and which
    // natural id sorts first is not a fact about the research.
    expect(report.differs.map((d) => d.standing).sort()).toEqual([
      "changed",
      "not-used-by-the-re-run",
    ]);
    expect(new Set(report.differs.map((d) => d.what.part)).size).toBe(2);
  });

  /**
   * External review, finding 3b, and the sharpest of them: two runs that each
   * recorded *nothing* compared equal, so the report said the execution was
   * reproduced. S-10's entire premise is that an empty input record means
   * provenance was never captured, not that the run consumed nothing.
   */
  test("two runs that both recorded no inputs have not reproduced anything", async () => {
    const { enquiry, historical } = await aHistoricalResultWithNoRecordedInputs();
    const rerun = await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [],
      concludes: { proposition: PROPOSITION, finding: "converged, residual 2.9e-4" },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    expect(report.execution).toBe("not-reproduced");
    expect(report.comparable).toBe(false);
    expect(report.incomparableBecause).toMatch(/never recorded/);
  });

  /**
   * External review, finding 3c. The difference calculation only looked for
   * new-run inputs absent from the original, so dropping an input reported
   * `not-reproduced` with nothing named as differing.
   */
  test("an input the original used and the re-run did not is named", async () => {
    const enquiry = await session.openEnquiry("does the annealed protocol converge below tolerance?");
    const a = await session.recordObservations({ enquiry, name: "conditions A", finding: "seed 4" });
    const b = await session.recordObservations({ enquiry, name: "conditions B", finding: "warm start" });
    const { analysis: historical } = await session.recordAnalysis({
      enquiry,
      method: "annealing-v1",
      from: [a, b],
      concludes: [{ proposition: PROPOSITION, finding: "converged, residual 3.1e-4" }],
    });
    const rerun = await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [a],
      concludes: { proposition: PROPOSITION, finding: "converged, residual 2.9e-4" },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    expect(report.execution).toBe("not-reproduced");
    expect(report.differs.map((d) => ({ what: d.what.name, standing: d.standing }))).toEqual([
      { what: "conditions B", standing: "not-used-by-the-re-run" },
    ]);
  });

  /**
   * External review, finding 4. Agreement was read from the re-run's bearing
   * alone, never compared with the original's — so two runs that both found
   * *against* the proposition were reported as disagreeing with each other.
   */
  test("two runs that both find against the proposition agree with each other", async () => {
    const enquiry = await session.openEnquiry("does the annealed protocol converge below tolerance?");
    const { analysis: historical } = await session.recordAnalysis({
      enquiry,
      method: "annealing-v1",
      from: [],
      concludes: [{ proposition: PROPOSITION, finding: "did not converge", bearing: "challenges" }],
    });
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
      concludes: { proposition: PROPOSITION, finding: "did not converge either", bearing: "challenges" },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    expect(report.conclusion).toBe("agrees");
    // Agreeing with a negative finding does not raise confidence in the
    // proposition -- bearing is about the claim, not about the two runs.
    expect(report.bearing).toBe("lowers");
  });

  /**
   * External review, finding 5. `whySupported()` removed the re-verifying
   * finding from `support`, but `restingOn` still walked it — so the claim was
   * reported as resting directly on inputs belonging to something the same
   * report had just said was not an independent supporting finding.
   */
  test("the claim does not rest on the re-run's inputs", async () => {
    const enquiry = await session.openEnquiry("does the annealed protocol converge below tolerance?");
    const original = await session.recordObservations({ enquiry, name: "original conditions", finding: "seed 1" });
    const { analysis: historical } = await session.recordAnalysis({
      enquiry,
      method: "annealing-v1",
      from: [original],
      concludes: [{ proposition: PROPOSITION, finding: "converged, residual 3.1e-4" }],
    });
    const fresh = await session.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [fresh],
      concludes: { proposition: PROPOSITION, finding: "converged, residual 2.9e-4" },
    });

    const why = await (await afterwards()).whySupported({ analysis: historical, proposition: PROPOSITION });
    expect(why.support.map((s) => s.method)).toEqual(["annealing-v1"]);
    expect(why.reverifiedBy.map((r) => r.method)).toEqual(["annealing-v1, re-run"]);
    expect(why.restingOn.map((a) => a.name)).toEqual(["original conditions"]);
  });
});
