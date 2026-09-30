/**
 * S-7 — "Locked design, then feasibility finds a mechanical defect."
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, claimOf } from "../helpers/claims";
import { ref } from "@labkit/core-domain/report";
import { recordAnalysis } from "../helpers/analysis";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
/** The same graph, spoken to by the agent that ran the feasibility sweep. */
let agent: ResearchSession;
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
  session = new ResearchSession(graph, { clock, events, attribution: as("Researcher") });
  agent = new ResearchSession(graph, { clock, events, attribution: as("Agent") });
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
  const { enquiry } = await session.writes.openEnquiry(
    "does the evolved condition beat the rewired control?",
  );

  const { work: confirmatoryWork } = await session.writes.planWork({
    objective: "the prespecified comparison against the rewired control",
    acceptance: "one run, held-out data, no reanalysis",
  });
  const { criterion: prespecified } = await session.writes.stateCriterion(PRESPECIFIED);
  const { gate: confirmatoryBoundary } = await session.writes.declareGate({
    governedBy: [prespecified],
    consequence: "the confirmatory comparison may be relied on",
    protecting: [confirmatoryWork],
  });

  const { work: feasibilityWork } = await session.writes.planWork({
    objective: "feasibility sweep of the evolved condition",
    acceptance: "the sweep converges and returns a usable fit",
  });
  const { criterion: iterationLimit } = await session.writes.stateCriterion(LOCKED_LIMIT);
  const { gate: feasibilityBoundary } = await session.writes.declareGate({
    governedBy: [iterationLimit],
    consequence: "feasibility results may be relied on",
    protecting: [feasibilityWork],
  });

  // One confirmatory result, already on the record before anything is amended.
  const { observations: heldOut } = await session.writes.recordObservations({
    enquiry,
    name: "held-out comparison readings",
    finding: "evolved and rewired conditions measured on the held-out split",
  });
  const { analysis: confirmatory } = await recordAnalysis(session.writes, {
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
  who: ResearchSession = session,
) {
  const { observations: traces } = await who.writes.recordObservations({
    enquiry,
    name: "non-convergence traces",
    finding: "solver hits the iteration cap on 9 of 10 sweeps",
  });
  const { analysis, claims: analysisClaims } = await recordAnalysis(who.writes, {
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

describe("S-7 — locked design, then feasibility finds a mechanical defect", () => {
  test("the conversation runs end to end through research verbs alone", async () => {
    const programme = await lockedProgramme();

    // Agent:      feasibility failed -- the evolved condition doesn't converge at the locked
    // limit. Researcher: is that evidence against the hypothesis, or an implementation
    // constraint? Agent:      diagnosis points to severe feature multicollinearity; increasing
    // the sample doesn't fix it.
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork, agent);

    // Researcher: raise the limit to 10,000 and rerun the affected feasibility
    //             work. Preserve the original setting and this diagnosis.
    const report = await session.writes.amendDesign({
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

    await captureConversation(
      {
        id: "S-7",
        title: "locked design, then feasibility finds a mechanical defect",
        about:
          "The solver cannot reach the iteration limit the design locked, for reasons unrelated to the effect under test. The limit is raised in the open, citing the diagnosis, and the confirmatory comparison is left untouched.",
      },
      events,
    );
  });

  /**
   * Afterward 1 — what did the design originally say, and what replaced it?
   */
  test("the original setting survives the amendment verbatim", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);
    const report = await session.writes.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const amendment = await later.reads.why({ subject: report.amendment });
    expect(amendment.because).toContainEqual({
      handle: programme.iterationLimit,
      wording: `replaced ${LOCKED_LIMIT}`,
    });
    expect(amendment.because).toContainEqual({
      handle: report.nowRequires.criterion,
      wording: `led to ${RAISED_LIMIT}`,
    });

    const original = await later.reads.why({ subject: programme.iterationLimit });
    if (original.kind !== "criterion")
      throw new Error(`expected a criterion, got ${original.kind}`);
    expect(original.report.requires).toBe(LOCKED_LIMIT);
  });

  /**
   * Afterward 2 — why was it changed, and on what evidence?
   */
  test("the amendment cites its diagnosis, and the diagnosis has provenance of its own", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);
    const report = await session.writes.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable for reasons unrelated to the effect under test",
      citing: cites,
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const amendment = await later.reads.why({ subject: report.amendment });
    expect(amendment.is).toContain("unrelated to the effect under test");
    expect(amendment.because.map((c) => c.wording)).toContain(
      "rests on condition number rises with feature count; enlarging the sample does not reduce it",
    );

    // ...and the cited diagnosis is a finding with a chain behind it, not an
    // assertion attached to the amendment.
    const why = await later.reads.whySupported({
      claim: await claimNamed(later.reads, MULTICOLLINEAR),
    });
    expect(why.verdict).toBe("supported");
    expect(why.restingOn.map((a) => a.name)).toContain("non-convergence traces");
  });

  /**
   * Afterward 3 — was any confirmatory result affected?
   */
  test("the confirmatory boundary is untouched, and shown to be", async () => {
    const programme = await lockedProgramme();
    const before = await session.reads.gateStatus({ gate: programme.confirmatoryBoundary });

    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);
    const report = await session.writes.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });

    const after = await session.reads.gateStatus({ gate: programme.confirmatoryBoundary });
    expect(after).toEqual(before);

    // The confirmatory result is on the record, and is not in the blast radius.
    expect(report.confirmatoryAffected).toEqual([]);
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const standing = await later.reads.whySupported({
      claim: await claimNamed(later.reads, BEATS_CONTROL),
    });
    expect(standing.verdict).toBe("supported");
    expect(standing.superseded).toEqual([]);
  });

  /**
   * Afterward 4 — is this amendment mechanical or scientific?
   */
  test("mechanical and scientific amendments are told apart", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);

    const mechanical = await session.writes.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });
    expect(mechanical.nature).toBe("mechanical");

    // Now amend the prespecified comparison itself -- the same act, aimed at
    // the confirmatory boundary.
    const scientific = await session.writes.amendDesign({
      criterion: programme.prespecified,
      nowRequires: "the primary comparison is run on the full sample",
      because: "held-out only leaves the comparison underpowered",
      citing: cites,
    });
    expect(scientific.nature).toBe("scientific");
    expect(scientific.confirmatoryAffected.map((c) => c.asserts)).toEqual([BEATS_CONTROL]);
  });

  /**
   * Afterward 5 — which change happened first?
   */
  test("two amendments of one setting are ordered without timestamps or an event log", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);

    const first = await session.writes.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });
    const second = await session.writes.amendDesign({
      criterion: first.nowRequires.criterion,
      nowRequires: "the solver converges within 50,000 iterations",
      because: "10,000 still caps on the widest sweeps",
      citing: cites,
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    expect(await later.events.all()).toHaveLength(0);

    const gate = await later.reads.gateStatus({ gate: programme.feasibilityBoundary });
    expect(gate.checks.map((c) => c.proposition)).toEqual([
      "the solver converges within 50,000 iterations",
    ]);

    // The second amendment stands instead of the first, and says so on the
    // record rather than only in the order the acts were taken.
    const stands = await later.reads.why({ subject: second.amendment });
    expect(stands.because.map((c) => c.handle)).toContain(first.amendment);
    expect(stands.because).toContainEqual({
      handle: first.nowRequires.criterion,
      wording: `replaced ${RAISED_LIMIT}`,
    });
  });

  /**
   * Afterward 6 — what else was rerun as a consequence?
   */
  test("the work forced to be rerun is enumerated, and stops at the amended boundary", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);

    const report = await session.writes.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });

    expect(report.rerun.map((w) => w.objective)).toEqual([
      "feasibility sweep of the evolved condition",
    ]);
    expect(report.rerun).not.toContain("the prespecified comparison against the rewired control");
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
    await session.writes.evaluateCriterion({
      criterion: programme.iterationLimit,
      gate: programme.feasibilityBoundary,
      value: "the run needed more iterations than the locked limit allows",
      outcome: "fail",
    });
    const held = await new ResearchSession(await scenario.current(), { clock }).reads.gateStatus({
      gate: programme.feasibilityBoundary,
    });
    expect(held.state).toBe("blocked");

    const report = await session.writes.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });
    await session.writes.evaluateCriterion({
      criterion: report.nowRequires.criterion,
      gate: programme.feasibilityBoundary,
      value: "clears the raised limit",
      outcome: "pass",
    });

    const after = await new ResearchSession(await scenario.current(), { clock }).reads.gateStatus({
      gate: programme.feasibilityBoundary,
    });
    expect(after.state).toBe("satisfied");
    // One live condition, not two: the retired one is gone from the count.
    expect(after.checks).toHaveLength(1);
    expect(after.counts.failed).toBe(0);
    // **And it still says it failed.** A gate that failed and was re-checked
    // must not read as though it never failed, whether the re-check came from
    // a re-run or from an amendment.
    expect(after.everFailed).toBe(true);

    // The amended-away condition is still readable where it belongs.
    const original = await new ResearchSession(await scenario.current(), { clock }).reads.why({
      subject: programme.iterationLimit,
    });
    if (original.kind !== "criterion")
      throw new Error(`expected a criterion, got ${original.kind}`);
    expect(original.report.requires).toBe(LOCKED_LIMIT);
    expect(original.report.state).toBe("failed");
  });

  test("a setting that has already been amended cannot be amended again", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);

    await session.writes.amendDesign({
      criterion: programme.iterationLimit,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });
    const afterFirst = await session.reads.gateStatus({ gate: programme.feasibilityBoundary });

    await expect(
      session.writes.amendDesign({
        criterion: programme.iterationLimit,
        nowRequires: "the solver converges within 25,000 iterations",
        because: "amending the superseded setting by mistake",
        citing: cites,
      }),
    ).rejects.toThrow(/has already been amended/);

    // The gate still reads, and reads exactly as it did before.
    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    expect(await later.reads.gateStatus({ gate: programme.feasibilityBoundary })).toEqual(
      afterFirst,
    );
  });

  /** Amending a condition nobody stated writes nothing. */
  test("amending a criterion that is not on the record writes nothing", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);
    const before = await session.reads.gateStatus({ gate: programme.feasibilityBoundary });

    await expect(
      session.writes.amendDesign({
        criterion: ref("criterion", "CRIT_404"),
        nowRequires: "something else entirely",
        because: "it should not get this far",
        citing: cites,
      }),
    ).rejects.toThrow(/CRIT_404 not found/);

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    expect(await later.reads.gateStatus({ gate: programme.feasibilityBoundary })).toEqual(before);
  });

  /**
   * **Researcher:** The feasibility boundary has two conditions on it — the iteration cap and a
   * tolerance. I raised the cap last week; today the tolerance moved too. Show me what happened
   * to my design.
   */
  test("a gate with two conditions has one history per condition, and they do not interleave", async () => {
    const programme = await lockedProgramme();
    const { cites } = await diagnose(programme.enquiry, programme.feasibilityWork);

    const { work } = await session.writes.planWork({
      objective: "the widest feasibility sweep",
      acceptance: "it converges inside both locked settings",
    });
    const { criterion: cap } = await session.writes.stateCriterion(LOCKED_LIMIT);
    const { criterion: tolerance } = await session.writes.stateCriterion(LOCKED_TOLERANCE);
    const { gate } = await session.writes.declareGate({
      governedBy: [cap, tolerance],
      consequence: "the sweep's results may be relied on",
      protecting: [work],
    });

    const capAmended = await session.writes.amendDesign({
      criterion: cap,
      nowRequires: RAISED_LIMIT,
      because: "the locked limit is unreachable",
      citing: cites,
    });
    const tolAmended = await session.writes.amendDesign({
      criterion: tolerance,
      nowRequires: RELAXED_TOLERANCE,
      because: "the locked tolerance is below the solver's own noise floor",
      citing: cites,
    });

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const status = await later.reads.gateStatus({ gate });
    expect(status.checks.map((c) => c.proposition).sort()).toEqual(
      [RAISED_LIMIT, RELAXED_TOLERANCE].sort(),
    );

    // Each amendment replaced its own setting and nothing else.
    const capWhy = await later.reads.why({ subject: capAmended.amendment });
    expect(capWhy.because).toContainEqual({ handle: cap, wording: `replaced ${LOCKED_LIMIT}` });
    const tolWhy = await later.reads.why({ subject: tolAmended.amendment });
    expect(tolWhy.because).toContainEqual({
      handle: tolerance,
      wording: `replaced ${LOCKED_TOLERANCE}`,
    });

    // The two amendments are unrelated acts. If the tolerance amendment
    // superseded the cap amendment, this record would say one setting was
    // replaced by a change to a different setting.
    expect(capAmended.amendment).not.toBe(tolAmended.amendment);
    expect(tolWhy.because.map((c) => c.handle)).not.toContain(capAmended.amendment);
  });
});
