/**
 * S-10 — "Rerunning is not reproducing." and
 * rows E, P
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

let tick = 0;
const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 7, 19, 9, tick++)).toISOString(),
};

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  tick = 0;
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events });
});
afterEach(async () => {
  await scenario.end();
});

/** A second reader over the same graph — see tests/helpers/scenario.ts. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

const PROPOSITION = "the annealed protocol converges below tolerance";

/**
 * Researcher: "There's a result from the old study saying the annealed protocol converges.
 * Nobody wrote down what it started from."
 */
async function aHistoricalResultWithNoRecordedInputs() {
  const { enquiry } = await session.openEnquiry(
    "does the annealed protocol converge below tolerance?",
  );
  const { analysis: historical, claims: historicalClaims } = await recordAnalysis(session, {
    enquiry,
    method: "annealing-v1",
    from: [],
    concludes: [{ proposition: PROPOSITION, finding: "converged, residual 3.1e-4" }],
  });
  return { enquiry, historical, historicalClaims };
}

describe("S-10: rerunning is not reproducing", () => {
  /**
   * The wrong answer this scenario was built on, kept as the contrast that gives `reverify()`
   * its meaning.
   */
  test("recorded as two analyses, the re-run reads as independent confirmation", async () => {
    const { enquiry, historicalClaims } = await aHistoricalResultWithNoRecordedInputs();

    const { observations: conditions } = await session.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    await recordAnalysis(session, {
      enquiry,
      method: "annealing-v1, re-run",
      from: [conditions],
      concludes: [{ proposition: PROPOSITION, finding: "converged, residual 2.9e-4" }],
    });

    const why = await (await afterwards()).whySupported(claimOf(historicalClaims, PROPOSITION));
    expect(why.verdict).toBe("supported");
    // Two findings, presented alike, with nothing saying one re-checked the
    // other or that their executions differ.
    expect(why.support).toHaveLength(2);
    expect(why.support.map((s) => s.method).sort()).toEqual([
      "annealing-v1",
      "annealing-v1, re-run",
    ]);
  });

  /**
   * Afterward 1. "Is the historical result reproduced?" — its conclusion,
   * possibly; its execution, no. Two answers, and collapsing them into one
   * boolean is the mistake the scenario is named after.
   */
  test("Afterward 1: the conclusion may be reproduced; the execution is not", async () => {
    const { enquiry, historical } = await aHistoricalResultWithNoRecordedInputs();
    const { observations: conditions } = await session.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    const rerun = await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [conditions],
      concludes: {
        proposition: PROPOSITION,
        finding: "converged, residual 2.9e-4",
      },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    expect(report.conclusion).toBe("agrees");
    // The original recorded nothing it read, so there is nothing to have
    // reproduced. LabKit says that and stops.
    expect(report.ofRead).toEqual([]);
    expect(report.differs.map((d) => d.standing)).toEqual(["unrecorded-in-the-original"]);
  });

  /**
   * Afterward 2. "What differs between the two runs?" — the initial
   * conditions, named as **unrecorded** rather than as equal. Absence of a
   * record is not evidence the two agree.
   */
  test("Afterward 2: the difference is named as unrecorded, not as equal", async () => {
    const { enquiry, historical } = await aHistoricalResultWithNoRecordedInputs();
    const { observations: conditions } = await session.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    const rerun = await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [conditions],
      concludes: {
        proposition: PROPOSITION,
        finding: "converged, residual 2.9e-4",
      },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    expect(report.differs.map((d) => ({ what: d.what.name, standing: d.standing }))).toEqual([
      {
        what: "initial conditions, newly specified",
        standing: "unrecorded-in-the-original",
      },
    ]);
  });

  /**
   * Afterward 3. "Does the new run raise or lower confidence?" — answerable, and distinct from
   * "confirms it". An agreeing re-verification strengthens the claim without reproducing it,
   * and the report must not let a reader take the first for the second.
   */
  test("Afterward 3: bearing on the historical claim is answerable and is not confirmation", async () => {
    const { enquiry, historical, historicalClaims } = await aHistoricalResultWithNoRecordedInputs();
    const { observations: conditions } = await session.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    const rerun = await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [conditions],
      concludes: {
        proposition: PROPOSITION,
        finding: "converged, residual 2.9e-4",
      },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    expect(report.bearing).toBe("raises");
    // There is no `confirms` field: "raises confidence" and "reproduced the
    // execution" are different questions, asked separately, without settling
    // what the overloaded word would mean. That is not the same as saying an
    // independent re-check can never confirm a claim.
    expect(report.ofRead).toEqual([]);

    // And the claim itself now reads as re-verified rather than as twice
    // independently established.
    const why = await (await afterwards()).whySupported(claimOf(historicalClaims, PROPOSITION));
    expect(why.support.map((s) => s.method)).toEqual(["annealing-v1"]);
    expect(why.reverifiedBy.map((r) => r.method)).toEqual(["annealing-v1, re-run"]);
  });

  /**
   * Afterward 4. "Can the two be compared numerically?" — no, and the record says so
   * unprompted, alongside the rest of the answer.
   */
  test("Afterward 4: the record says the original never recorded what it read", async () => {
    const { enquiry, historical } = await aHistoricalResultWithNoRecordedInputs();
    const { observations: conditions } = await session.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    const rerun = await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [conditions],
      concludes: {
        proposition: PROPOSITION,
        finding: "converged, residual 2.9e-4",
      },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    // LabKit does not decide whether two sets of numbers may be put side by
    // side -- that is the reader's call, not the record's. What the record
    // gives is the fact a comparison call would rest on: the re-run named
    // what it read and the original named nothing.
    expect(report.ofRead).toEqual([]);
    expect(report.verificationRead.map((i) => i.name)).toEqual([
      "initial conditions, newly specified",
    ]);
    expect(report.differs.map((d) => d.standing)).toEqual(["unrecorded-in-the-original"]);
  });

  /**
   * The control. Two runs that BOTH recorded their inputs, and the same
   * inputs, are a literal reproduction — the distinction has to cut both ways
   * or it is just a blanket caveat on every second run.
   */
  test("two runs over the same recorded inputs are a reproduction, and comparable", async () => {
    const { enquiry } = await session.openEnquiry(
      "does the annealed protocol converge below tolerance?",
    );
    const { observations: conditions } = await session.recordObservations({
      enquiry,
      name: "initial conditions",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    const { analysis: first } = await recordAnalysis(session, {
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
      concludes: {
        proposition: PROPOSITION,
        finding: "converged, residual 3.1e-4",
      },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    // Both runs named what they read, and it was the same record. Nothing
    // differs, and the report says so without calling that a reproduction --
    // whether it is one depends on what the method does.
    expect(report.differs).toEqual([]);
    expect(report.verificationRead.map((i) => i.part)).toEqual(report.ofRead.map((i) => i.part));
    expect(report.ofRead).toHaveLength(1);
  });

  /**
   * Execution equality must not be compared by artefact *name* -- that is the identity-versus-
   * wording mistake, and it recurs.
   */
  test("two inputs sharing a name are not the same input", async () => {
    const { enquiry } = await session.openEnquiry(
      "does the annealed protocol converge below tolerance?",
    );
    const { observations: theirs } = await session.recordObservations({
      enquiry,
      name: "initial conditions",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    const { observations: mine } = await session.recordObservations({
      enquiry,
      name: "initial conditions",
      finding: "seed 91, tolerance 1e-3, 64 steps",
    });
    const { analysis: historical } = await recordAnalysis(session, {
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
      concludes: {
        proposition: PROPOSITION,
        finding: "converged, residual 2.9e-4",
      },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    // Both directions, and both are true: the re-run read an "initial conditions" the original
    // did not, and the original read one the re-run did not. Identical names, two artefacts,
    // two differences. The entries carry identity, so "which one changed" is answerable even
    // though the names collide.
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
   * Two runs that each recorded *nothing* must not compare equal — an empty
   * input record means provenance was never captured, not that the run
   * consumed nothing.
   */
  test("two runs that both recorded no inputs have not reproduced anything", async () => {
    const { enquiry, historical } = await aHistoricalResultWithNoRecordedInputs();
    const rerun = await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [],
      concludes: {
        proposition: PROPOSITION,
        finding: "converged, residual 2.9e-4",
      },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    // Neither run named anything. Two empty lists, and no claim that they
    // therefore match -- absence on both sides is still absence.
    expect(report.verificationRead).toEqual([]);
    expect(report.ofRead).toEqual([]);
  });

  /**
   * External review, finding 3c. The difference calculation only looked for
   * new-run inputs absent from the original, so dropping an input reported
   * `not-reproduced` with nothing named as differing.
   */
  test("an input the original used and the re-run did not is named", async () => {
    const { enquiry } = await session.openEnquiry(
      "does the annealed protocol converge below tolerance?",
    );
    const { observations: a } = await session.recordObservations({
      enquiry,
      name: "conditions A",
      finding: "seed 4",
    });
    const { observations: b } = await session.recordObservations({
      enquiry,
      name: "conditions B",
      finding: "warm start",
    });
    const { analysis: historical } = await recordAnalysis(session, {
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
      concludes: {
        proposition: PROPOSITION,
        finding: "converged, residual 2.9e-4",
      },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
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
    const { enquiry } = await session.openEnquiry(
      "does the annealed protocol converge below tolerance?",
    );
    const { analysis: historical } = await recordAnalysis(session, {
      enquiry,
      method: "annealing-v1",
      from: [],
      concludes: [
        {
          proposition: PROPOSITION,
          finding: "did not converge",
          bearing: "challenges",
        },
      ],
    });
    const { observations: conditions } = await session.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    const rerun = await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [conditions],
      concludes: {
        proposition: PROPOSITION,
        finding: "did not converge either",
        bearing: "challenges",
      },
    });

    const report = await (await afterwards()).reproductionOf(rerun.verification);
    expect(report.conclusion).toBe("agrees");
    // Agreeing with a negative finding does not raise confidence in the
    // proposition -- bearing is about the claim, not about the two runs.
    expect(report.bearing).toBe("lowers");
  });

  /**
   * External review, finding 5.
   */
  test("the claim does not rest on the re-run's inputs", async () => {
    const { enquiry } = await session.openEnquiry(
      "does the annealed protocol converge below tolerance?",
    );
    const { observations: original } = await session.recordObservations({
      enquiry,
      name: "original conditions",
      finding: "seed 1",
    });
    const { analysis: historical, claims: historicalClaims } = await recordAnalysis(session, {
      enquiry,
      method: "annealing-v1",
      from: [original],
      concludes: [{ proposition: PROPOSITION, finding: "converged, residual 3.1e-4" }],
    });
    const { observations: fresh } = await session.recordObservations({
      enquiry,
      name: "initial conditions, newly specified",
      finding: "seed 4, tolerance 1e-6, 512 steps",
    });
    await session.reverify({
      historical,
      enquiry,
      method: "annealing-v1, re-run",
      under: [fresh],
      concludes: {
        proposition: PROPOSITION,
        finding: "converged, residual 2.9e-4",
      },
    });

    const why = await (await afterwards()).whySupported(claimOf(historicalClaims, PROPOSITION));
    expect(why.support.map((s) => s.method)).toEqual(["annealing-v1"]);
    expect(why.reverifiedBy.map((r) => r.method)).toEqual(["annealing-v1, re-run"]);
    expect(why.restingOn.map((a) => a.name)).toEqual(["original conditions"]);
  });
});
