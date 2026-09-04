/**
 * S-7 — "Locked design, then feasibility finds a mechanical defect."
 * docs/project-journal/008_user_story_mining.md
 *
 * The first scenario where sequence genuinely matters, and the first to put
 * an explicit researcher decision in the middle of the record.
 *
 * Nothing is pre-decided about: what "locked" means, whether decision
 * chronology needs stored timestamps, whether `SUPERSEDES` is enough to
 * reconstruct before/after, whether edges need properties, or whether
 * mechanical-vs-scientific is a property or derivable.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, claimOf } from "../helpers/claims";
import { ref } from "../../src/domain/report";
import { recordAnalysis } from "../../fragments";

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
const MULTICOLLINEAR =
  "non-convergence is driven by feature multicollinearity, not by the effect under test";

/**
 * A programme with a locked design and a confirmatory boundary already in
 * place, plus one result of each kind on the record.
 *
 * The two boundaries are deliberately separate gates over separate work: the
 * whole question S-7 asks is whether repairing one can be shown not to touch
 * the other, and that is only a real question if they were capable of
 * touching.
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

describe("S-7 — locked design, then feasibility finds a mechanical defect", () => {
  test("the conversation runs end to end through research verbs alone", async () => {
    const programme = await lockedProgramme();

    // Agent:      feasibility failed -- the evolved condition doesn't converge
    //             at the locked limit.
    // Researcher: is that evidence against the hypothesis, or an
    //             implementation constraint?
    // Agent:      diagnosis points to severe feature multicollinearity;
    //             increasing the sample doesn't fix it.
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
   *
   * The original setting is still readable in its own words. Amending is not
   * editing.
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
    expect(history.originally.requires).toBe(LOCKED_LIMIT);
    expect(history.nowRequires.requires).toBe(RAISED_LIMIT);

    const later = new ResearchSession(await scenario.current(), {
      clock,
      events: inMemoryEventLog(),
    });
    const durable = await later.designHistory(programme.feasibilityBoundary);
    expect(durable.originally.requires).toBe(LOCKED_LIMIT);
    expect(durable.nowRequires.requires).toBe(RAISED_LIMIT);
  });

  /**
   * Afterward 2 — why was it changed, and on what evidence?
   *
   * The diagnosis is cited specifically, and has its own provenance: it is a
   * finding of a real analysis, not a sentence typed into the amendment.
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
    expect(history.amendments).toHaveLength(1);
    expect(history.amendments[0]!.reason).toContain("unrelated to the effect under test");
    expect(history.amendments[0]!.citing.map((f) => f.states)).toEqual([
      "condition number rises with feature count; enlarging the sample does not reduce it",
    ]);

    // ...and the cited diagnosis is a finding with a chain behind it, not an
    // assertion attached to the amendment.
    const why = await later.whySupported(await claimNamed(later, MULTICOLLINEAR));
    expect(why.supported).toBe(true);
    expect(why.restingOn.map((a) => a.name)).toContain("non-convergence traces");
  });

  /**
   * Afterward 3 — was any confirmatory result affected?
   *
   * Demonstrated, not asserted: the confirmatory boundary reports exactly what
   * it reported before, and the amendment's blast radius is enumerated rather
   * than declared empty.
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
    expect(standing.supported).toBe(true);
    expect(standing.superseded).toEqual([]);
  });

  /**
   * Afterward 4 — is this amendment mechanical or scientific?
   *
   * The distinction has to survive into the record, because it is what
   * separates a legitimate repair from p-hacking. Two amendments, one of each
   * kind, because a scenario that only ever produces "mechanical" cannot show
   * the answer is derived rather than defaulted.
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
    expect(feasibility.amendments[0]!.nature).toBe("mechanical");
    expect(confirmatory.amendments[0]!.nature).toBe("scientific");
  });

  /**
   * Afterward 5 — which change happened first?
   *
   * Asked after both have happened, from a session with an empty event log,
   * with no timestamp on any decision. If this can only be answered by the
   * order natural ids happen to have been allocated in, it is not answered.
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
    const raised = current.nowRequires.requires;
    expect(raised).toBe(RAISED_LIMIT);

    await session.amendDesign({
      criterion: current.criterion,
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
    expect(history.originally.requires).toBe(LOCKED_LIMIT);
    expect(history.nowRequires.requires).toBe("the solver converges within 50,000 iterations");
    expect(history.amendments.map((a) => a.nowRequires.requires)).toEqual([
      RAISED_LIMIT,
      "the solver converges within 50,000 iterations",
    ]);
    expect(history.amendments.map((a) => a.replaced.requires)).toEqual([
      LOCKED_LIMIT,
      RAISED_LIMIT,
    ]);
  });

  /**
   * Afterward 6 — what else was rerun as a consequence?
   *
   * Enumerated, not "everything downstream", and reaching only the work the
   * amended condition actually protected.
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
    expect(history.amendments[0]!.rerun.map((w) => w.objective)).toEqual([
      "feasibility sweep of the evolved condition",
    ]);
  });

  /**
   * Amending a setting that has already been amended is refused.
   *
   * It would fork the design: two conditions in force at once, and no answer
   * to "what does this design require". Refusing the command is better than
   * accepting it and having the history throw at read time — writing state
   * that cannot be read back is the one outcome with nothing to recommend it.
   */
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
});
