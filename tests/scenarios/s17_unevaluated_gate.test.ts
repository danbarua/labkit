/**
 * S-17 — "Does the guard actually guard?"
 * docs/project-journal/008_user_story_mining.md
 *
 * A gate's status must depend on evidence that its criterion was actually
 * evaluated, not on the presence of something named "gate". PJ-008 predicts
 * this passes: PJ-004 #9 reshaped the chain so nothing flows out of a gate
 * that no evaluation triggered. S-17 tests whether that reshaping bought what
 * it was supposed to.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

const FIXED_NOW = "2026-08-18T12:00:00.000Z";
const clock: Clock = { now: () => FIXED_NOW };

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });
beforeEach(async () => {
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events });
});
afterEach(async () => { await scenario.end(); });

/** The state the agent describes as "the verification gate is implemented". */
async function aDeclaredButUnevaluatedGate() {
  const promotion = await session.planWork({
    objective: "promote the accelerated implementation to reference",
    acceptance: "protected artefact matches its recorded hash",
  });
  const criterion = await session.stateCriterion("the protected artefact matches its recorded hash");
  const gate = await session.declareGate({
    criterion,
    consequence: "block promotion unless the artefact verifies",
    protecting: [promotion],
  });
  return { promotion, criterion, gate };
}

describe("S-17: does the guard actually guard?", () => {
  test("Afterward 1: a declared but unevaluated gate is 'never evaluated', not 'passed'", async () => {
    const { gate } = await aDeclaredButUnevaluatedGate();

    const status = await session.gateStatus(gate);
    expect(status.state).toBe("never-evaluated");
    expect(status.state).not.toBe("satisfied");
  });

  test("Afterward 2: the evidence that its criterion was evaluated is stated as none", async () => {
    const { gate } = await aDeclaredButUnevaluatedGate();

    const status = await session.gateStatus(gate);
    expect(status.evaluations).toEqual([]);
  });

  test("Afterward 3: what relies on this gate is enumerable", async () => {
    const { gate } = await aDeclaredButUnevaluatedGate();

    const status = await session.gateStatus(gate);
    expect(status.gating).toEqual(["promote the accelerated implementation to reference"]);
  });

  test("Afterward 4: 'has it ever been shown to fail' is separate from 'has it ever passed'", async () => {
    const { criterion, gate } = await aDeclaredButUnevaluatedGate();

    // The guard runs and reports a pass. It has still never been shown able
    // to fail, which is exactly what the reviewer demanded evidence of.
    await session.evaluateCriterion({ criterion, gate, value: "hash matches", outcome: "pass" });

    const status = await session.gateStatus(gate);
    expect(status.state).toBe("satisfied");
    expect(status.everFailed).toBe(false);
  });

  test("a failing evaluation blocks the gate rather than leaving it unevaluated", async () => {
    const { criterion, gate } = await aDeclaredButUnevaluatedGate();
    await session.evaluateCriterion({ criterion, gate, value: "hash differs", outcome: "fail" });

    const status = await session.gateStatus(gate);
    expect(status.state).toBe("blocked");
    expect(status.everFailed).toBe(true);
    // Distinguishable from never-evaluated -- the whole point.
    expect(status.evaluations).toHaveLength(1);
  });

  /**
   * What makes GOVERNS load-bearing rather than merely written: "has this
   * guard been shown able to fail?" is a question about the criterion, so it
   * is answered across every evaluation of the governing criterion — not only
   * those that happened to trigger this particular gate.
   */
  test("a criterion shown to fail on one gate counts as demonstrated for another it governs", async () => {
    const criterion = await session.stateCriterion("the protected artefact matches its recorded hash");
    const stagingWork = await session.planWork({ objective: "publish to staging", acceptance: "verified" });
    const releaseWork = await session.planWork({ objective: "publish to release", acceptance: "verified" });

    const stagingGate = await session.declareGate({
      criterion,
      consequence: "block staging unless the artefact verifies",
      protecting: [stagingWork],
    });
    const releaseGate = await session.declareGate({
      criterion,
      consequence: "block release unless the artefact verifies",
      protecting: [releaseWork],
    });

    // The check demonstrably fires on staging.
    await session.evaluateCriterion({ criterion, gate: stagingGate, value: "hash differs", outcome: "fail" });

    const release = await session.gateStatus(releaseGate);
    // Release itself has never been evaluated -- that must not read as passed.
    expect(release.state).toBe("never-evaluated");
    expect(release.evaluations).toEqual([]);
    // But the check it relies on HAS been shown able to fail.
    expect(release.everFailed).toBe(true);
  });

  /**
   * The reviewer's actual demand: "show me evidence that it fails when the
   * protected artefact is wrong." That is a question about the CRITERION, not
   * about this gate's history -- it should be answerable without knowing
   * which gate to ask about.
   */
  test("Afterward 2, restated: which criterion governs this gate?", async () => {
    const { gate, criterion } = await aDeclaredButUnevaluatedGate();

    const governing = await session.criterionGoverning(gate);
    expect(governing).not.toBeNull();
    expect(governing!.id).toBe(criterion.id);
  });
});
