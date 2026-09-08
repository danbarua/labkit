/**
 * **Enumeration: the two verbs that let an agent start.**
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ResearchSession } from "../src/domain";
import { openScenario, type Scenario } from "./helpers/scenario";
import { claimOf } from "./helpers/claims";
import { recordAnalysis } from "./helpers/analysis";
import { workStateFrom } from "../src/domain/read/blocked";

let scenario: Scenario;
beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});

const session = async () => new ResearchSession(await scenario.begin());

/**
 * **The two verbs that let an agent start.**
 */
describe("enumerating gates and work", () => {
  /**
   * A gate in each of the four states, plus work in each of the three.
   */
  async function fixture(s: ResearchSession) {
    const { question } = await s.pose({ question: "does the enumeration hold?" });
    const { enquiry } = await s.pursue({ question, approach: "build one of each" });

    // 1. never-evaluated: a criterion nobody has checked, and work behind it.
    const { criterion: untouched } = await s.stateCriterion("nobody has looked at this");
    const { work: waitingWork } = await s.planWork({
      objective: "behind an unchecked gate",
      acceptance: "done",
    });
    const { gate: neverGate } = await s.declareGate({
      governedBy: [untouched],
      consequence: "unchecked",
      protecting: [waitingWork],
    });

    // Ungated and untouched: the only work here that is actually ready.
    const { work: readyWork } = await s.planWork({
      objective: "ready to start",
      acceptance: "done",
    });

    // 2. blocked: a criterion evaluated and failed.
    const { criterion: failing } = await s.stateCriterion("this one fails");
    const { work: blockedWork } = await s.planWork({ objective: "held up", acceptance: "done" });
    const { gate: blockedGate } = await s.declareGate({
      governedBy: [failing],
      consequence: "cannot proceed",
      protecting: [blockedWork],
    });

    const { observations: readings } = await s.recordObservations({
      enquiry,
      name: "the readings",
      finding: "measured",
    });
    const { claims } = await recordAnalysis(s, {
      enquiry,
      method: "comparison",
      from: [readings],
      concludes: [{ proposition: HOLDS, finding: "it holds" }],
      heldTo: [failing],
    });
    await s.evaluateCriterion({
      criterion: failing,
      value: "no",
      outcome: "fail",
      gate: blockedGate,
      citing: [claimOf(claims, HOLDS)],
    });

    // 3. satisfied: a criterion evaluated and passed, with work implementing it.
    const { criterion: passing } = await s.stateCriterion("this one passes");
    const { work: doneWork } = await s.planWork({
      objective: "already carried out",
      acceptance: "done",
    });
    const { gate: okGate } = await s.declareGate({
      governedBy: [passing],
      consequence: "fine",
      protecting: [doneWork],
    });
    const { claims: more } = await recordAnalysis(s, {
      enquiry,
      method: "second comparison",
      from: [readings],
      concludes: [{ proposition: ALSO, finding: "also holds" }],
      implementing: doneWork,
      heldTo: [passing],
    });
    await s.evaluateCriterion({
      criterion: passing,
      value: "yes",
      outcome: "pass",
      gate: okGate,
      citing: [claimOf(more, ALSO)],
    });

    // 4. incomplete: two criteria, one checked and one not.
    const { criterion: half } = await s.stateCriterion("half-checked");
    const { criterion: alsoHalf } = await s.stateCriterion("the unchecked half");
    const { work: partialWork } = await s.planWork({
      objective: "partly gated",
      acceptance: "done",
    });
    const { gate: partialGate } = await s.declareGate({
      governedBy: [half, alsoHalf],
      consequence: "partly checked",
      protecting: [partialWork],
    });
    const { claims: third } = await recordAnalysis(s, {
      enquiry,
      method: "third comparison",
      from: [readings],
      concludes: [{ proposition: PARTLY, finding: "partly" }],
      heldTo: [half],
    });
    await s.evaluateCriterion({
      criterion: half,
      value: "yes",
      outcome: "pass",
      gate: partialGate,
      citing: [claimOf(third, PARTLY)],
    });

    return {
      neverGate,
      blockedGate,
      okGate,
      partialGate,
      readyWork,
      waitingWork,
      partialWork,
      blockedWork,
      doneWork,
    };
  }

  test("the fixture really contains all four gate states", async () => {
    const s = await session();
    try {
      const built = await fixture(s);
      const states = new Map((await s.gateList()).map((g) => [g.gate as string, g.state]));

      // **The control for every filter test below.** Without it a filter that
      // returned nothing would pass by matching nothing, which is the same
      // green as a filter that works.
      expect(states.get(built.neverGate)).toBe("never-evaluated");
      expect(states.get(built.blockedGate)).toBe("blocked");
      expect(states.get(built.okGate)).toBe("satisfied");
      expect(states.get(built.partialGate)).toBe("incomplete");
    } finally {
      await scenario.end();
    }
  });

  test("gateList's state filter returns exactly the gates in that state", async () => {
    const s = await session();
    try {
      await fixture(s);
      const all = await s.gateList();

      // Every state the fixture actually produces, so this cannot pass by
      // filtering to nothing: a filter that always returned `[]` would agree
      // with an `all` that had no gates in that state, and would not agree
      // with the count.
      for (const state of new Set(all.map((g) => g.state))) {
        const filtered = await s.gateList(state);
        expect(filtered.map((g) => g.gate).sort()).toEqual(
          all
            .filter((g) => g.state === state)
            .map((g) => g.gate)
            .sort(),
        );
        expect(filtered.length).toBeGreaterThan(0);
      }

      // And a state nothing is in returns empty rather than everything --
      // the failure `oneOf` guards on the CLI side, here at the verb.
      const unused = (["never-evaluated", "incomplete", "blocked", "satisfied"] as const).find(
        (st) => !all.some((g) => g.state === st),
      );
      if (unused) expect(await s.gateList(unused)).toEqual([]);
    } finally {
      await scenario.end();
    }
  });

  test("gateList and gateStatus cannot disagree about any gate", async () => {
    const s = await session();
    try {
      await fixture(s);
      const listed = await s.gateList();
      expect(listed.length).toBeGreaterThan(3);

      // The property the shared `gateStateFrom` exists for: a reader who lists
      // blocked gates and then opens one must not find it satisfied. Asserted
      // over every gate rather than a chosen one, so a scoping mistake in
      // either reader shows up wherever it is.
      for (const row of listed) {
        const full = await s.gateStatus(row.gate);
        expect(full.state).toBe(row.state);
        expect(full.consequence).toBe(row.consequence);
      }
    } finally {
      await scenario.end();
    }
  });

  test("a criterion governing two gates is not merged between them", async () => {
    const s = await session();
    try {
      // The grain trap `gateList` is bucketed to avoid: `checkStatusForGate` is
      // grained by criterion, so folding an all-gates result by criterion would
      // give both gates one answer. Here the same criterion is evaluated for
      // one gate and not the other.
      const { criterion: shared } = await s.stateCriterion("one check, two gates");
      const { work: workA } = await s.planWork({ objective: "A", acceptance: "done" });
      const { work: workB } = await s.planWork({ objective: "B", acceptance: "done" });
      const { gate: gateA } = await s.declareGate({
        governedBy: [shared],
        consequence: "A",
        protecting: [workA],
      });
      const { gate: gateB } = await s.declareGate({
        governedBy: [shared],
        consequence: "B",
        protecting: [workB],
      });

      const { question } = await s.pose({ question: "does the scope hold?" });
      const { enquiry } = await s.pursue({ question, approach: "evaluate one side" });
      const { observations: readings } = await s.recordObservations({
        enquiry,
        name: "readings",
        finding: "measured",
      });
      const { claims } = await recordAnalysis(s, {
        enquiry,
        method: "comparison",
        from: [readings],
        concludes: [{ proposition: HOLDS, finding: "it holds" }],
        heldTo: [shared],
      });
      await s.evaluateCriterion({
        criterion: shared,
        value: "no",
        outcome: "fail",
        gate: gateA,
        citing: [claimOf(claims, HOLDS)],
      });

      const states = new Map((await s.gateList()).map((g) => [g.gate as string, g.state]));
      expect(states.get(gateA)).toBe("blocked");
      // Not blocked: the failure was recorded against gate A. A merged fold
      // reports this one blocked too, which is the exact collapse the
      // gate-scoped verdict fact exists to prevent.
      expect(states.get(gateB)).toBe("never-evaluated");
    } finally {
      await scenario.end();
    }
  });

  test("work is planned, waiting, blocked or carried-out, and the fixture has all four", async () => {
    const s = await session();
    try {
      const built = await fixture(s);
      const states = new Map((await s.workList()).map((w) => [w.work as string, w.state]));

      // Ready means nothing done and nothing in the way. Work behind a gate
      // nobody has finished checking — never evaluated, or half-checked with
      // nothing failed — is waiting: not ready, and not blocked, since blocked
      // is a failed condition somebody has to fix.
      expect(states.get(built.readyWork)).toBe("planned");
      expect(states.get(built.waitingWork)).toBe("waiting");
      expect(states.get(built.partialWork)).toBe("waiting");
      expect(states.get(built.blockedWork)).toBe("blocked");
      expect(states.get(built.doneWork)).toBe("carried-out");
    } finally {
      await scenario.end();
    }
  });

  test("a gate the list does not know about holds the work; it does not vanish", () => {
    // `gateStates` comes from `gateList()`, which reaches gates through their
    // criteria. A gate that contributed no rows is absent from the map, and
    // absent must not read as ungated -- that is the exact answer this state
    // exists to stop. Not reachable through the verbs today; pinned on the
    // function so it stays true if `gateList`'s reach ever narrows.
    const task = { gates: new Set(["GATE_9"]), implemented: false, stopped: false };
    expect(workStateFrom(task, new Map())).toBe("waiting");
    expect(workStateFrom(task, new Map([["GATE_9", "satisfied"]]))).toBe("planned");
    expect(workStateFrom({ ...task, gates: new Set() }, new Map())).toBe("planned");
  });

  test("blocked beats carried-out when both hold", async () => {
    const s = await session();
    try {
      // **The one real decision in the enum, tested rather than left to the
      // branch order.** An analysis implements this task AND its gate failed.
      // The other reading -- that work already carried out is not "blocked"
      // whatever its gate says -- is defensible, so this pins which was chosen.
      const { criterion } = await s.stateCriterion("fails after the work is done");
      const { work } = await s.planWork({ objective: "done but held", acceptance: "done" });
      const { gate } = await s.declareGate({
        governedBy: [criterion],
        consequence: "cannot be built on",
        protecting: [work],
      });

      const { question } = await s.pose({ question: "does precedence hold?" });
      const { enquiry } = await s.pursue({ question, approach: "do the work, fail the check" });
      const { observations: readings } = await s.recordObservations({
        enquiry,
        name: "readings",
        finding: "measured",
      });
      const { claims } = await recordAnalysis(s, {
        enquiry,
        method: "comparison",
        from: [readings],
        concludes: [{ proposition: HOLDS, finding: "it holds" }],
        implementing: work,
        heldTo: [criterion],
      });
      await s.evaluateCriterion({
        criterion,
        value: "no",
        outcome: "fail",
        gate,
        citing: [claimOf(claims, HOLDS)],
      });

      const states = new Map((await s.workList()).map((w) => [w.work as string, w.state]));
      expect(states.get(work)).toBe("blocked");

      // And the control: the analysis really did implement it, so this is a
      // precedence choice and not a missing IMPLEMENTS edge.
      const unblocked = await s.workList("carried-out");
      expect(unblocked.map((w) => w.work as string)).not.toContain(work as string);
    } finally {
      await scenario.end();
    }
  });

  test("ungated work with nothing against it is reachable, which is the point", async () => {
    const s = await session();
    try {
      // `planWork` requires no gate, so this task hangs off nothing at all --
      // reachable from no other verb in the read surface. It is also the
      // commonest thing in a standup.
      const { work: orphan } = await s.planWork({
        objective: "nobody has touched this",
        acceptance: "done",
      });
      const planned = await s.workList("planned");
      expect(planned.map((w) => w.work as string)).toContain(orphan as string);
      expect(planned.find((w) => w.work === orphan)?.objective).toBe("nobody has touched this");
    } finally {
      await scenario.end();
    }
  });

  const HOLDS = "the enumeration holds";
  const ALSO = "the second one holds";
  const PARTLY = "the partial one holds";
});
