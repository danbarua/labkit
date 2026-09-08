/**
 * S-8 — "Don't spend the whole budget discovering the pipeline is broken."
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { ref } from "../../src/domain/report";
import { recordAnalysis } from "../helpers/analysis";
import { evaluationsOf } from "../helpers/criteria";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

const FIXED_NOW = "2026-08-19T10:00:00.000Z";
const clock: Clock = { now: () => FIXED_NOW };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events });
});
afterEach(async () => {
  await scenario.end();
});

/** A second reader over the same graph — see tests/helpers/scenario.ts on what this proves. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

const THROUGHPUT = "the pipeline sustains 40 images per second on the feasibility slice";
const SOLVER_HEALTH = "the solver converges on every feasibility fold";
const COST = "a full run costs roughly 9,000 GPU-hours at the current throughput";

/**
 * A staged programme: a cheap feasibility step, and an expensive full run that may not start
 * until two conditions are established.
 */
async function aStagedProgramme() {
  const { enquiry } = await session.openEnquiry(
    "does the learned topology classify better than the baseline?",
  );

  const { work: feasibility } = await session.planWork({
    objective: "feasibility slice: 1,000 training images",
    acceptance: "the pipeline runs end to end and reports throughput",
    mayRead: ["the 1,000-image training slice"],
  });
  const { work: fullRun } = await session.planWork({
    objective: "the full classification run",
    acceptance: "all folds complete on the full training set",
    mayRead: ["the full training set"],
  });

  const { criterion: throughput } = await session.stateCriterion(THROUGHPUT);
  const { criterion: solverHealth } = await session.stateCriterion(SOLVER_HEALTH);
  const { gate: advancement } = await session.declareGate({
    governedBy: [throughput, solverHealth],
    consequence: "the full run may start",
    protecting: [fullRun],
  });

  return {
    enquiry,
    feasibility,
    fullRun,
    throughput,
    solverHealth,
    advancement,
  };
}

