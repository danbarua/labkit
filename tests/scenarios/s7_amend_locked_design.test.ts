/**
 * S-7 — "Locked design, then feasibility finds a mechanical defect."
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, claimOf } from "../helpers/claims";
import { ref, type DesignHistory } from "../../src/domain/report";
import { recordAnalysis } from "../helpers/analysis";

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

const LOCKED_LIMIT = "the solver converges within 2,000 iterations";
const RAISED_LIMIT = "the solver converges within 10,000 iterations";
const PRESPECIFIED = "the primary comparison is run once, on held-out data";
const BEATS_CONTROL = "the evolved condition beats the rewired control";
const LOCKED_TOLERANCE = "the residual tolerance is 1e-9";
const RELAXED_TOLERANCE = "the residual tolerance is 1e-6";
const MULTICOLLINEAR =
  "non-convergence is driven by feature multicollinearity, not by the effect under test";

/**
 * A programme with a locked design and a confirmatory boundary already in place, plus one
 * result of each kind on the record.
 */
async function lockedProgramme() {
  const { enquiry } = await session.openEnquiry(
    "does the evolved condition beat the rewired control?",
  );

  const { work: confirmatoryWork } = await session.planWork({
    objective: "the prespecified comparison against the rewired control",
    acceptance: "one run, held-out data, no reanalysis",
  });
  const { criterion: prespecified } = await session.stateCriterion(PRESPECIFIED);
  const { gate: confirmatoryBoundary } = await session.declareGate({
    governedBy: [prespecified],
    consequence: "the confirmatory comparison may be relied on",
    protecting: [confirmatoryWork],
  });

  const { work: feasibilityWork } = await session.planWork({
    objective: "feasibility sweep of the evolved condition",
    acceptance: "the sweep converges and returns a usable fit",
  });
  const { criterion: iterationLimit } = await session.stateCriterion(LOCKED_LIMIT);
  const { gate: feasibilityBoundary } = await session.declareGate({
    governedBy: [iterationLimit],
    consequence: "feasibility results may be relied on",
    protecting: [feasibilityWork],
  });

  // One confirmatory result, already on the record before anything is amended.
  const { observations: heldOut } = await session.recordObservations({
    enquiry,
    name: "held-out comparison readings",
    finding: "evolved and rewired conditions measured on the held-out split",
  });
  const { analysis: confirmatory } = await recordAnalysis(session, {
    enquiry,
    method: "prespecified-comparison",
    implementing: confirmatoryWork,
    from: [heldOut],
    concludes: [
      {
        proposition: BEATS_CONTROL,
        finding: "evolved exceeds rewired on the held-out split",
        standing: "confirmatory",
      },
    ],
  });

  return {
    enquiry,
    confirmatoryWork,
    confirmatoryBoundary,
    prespecified,
    feasibilityWork,
    feasibilityBoundary,
    iterationLimit,
    confirmatory,
  };
}

/** The diagnosis the amendment will rest on — itself a result with its own provenance. */
async function diagnose(
  enquiry: Awaited<ReturnType<typeof lockedProgramme>>["enquiry"],
  work: Awaited<ReturnType<typeof lockedProgramme>>["feasibilityWork"],
) {
  const { observations: traces } = await session.recordObservations({
    enquiry,
    name: "non-convergence traces",
    finding: "solver hits the iteration cap on 9 of 10 sweeps",
  });
  const { analysis, claims: analysisClaims } = await recordAnalysis(session, {
    enquiry,
    method: "convergence-diagnosis",
    implementing: work,
    from: [traces],
    concludes: [
      {
        proposition: MULTICOLLINEAR,
        finding:
          "condition number rises with feature count; enlarging the sample does not reduce it",
      },
    ],
  });
  return {
    analysis,
    analysisClaims,
    cites: claimOf(analysisClaims, MULTICOLLINEAR),
  };
}

/**
 * The one condition on a single-condition gate. Every scenario below but the
 * last locks exactly one setting; asserting that here keeps the reads that
 * follow about the amendment rather than about which condition they picked.
 */
