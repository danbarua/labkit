/**
 * **Enumeration: the two verbs that let an agent start.**
 *
 * Every other gate verb takes a `GateRef` and every work verb a `WorkRef`. Until
 * `gateList` and `workList` existed the only route to either ran through a
 * claim — `whySupported` → `unmet` → the gate it blocks — so a record with work
 * planned and nothing analysed against it yet was invisible to every cold entry
 * point except `whatHappened`, which is the event log and the one place this
 * repository forbids answering a "what is true now" question from.
 *
 * Two properties are load-bearing here and each has a control:
 *
 *   - the fixture really contains every state, or the filter assertions pass by
 *     matching nothing;
 *   - `gateList` and `gateStatus` agree about every gate, which is the whole
 *     reason the state computation was extracted rather than written twice.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ResearchSession } from "../src/domain";
import { openScenario, type Scenario } from "./helpers/scenario";
import { claimOf } from "./helpers/claims";
import { recordAnalysis } from "../fragments";

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
 *
 * Every other gate verb takes a `GateRef` and every work verb a `WorkRef`, and
 * until these existed the only route to either ran through a claim — so a
 * record with work planned and nothing analysed was invisible to everything
 * except the event log (#55, #66).
 */
describe("enumerating gates and work", () => {
  /**
   * A gate in each of the four states, plus work in each of the three.
   *
   * Built once and read by every test below, because the filter assertions are
   * **vacuous for any state the fixture does not contain** — a filter returning
   * nothing passes just as well when nothing matches as when the filter is
   * broken.
   */
  async function fixture(s: ResearchSession) {
    const { question } = await s.pose("does the enumeration hold?");
    const { enquiry } = await s.pursue({ question, approach: "build one of each" });

    // 1. never-evaluated: a criterion nobody has checked.
    const { criterion: untouched } = await s.stateCriterion("nobody has looked at this");
    const { work: readyWork } = await s.planWork({
      objective: "ready to start",
      acceptance: "done",
    });
    const { gate: neverGate } = await s.declareGate({
      governedBy: [untouched],
      consequence: "unchecked",
      protecting: [readyWork],
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
      citing: claimOf(claims, HOLDS),
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
      citing: claimOf(more, ALSO),
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
      citing: claimOf(third, PARTLY),
    });

    return { neverGate, blockedGate, okGate, partialGate, readyWork, blockedWork, doneWork };
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
      // one gate and not the other -- which is S-17 and S-3's case reached from
      // a new direction.
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

      const { question } = await s.pose("does the scope hold?");
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
        citing: claimOf(claims, HOLDS),
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

  test("work is planned, blocked or carried-out, and the fixture has all three", async () => {
    const s = await session();
    try {
      const built = await fixture(s);
      const states = new Map((await s.workList()).map((w) => [w.work as string, w.state]));

      // `readyWork` is gated by a criterion nobody evaluated. Unevaluated is
      // deliberately not blocking: a gate nobody has checked yet is a fact
      // about the gate, and treating it as an obstruction would report every
      // freshly gated task as blocked on the day it was planned.
      expect(states.get(built.readyWork)).toBe("planned");
      expect(states.get(built.blockedWork)).toBe("blocked");
      expect(states.get(built.doneWork)).toBe("carried-out");
    } finally {
      await scenario.end();
    }
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

      const { question } = await s.pose("does precedence hold?");
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
        citing: claimOf(claims, HOLDS),
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