describe("S-8 — don't spend the whole budget discovering the pipeline is broken", () => {
  test("the conversation runs end to end through research verbs alone", async () => {
    const programme = await aStagedProgramme();

    // Researcher: run the classification stage. LabKit:     the first feasibility step is ready
    // — 1,000 training images. The official test data is not accessible to this task.
    const contract = await session.contractFor(programme.feasibility);
    expect(contract.mayRead).toEqual(["the 1,000-image training slice"]);
    expect(contract.mayRead).not.toContain("the held-out official test set");

    // Agent:      first step passed.
    const { observations: readings } = await session.recordObservations({
      enquiry: programme.enquiry,
      name: "feasibility slice timings",
      finding: "1,000 images processed, wall-clock and per-fold solver traces recorded",
    });
    const { claims: measuredClaims } = await recordAnalysis(session, {
      enquiry: programme.enquiry,
      method: "throughput-and-convergence",
      implementing: programme.feasibility,
      from: [readings],
      concludes: [
        {
          proposition: THROUGHPUT,
          finding: "sustained 44 images per second across the slice",
        },
        {
          proposition: COST,
          finding: "9,100 GPU-hours projected from the measured rate",
        },
      ],
    });

    // LabKit:     before scaling, the next step must establish throughput and
    //             solver-health conditions.
    await session.evaluateCriterion({
      criterion: programme.throughput,
      gate: programme.advancement,
      value: "44 images per second",
      outcome: "pass",
      citing: [claimOf(measuredClaims, THROUGHPUT)],
    });

    const status = await session.gateStatus(programme.advancement);
    expect(status.state).toBe("incomplete");
    expect(status.unmet.map((u) => u.requires)).toEqual([SOLVER_HEALTH]);
  });

  /**
   * Afterward 1 — why can't the full run start?
   */
  test("the condition blocking the expensive run is named, and 'some checked' is not 'all passed'", async () => {
    const programme = await aStagedProgramme();
    const { claims: measuredClaims } = await aPassingFeasibilityStep(programme);

    await session.evaluateCriterion({
      criterion: programme.throughput,
      gate: programme.advancement,
      value: "44 images per second",
      outcome: "pass",
      citing: [claimOf(measuredClaims, THROUGHPUT)],
    });

    const status = await session.gateStatus(programme.advancement);
    expect(await (await afterwards()).gateStatus(programme.advancement)).toEqual(status);

    expect(status.state).toBe("incomplete");
    expect(status.state).not.toBe("satisfied");
    expect(status.unmet.map((u) => u.requires)).toEqual([SOLVER_HEALTH]);
    expect(status.gating.map((g) => g.objective)).toEqual(["the full classification run"]);

    // The same gate, from the condition's side, must name the same work.
    // Two pages that disagree about what a gate protects is the defect the
    // detail page was split out to remove -- and the first version of this
    // read matched a `BLOCKS` edge that does not exist, so it reported
    // nothing protected while the gate page reported the task.
    const held = status.checks.find((c) => c.proposition === SOLVER_HEALTH)!;
    const standing = await session.criterionStanding(held.criterion);
    const governed = standing.governs.find((g) => g.gate === programme.advancement)!;
    expect(governed.protecting.map((w) => w.objective)).toEqual(
      status.gating.map((g) => g.objective),
    );
    expect(governed.protecting.map((w) => w.work)).toEqual(status.gating.map((g) => g.work));

    const byName = Object.fromEntries(status.checks.map((c) => [c.proposition, c.state]));
    expect(byName[THROUGHPUT]).toBe("passed");
    expect(byName[SOLVER_HEALTH]).toBe("never-run");
  });

  /**
   * Afterward 2 — which conditions have been evaluated, and on what evidence?
   */
  test("an evidence-backed evaluation is distinguishable from a bare assertion", async () => {
    const programme = await aStagedProgramme();
    const { claims: measuredClaims } = await aPassingFeasibilityStep(programme);

    await session.evaluateCriterion({
      criterion: programme.throughput,
      gate: programme.advancement,
      value: "44 images per second",
      outcome: "pass",
      citing: [claimOf(measuredClaims, THROUGHPUT)],
    });
    // The same verdict, asserted rather than measured.
    await session.evaluateCriterion({
      criterion: programme.solverHealth,
      gate: programme.advancement,
      value: "looked fine",
      outcome: "pass",
    });

    const later = await afterwards();
    const status = await later.gateStatus(programme.advancement);
    const byName = Object.fromEntries(status.checks.map((c) => [c.proposition, c]));

    // Through the drill-down: a gate says what state each check is in, and
    // what a verdict rested on is a question about one criterion (#241).
    const throughput = await evaluationsOf(later, byName[THROUGHPUT]!);
    expect(throughput[0]!.basis.map((b) => b.states)).toEqual([
      "sustained 44 images per second across the slice",
    ]);
    expect((await evaluationsOf(later, byName[SOLVER_HEALTH]!))[0]!.basis).toEqual([]);

    // Both passed. Only one was shown anything.
    expect(status.state).toBe("satisfied");
  });

  /**
   * Afterward 3 — what is this task allowed to touch?
   */
  test("a task's contract is recorded and readable, and is advisory", async () => {
    const programme = await aStagedProgramme();

    const later = await afterwards();
    const contract = await later.contractFor(programme.feasibility);
    expect(contract.objective).toBe("feasibility slice: 1,000 training images");
    expect(contract.mayRead).toEqual(["the 1,000-image training slice"]);
    // Advisory. Nothing stops a process reading whatever it likes; LabKit
    // records the contract and does not police it. The story's own
    // expressibility note concedes this, and the scenario says so rather than
    // implying a guarantee the system cannot give.
    expect(contract.enforced).toBe(false);

    const full = await later.contractFor(programme.fullRun);
    expect(full.mayRead).toEqual(["the full training set"]);
  });

  /**
   * Afterward 4 — on what projected cost?
   */
  test("the projected cost is a finding with provenance, not a number in a comment", async () => {
    const programme = await aStagedProgramme();
    const { claims: measuredClaims } = await aPassingFeasibilityStep(programme);

    const later = await afterwards();
    const why = await later.whySupported(claimOf(measuredClaims, COST));
    expect(why.verdict).toBe("supported");
    expect(why.support.map((s) => s.finding)).toEqual([
      "9,100 GPU-hours projected from the measured rate",
    ]);
    expect(why.restingOn.map((a) => a.name)).toEqual(["feasibility slice timings"]);
  });

  /**
   * The other half of row V.
   */
  test("gating work does not change the standing of the findings involved", async () => {
    const programme = await aStagedProgramme();
    const { claims: measuredClaims } = await aPassingFeasibilityStep(programme);

    const before = await session.whySupported(claimOf(measuredClaims, THROUGHPUT));

    await session.evaluateCriterion({
      criterion: programme.throughput,
      gate: programme.advancement,
      value: "44 images per second",
      outcome: "pass",
      citing: [claimOf(measuredClaims, THROUGHPUT)],
    });

    const later = await afterwards();
    const after = await later.whySupported(claimOf(measuredClaims, THROUGHPUT));
    expect(after).toEqual(before);

    // ...and the gate knows nothing about claims either. What it protects is
    // work.
    const status = await later.gateStatus(programme.advancement);
    expect(status.gating.map((g) => g.objective)).toEqual(["the full classification run"]);
  });

  /** A citation must be one the cited analysis actually reached. */
  test("an evaluation cannot cite a claim that does not exist", async () => {
    const programme = await aStagedProgramme();
    await aPassingFeasibilityStep(programme);

    await expect(
      session.evaluateCriterion({
        criterion: programme.throughput,
        gate: programme.advancement,
        value: "44 images per second",
        outcome: "pass",
        citing: [ref("claim", "CLM_99999")],
      }),
    ).rejects.toThrow(/no finding bears on claim CLM_99999/);

    const later = await afterwards();
    expect((await later.gateStatus(programme.advancement)).state).toBe("never-evaluated");
  });
});

/** The feasibility step, run and measured. */
async function aPassingFeasibilityStep(programme: Awaited<ReturnType<typeof aStagedProgramme>>) {
  const { observations: readings } = await session.recordObservations({
    enquiry: programme.enquiry,
    name: "feasibility slice timings",
    finding: "1,000 images processed, wall-clock and per-fold solver traces recorded",
  });
  return await recordAnalysis(session, {
    enquiry: programme.enquiry,
    method: "throughput-and-convergence",
    implementing: programme.feasibility,
    from: [readings],
    concludes: [
      {
        proposition: THROUGHPUT,
        finding: "sustained 44 images per second across the slice",
      },
      {
        proposition: COST,
        finding: "9,100 GPU-hours projected from the measured rate",
      },
    ],
  });
}