function theCondition(history: DesignHistory) {
  expect(history.conditions).toHaveLength(1);
  return history.conditions[0]!;
}

describe("S-7 — locked design, then feasibility finds a mechanical defect", () => {
  test("the conversation runs end to end through research verbs alone", async () => {
    const programme = await lockedProgramme();

    // Agent:      feasibility failed -- the evolved condition doesn't converge at the locked
    // limit. Researcher: is that evidence against the hypothesis, or an implementation
    // constraint? Agent:      diagnosis points to severe feature multicollinearity; increasing
    // the sample doesn't fix it.
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);

    // Researcher: raise the limit to 10,000 and rerun the affected feasibility
    //             work. Preserve the original setting and this diagnosis.
    const report = await session.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable for reasons unrelated to the effect under test",
      citing: cites,
    });

    // LabKit:     amendment recorded; the confirmatory boundary is untouched.
    expect(report.nature).toBe("mechanical");
    expect(report.confirmatoryAffected).toEqual([]);
    expect(report.rerun.map((w) => w.objective)).toEqual([
      "feasibility sweep of the evolved condition",
    ]);
  });

  /**
   * Afterward 1 — what did the design originally say, and what replaced it?
   */
  test("the original setting survives the amendment verbatim", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);
    await session.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });

    const history = await session.designHistory(programme.feasibilityBoundary);
    expect(theCondition(history).originally.requires).toBe(LOCKED_LIMIT);
    expect(theCondition(history).nowRequires.requires).toBe(RAISED_LIMIT);

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const durable = await later.designHistory(programme.feasibilityBoundary);
    expect(theCondition(durable).originally.requires).toBe(LOCKED_LIMIT);
    expect(theCondition(durable).nowRequires.requires).toBe(RAISED_LIMIT);
  });

  /**
   * Afterward 2 — why was it changed, and on what evidence?
   */
  test("the amendment cites its diagnosis, and the diagnosis has provenance of its own", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);
    await session.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable for reasons unrelated to the effect under test",
      citing: cites,
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const history = await later.designHistory(programme.feasibilityBoundary);
    expect(theCondition(history).amendments).toHaveLength(1);
    expect(theCondition(history).amendments[0]!.reason).toContain(
      "unrelated to the effect under test",
    );
    expect(theCondition(history).amendments[0]!.citing.map((f) => f.states)).toEqual([
      "condition number rises with feature count; enlarging the sample does not reduce it",
    ]);

    // ...and the cited diagnosis is a finding with a chain behind it, not an
    // assertion attached to the amendment.
    const why = await later.whySupported(await claimNamed(later, MULTICOLLINEAR));
    expect(why.verdict).toBe("supported");
    expect(why.restingOn.map((a) => a.name)).toContain("non-convergence traces");
  });

  /**
   * Afterward 3 — was any confirmatory result affected?
   */
  test("the confirmatory boundary is untouched, and shown to be", async () => {
    const programme = await lockedProgramme();
    const before = await session.gateStatus(programme.confirmatoryBoundary);

    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);
    const report = await session.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });

    const after = await session.gateStatus(programme.confirmatoryBoundary);
    expect(after).toEqual(before);

    // The confirmatory result is on the record, and is not in the blast radius.
    expect(report.confirmatoryAffected).toEqual([]);
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const standing = await later.whySupported(await claimNamed(later, BEATS_CONTROL));
    expect(standing.verdict).toBe("supported");
    expect(standing.superseded).toEqual([]);
  });

  /**
   * Afterward 4 — is this amendment mechanical or scientific?
   */
  test("mechanical and scientific amendments are told apart", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);

    const mechanical = await session.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });
    expect(mechanical.nature).toBe("mechanical");

    // Now amend the prespecified comparison itself -- the same act, aimed at
    // the confirmatory boundary.
    const scientific = await session.amendDesign({
      criterion: programme.prespecified,
      nowRequires: "the primary comparison is run on the full sample",
      because: "held-out only leaves the comparison underpowered",
      citing: cites,
    });
    expect(scientific.nature).toBe("scientific");
    expect(scientific.confirmatoryAffected.map((c) => c.asserts)).toEqual([BEATS_CONTROL]);

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const feasibility = await later.designHistory(programme.feasibilityBoundary);
    const confirmatory = await later.designHistory(programme.confirmatoryBoundary);
    expect(theCondition(feasibility).amendments[0]!.nature).toBe("mechanical");
    expect(theCondition(confirmatory).amendments[0]!.nature).toBe("scientific");
  });

  /**
   * Afterward 5 — which change happened first?
   */
  test("two amendments of one setting are ordered without timestamps or an event log", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);

    await session.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });

    const current = await session.designHistory(programme.feasibilityBoundary);
    const raised = theCondition(current).nowRequires.requires;
    expect(raised).toBe(RAISED_LIMIT);

    await session.amendDesign({
      criterion: theCondition(current).criterion,
      nowRequires: "the solver converges within 50,000 iterations",
      because: "10,000 still caps on the widest sweeps",
      citing: cites,
    });

    // An unrelated decision elsewhere in the programme, to show what this can
    // and cannot order.
    const { question: aside } = await session.pose({
      question: "should the sweep width be capped at all?",
    });
    await session.sharpen({
      from: aside,
      into: "does sweep width interact with convergence?",
      because: "worth separating",
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    expect(await later.events.all()).toHaveLength(0);

    const history = await later.designHistory(programme.feasibilityBoundary);
    expect(theCondition(history).originally.requires).toBe(LOCKED_LIMIT);
    expect(theCondition(history).nowRequires.requires).toBe(
      "the solver converges within 50,000 iterations",
    );
    expect(theCondition(history).amendments.map((a) => a.nowRequires.requires)).toEqual([
      RAISED_LIMIT,
      "the solver converges within 50,000 iterations",
    ]);
    expect(theCondition(history).amendments.map((a) => a.replaced.requires)).toEqual([
      LOCKED_LIMIT,
      RAISED_LIMIT,
    ]);

    // The second amendment stands instead of the first, and says so on the
    // record rather than only in the order this report happens to render.
    const [first, second] = theCondition(history).amendments;
    const stands = await later.why(second!.amendment);
    expect(stands.because.map((c) => c.handle)).toContain(first!.amendment);
  });

  /**
   * Afterward 6 — what else was rerun as a consequence?
   */
  test("the work forced to be rerun is enumerated, and stops at the amended boundary", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);

    const report = await session.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });

    expect(report.rerun.map((w) => w.objective)).toEqual([
      "feasibility sweep of the evolved condition",
    ]);
    expect(report.rerun).not.toContain("the prespecified comparison against the rewired control");

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const history = await later.designHistory(programme.feasibilityBoundary);
    expect(theCondition(history).amendments[0]!.rerun.map((w) => w.objective)).toEqual([
      "feasibility sweep of the evolved condition",
    ]);
  });

  /**
   * Amending a setting that has already been amended is refused.
   */
  /**
   * **Researcher:** The gate failed, I diagnosed why, I amended it in the open, and the amended
   * condition passes. Am I still blocked?
   */
  test("an amended-away condition stops holding the gate, and everFailed does not", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);

    // The locked condition fails on its first real run.
    await session.evaluateCriterion({
      criterion: programme.iterationLimit,
      gate: programme.feasibilityBoundary,
      value: "the run needed more iterations than the locked limit allows",
      outcome: "fail",
    });
    const held = await new ResearchSession(await scenario.current(), { clock }).gateStatus(
      programme.feasibilityBoundary,
    );
    expect(held.state).toBe("blocked");

    const report = await session.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });
    await session.evaluateCriterion({
      criterion: report.nowRequires.criterion,
      gate: programme.feasibilityBoundary,
      value: "clears the raised limit",
      outcome: "pass",
    });

    const after = await new ResearchSession(await scenario.current(), { clock }).gateStatus(
      programme.feasibilityBoundary,
    );
    expect(after.state).toBe("satisfied");
    // One live condition, not two: the retired one is gone from the count.
    expect(after.checks).toHaveLength(1);
    expect(after.counts.failed).toBe(0);
    // **And it still says it failed.** A gate that failed and was re-checked
    // must not read as though it never failed, whether the re-check came from
    // a re-run or from an amendment.
    expect(after.everFailed).toBe(true);

    // The retired condition is still readable where it belongs.
    const history = await new ResearchSession(await scenario.current(), { clock }).designHistory(
      programme.feasibilityBoundary,
    );
    expect(theCondition(history).originally.criterion).toBe(programme.iterationLimit);
  });

  test("a setting that has already been amended cannot be amended again", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);

    await session.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });
    const afterFirst = await session.designHistory(programme.feasibilityBoundary);

    await expect(
      session.amendDesign({
        criterion: programme.iterationLimit,
        nowRequires: "the solver converges within 25,000 iterations",
        because: "amending the superseded setting by mistake",
        citing: cites,
      }),
    ).rejects.toThrow(/has already been amended; amend the one now in force/);

    // The history still reads, and reads exactly as it did before.
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    expect(await later.designHistory(programme.feasibilityBoundary)).toEqual(afterFirst);
  });

  /** Amending a condition nobody stated writes nothing. */
  test("amending a criterion that is not on the record writes nothing", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);
    const before = await session.designHistory(programme.feasibilityBoundary);

    await expect(
      session.amendDesign({
        criterion: ref("criterion", "CRIT_404"),
        nowRequires: "something else entirely",
        because: "it should not get this far",
        citing: cites,
      }),
    ).rejects.toThrow(/no condition CRIT_404 to amend/);

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    expect(await later.designHistory(programme.feasibilityBoundary)).toEqual(before);
  });

  /**
   * **Researcher:** The feasibility boundary has two conditions on it — the iteration cap and a
   * tolerance. I raised the cap last week; today the tolerance moved too. Show me what happened
   * to my design.
   */
  test("a gate with two conditions has one history per condition, and they do not interleave", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);

    const { work } = await session.planWork({
      objective: "the widest feasibility sweep",
      acceptance: "it converges inside both locked settings",
    });
    const { criterion: cap } = await session.stateCriterion(LOCKED_LIMIT);
    const { criterion: tolerance } = await session.stateCriterion(LOCKED_TOLERANCE);
    const { gate } = await session.declareGate({
      governedBy: [cap, tolerance],
      consequence: "the sweep's results may be relied on",
      protecting: [work],
    });

    await session.amendDesign({
      criterion: cap,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });
    await session.amendDesign({
      criterion: tolerance,
      nowRequires: RELAXED_TOLERANCE,
      because: "the locked tolerance is below the solver's own noise floor",
      citing: cites,
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const history = await later.designHistory(gate);

    const byOriginal = new Map(history.conditions.map((c) => [c.originally.requires, c]));
    expect([...byOriginal.keys()].sort()).toEqual([LOCKED_LIMIT, LOCKED_TOLERANCE].sort());

    const capHistory = byOriginal.get(LOCKED_LIMIT)!;
    expect(capHistory.nowRequires.requires).toBe(RAISED_LIMIT);
    expect(capHistory.amendments.map((a) => a.nowRequires.requires)).toEqual([RAISED_LIMIT]);

    const tol = byOriginal.get(LOCKED_TOLERANCE)!;
    expect(tol.nowRequires.requires).toBe(RELAXED_TOLERANCE);
    expect(tol.amendments.map((a) => a.nowRequires.requires)).toEqual([RELAXED_TOLERANCE]);

    // The two amendments are unrelated acts. If the tolerance amendment
    // superseded the cap amendment, this record would say one setting was
    // replaced by a change to a different setting.
    expect(capHistory.amendments[0]!.amendment).not.toBe(tol.amendments[0]!.amendment);
    const withdrawal = await later.why(tol.amendments[0]!.amendment);
    expect(withdrawal.because.map((c) => c.handle)).not.toContain(
      capHistory.amendments[0]!.amendment,
    );
  });
});
