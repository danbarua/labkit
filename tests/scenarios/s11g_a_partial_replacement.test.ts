/**
 * S-11g — "The replacement addressed three of four conclusions."
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { reanalyse, recordAnalysis } from "../helpers/analysis";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
/** The same graph, spoken to by the person who reviews rather than the one who ran it. */
let reviewer: ResearchSession;
let events: EventSink;

const clock: Clock = { now: () => "2026-09-01T09:00:00.000Z" };

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
  reviewer = new ResearchSession(graph, { clock, events, attribution: as("Reviewer") });
});
afterEach(async () => {
  await scenario.end();
});

/** Two of Bonsai's four comparisons: one the re-analysis revisits, one it excludes. */
const REVISITED = "T differs from the current-random control";
const EXCLUDED = "T differs from the lattice control";
const AGGREGATION = "the aggregation is done on the correct scale";

/**
 * Researcher: "One run, four comparisons. Then we found the aggregation was on the wrong scale
 * for the stochastic controls — but not for the lattice one, and that result stands as final."
 */
async function aRunPartlyReAnalysed(holdTo = false) {
  const { enquiry } = await session.writes.openEnquiry("does T differ from its controls?");
  const { observations } = await session.writes.recordObservations({
    enquiry,
    name: "per-image results",
    finding: "T and four controls, twelve images each",
  });
  // **Held to a criterion only when the test is about one.** `heldTo` is per
  // analysis, so a criterion here qualifies BOTH conclusions -- which makes
  // `supported` on the untouched finding an answer about the check rather than
  // about supersession, and the first test would have been asserting the wrong
  // thing while passing for a reason it did not name.
  const criterion = holdTo
    ? (await session.writes.stateCriterion(AGGREGATION)).criterion
    : undefined;
  const { analysis: v1, claims: v1Claims } = await recordAnalysis(session.writes, {
    enquiry,
    method: "raw-scale aggregation",
    from: [observations],
    ...(criterion === undefined ? {} : { heldTo: [criterion] }),
    concludes: [
      { proposition: REVISITED, finding: "p = 0.03 raw" },
      { proposition: EXCLUDED, finding: "p = 0.41 raw" },
    ],
  });
  return {
    enquiry,
    observations,
    criterion,
    v1,
    revisited: claimOf(v1Claims, REVISITED),
    stands: claimOf(v1Claims, EXCLUDED),
  };
}

/** The re-analysis, replacing the one finding it revisits and naming no other. */
async function theLogScaleReAnalysis(w: Awaited<ReturnType<typeof aRunPartlyReAnalysed>>) {
  await reviewer.writes.note({
    text: "raw-scale aggregation is untrustworthy for the stochastic-control comparisons",
    on: w.v1,
  });
  return reanalyse(session.writes, {
    enquiry: w.enquiry,
    method: "log-scale re-aggregation",
    from: [w.observations],
    concludes: [{ proposition: REVISITED, finding: "p = 0.007 log", replacing: w.revisited }],
  });
}

async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

describe("S-11g — a replacement that addresses only some of a run's conclusions", () => {
  /**
   * The finding nothing named. Both halves matter: a fix that cleared
   * `superseded` while leaving `restingOn` empty would read as a whole fix.
   */
  test("a finding the replacement never named still stands, and still rests on its input", async () => {
    const w = await aRunPartlyReAnalysed();
    await theLogScaleReAnalysis(w);

    const why = await (await afterwards()).reads.whySupported({ claim: w.stands });

    // The claim Bonsai's own record calls final.
    expect(why.superseded).toEqual([]);
    expect(why.verdict).toBe("supported");
    expect(why.support.map((s) => s.finding)).toEqual(["p = 0.41 raw"]);

    // "Resting on nothing" was the visible half of the defect, and it is the
    // sharper assertion: the flag question and the supersession question have
    // one answer, so a fix that cleared `superseded` while leaving `restingOn`
    // empty would be half a fix and read as a whole one.
    expect(why.restingOn.map((r) => r.name)).toEqual(["per-image results"]);
    expect(why.restingOn[0]!.invalidated).toBeUndefined();

    await captureConversation(
      {
        id: "S-11g",
        title: "A replacement that addresses only some of a run's conclusions",
        about:
          "One run drew two comparisons and the re-analysis revisits only one of them; the comparison it kept still stands on its original measurements.",
      },
      events,
    );
  });

  /**
   * The other side of the same act, which is what makes the test above a
   * discriminator rather than a fix that switched everything off.
   */
  test("the finding it did name falls, and names what replaced it", async () => {
    const w = await aRunPartlyReAnalysed();
    await theLogScaleReAnalysis(w);

    const why = await (await afterwards()).reads.whySupported({ claim: w.revisited });
    expect(why.verdict).toBe("withdrawn");
    expect(why.superseded.map((s) => s.finding)).toEqual(["p = 0.03 raw"]);
    expect(why.superseded[0]!.reason).toContain("p = 0.007 log");
  });

  /**
   * **The pair, on the evaluations.** A verdict falls or stands according to
   * which finding it cited. Both halves are asserted, because a record that
   * withdrew all of them or none would satisfy either alone.
   */
  test("an evaluation citing a superseded finding falls; one citing an untouched finding stands", async () => {
    // Two worlds identical but for which finding the one verdict was reached
    // against. One evaluation each, so the check's state is that verdict's
    // standing and not an aggregate over two.
    const state = async (cites: "revisited" | "stands") => {
      const w = await aRunPartlyReAnalysed(true);
      if (w.criterion === undefined) throw new Error("unreachable: asked for a criterion");
      await session.writes.evaluateCriterion({
        criterion: w.criterion,
        value: "raw scale",
        outcome: "fail",
        citing: [cites === "revisited" ? w.revisited : w.stands],
      });
      await theLogScaleReAnalysis(w);
      const why = await (await afterwards()).reads.whySupported({ claim: w.stands });
      return why.standard.find((c) => c.proposition === AGGREGATION)?.state;
    };

    // The verdict reached against the finding this act superseded falls with
    // it.
    expect(await state("revisited")).toBe("no-standing-verdict");
    await scenario.end();
    const graph = await scenario.begin();
    events = inMemoryEventLog();
    session = new ResearchSession(graph, { clock, events, attribution: as("Researcher") });
    reviewer = new ResearchSession(graph, { clock, events, attribution: as("Reviewer") });

    // The verdict reached against the finding this act never mentioned does
    // not.
    expect(await state("stands")).toBe("failed");
  });

  /**
   * A verdict belongs to the finding it was about. When that finding is replaced, the verdict
   * goes with it and the successor has not been checked: its check is never-run, not failed,
   * and a gate whose other findings passed is incomplete rather than blocked.
   */
  test("a verdict about a superseded finding leaves with it; its successor is unchecked", async () => {
    const w = await aRunPartlyReAnalysed(true);
    if (w.criterion === undefined) throw new Error("unreachable: asked for a criterion");
    const { work } = await session.writes.planWork({
      objective: "report the stochastic-control comparison",
      acceptance: "the aggregation scale is settled first",
    });
    const { gate } = await session.writes.declareGate({
      governedBy: [w.criterion],
      consequence:
        "the stochastic-control comparison is reported only once its aggregation is right",
      protecting: [work],
    });
    await session.writes.evaluateCriterion({
      criterion: w.criterion,
      gate,
      value: "raw scale",
      outcome: "fail",
      about: w.revisited,
    });
    await session.writes.evaluateCriterion({
      criterion: w.criterion,
      gate,
      value: "lattice control aggregated on the log scale",
      outcome: "pass",
      about: w.stands,
    });
    expect((await session.reads.gateStatus({ gate })).state).toBe("blocked");

    const { claims } = await theLogScaleReAnalysis(w);
    const successor = claimOf(claims, REVISITED);
    const later = await afterwards();
    const status = await later.reads.gateStatus({ gate });
    expect(status.state).toBe("incomplete");
    expect(status.checks.map((c) => `${c.about} ${c.state}`).sort()).toEqual(
      [`${w.stands} passed`, `${successor} never-run`].sort(),
    );
  });
});
