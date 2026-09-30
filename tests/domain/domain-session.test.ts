/**
 * Robustness tests for the domain service layer's queries, against states the persistence layer
 * can legitimately produce but the research verbs don't currently create themselves.
 */

import { afterAll, beforeAll, beforeEach, afterEach, expect, test } from "bun:test";
import { ResearchSession } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { vertexProps } from "@labkit/core-db/cypher";
import type { TenantGraph } from "@labkit/core-db/graph";
import { claimOf } from "../helpers/claims";
import { reanalyse, recordAnalysis } from "../helpers/analysis";
import { evaluationsOf } from "../helpers/criteria";

let scenario: Scenario;
let graph: TenantGraph;
let session: ResearchSession;

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  graph = await scenario.begin();
  session = new ResearchSession(graph);
});
afterEach(async () => {
  await scenario.end();
});

/**
 * Compound verbs must be all-or-nothing.
 */
function failingOn(
  graph: TenantGraph,
  method: "createEdge" | "createNode",
  nth: number,
): TenantGraph {
  let seen = 0;
  return new Proxy(graph, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      if (prop === method) {
        return async (...args: unknown[]) => {
          seen += 1;
          if (seen === nth) throw new Error(`injected failure on ${method} #${nth}`);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return value.bind(target);
    },
  }) as TenantGraph;
}

/**
 * An amendment interrupted after the replacement condition governs the gate
 * but before the old one is marked changed leaves the gate governed by two
 * conditions -- one of which the researcher intended to retire.
 */
test("an interrupted amendDesign leaves the gate governed by its original condition alone", async () => {
  const { criterion } = await session.writes.stateCriterion(
    "solver converges within 500 iterations",
  );
  const { work } = await session.writes.planWork({
    objective: "fit the tertiary model",
    acceptance: "converges",
  });
  const { gate } = await session.writes.declareGate({
    governedBy: [criterion],
    consequence: "the tertiary model may be fitted",
    protecting: [work],
  });
  const { enquiry } = await session.writes.openEnquiry("does the solver converge?");
  const { observations } = await session.writes.recordObservations({
    enquiry,
    name: "solver traces",
    finding: "iteration counts",
  });
  const { claims: analysisClaims } = await recordAnalysis(session.writes, {
    enquiry,
    method: "feasibility",
    from: [observations],
    concludes: [
      {
        proposition: "500 iterations is unreachable",
        finding: "median 1,800 iterations",
      },
    ],
  });

  const before = await session.reads.gateStatus({ gate });
  expect(before.checks.map((c) => c.proposition)).toEqual([
    "solver converges within 500 iterations",
  ]);

  // Second edge: GOVERNS for the replacement, then the SUPERSEDES that retires
  // the original.
  const interrupted = new ResearchSession(failingOn(graph, "createEdge", 2), {
    events: session.events,
  });
  await expect(
    interrupted.writes.amendDesign({
      criterion,
      nowRequires: "solver converges within 2,000 iterations",
      because: "500 was not reachable on this hardware",
      citing: claimOf(analysisClaims, "500 iterations is unreachable"),
    }),
  ).rejects.toThrow(/injected failure/);

  // One condition, not two. A gate governed by both the retired and the
  // proposed condition is a control-plane object nobody agreed to.
  const after = await session.reads.gateStatus({ gate });
  expect(after.checks.map((c) => c.proposition)).toEqual([
    "solver converges within 500 iterations",
  ]);
  expect(after).toEqual(before);
});

/**
 * Row AD's atomicity, and the reason this test exists at all.
 */
test("recordObservations writes the unit and the evidence together or not at all", async () => {
  const { enquiry } = await session.writes.openEnquiry("does the coating hold at temperature?");

  const realCreateNode = graph.createNode.bind(graph);
  let unitAttempted = false;
  graph.createNode = (async (label: string, props: Record<string, unknown>) => {
    if (label === "EvidenceUnit") {
      unitAttempted = true;
      throw new Error("injected: the unit write failed");
    }
    return realCreateNode(label as never, props as never);
  }) as typeof graph.createNode;

  await expect(
    session.writes.recordObservations({
      enquiry,
      name: "thermal cycling run",
      finding: "no delamination after 200 cycles",
    }),
  ).rejects.toThrow(/injected/);
  graph.createNode = realCreateNode;

  expect(unitAttempted).toBe(true);

  // Nothing survives -- not the artefact written before the failure, and not
  // the evidence that would otherwise stand with no unit behind it.
  const orphans = await graph.query(`MATCH (e:Evidence) RETURN e`, {
    e: vertexProps<{ statement: string }>(),
  });
  expect(orphans.map((r) => r.e.statement)).toEqual([]);
  const artefacts = await graph.query(`MATCH (a:Artefact) RETURN a`, {
    a: vertexProps<{ logical_name: string }>(),
  });
  expect(artefacts.map((r) => r.a.logical_name)).toEqual([]);

  // And the verb still works afterwards -- the rollback released the
  // transaction rather than leaving the session wedged in a failed one.
  const { observations: again } = await session.writes.recordObservations({
    enquiry,
    name: "thermal cycling run",
    finding: "no delamination after 200 cycles",
  });
  expect(again).toMatch(/^ART_/);
});

/**
 * `evaluateCriterion`'s three interruption windows.
 */
const aGatedCheck = async () => {
  const { enquiry } = await session.writes.openEnquiry("does the solver converge?");
  const { observations: obs } = await session.writes.recordObservations({
    enquiry,
    name: "sweep",
    finding: "residuals recorded",
  });
  const { analysis, claims: analysisClaims } = await recordAnalysis(session.writes, {
    enquiry,
    method: "convergence",
    from: [obs],
    concludes: [{ proposition: "the solver converges", finding: "residual 1e-9" }],
  });
  const { work } = await session.writes.planWork({
    objective: "scale to the full grid",
    acceptance: "convergence holds",
  });
  const { criterion } = await session.writes.stateCriterion("residual below 1e-8");
  const { gate } = await session.writes.declareGate({
    governedBy: [criterion],
    consequence: "do not scale up",
    protecting: [work],
  });
  return { enquiry, obs, analysis, analysisClaims, criterion, gate };
};

/**
 * All three edges, one test each: the verb is transactional, so nothing survives an
 * interruption at any of them.
 */
for (const edge of ["EVALUATED_AS", "TRIGGERS", "BASED_ON"] as const) {
  test(`evaluateCriterion interrupted at ${edge} writes no verdict at all`, async () => {
    const { analysisClaims, criterion, gate } = await aGatedCheck();

    const realCreateEdge = graph.createEdge.bind(graph);
    graph.createEdge = (async (from: string, e: string, to: string) => {
      if (e === edge) throw new Error(`injected: ${edge} failed`);
      return realCreateEdge(from as never, e as never, to as never);
    }) as typeof graph.createEdge;

    await expect(
      session.writes.evaluateCriterion({
        criterion,
        gate,
        value: "9e-9",
        outcome: "fail",
        citing: [claimOf(analysisClaims, "the solver converges")],
      }),
    ).rejects.toThrow(/injected/);
    graph.createEdge = realCreateEdge;

    const left = await graph.query(`MATCH (ev:CriterionEvaluation) RETURN ev`, {
      ev: vertexProps<{ outcome: string }>(),
    });
    expect(left).toEqual([]);

    const status = await session.reads.gateStatus({ gate });
    expect(status.state).toBe("never-evaluated");
    expect(status.everFailed).toBe(false);
  });
}

/** A failed close is atomic, so its retry owns the only resolving decision. */
test("a close interrupted before BASED_ON writes nothing before retry", async () => {
  const { enquiry } = await session.writes.openEnquiry("does the coating fail under load?");
  const { observations: obs } = await session.writes.recordObservations({
    enquiry,
    name: "load runs",
    finding: "cracks at 40MPa",
  });
  const { claims: analysisClaims } = await recordAnalysis(session.writes, {
    enquiry,
    method: "load-test",
    from: [obs],
    concludes: [
      {
        proposition: "the coating survives load",
        finding: "cracks at 40MPa",
        bearing: "challenges",
      },
    ],
  });
  const answeredBy = [claimOf(analysisClaims, "the coating survives load")];

  const realCreateEdge = graph.createEdge.bind(graph);
  graph.createEdge = (async (from: string, edge: string, to: string) => {
    if (edge === "BASED_ON") throw new Error("injected: BASED_ON failed");
    return realCreateEdge(from as never, edge as never, to as never);
  }) as typeof graph.createEdge;

  await expect(session.writes.closeEnquiry({ enquiry, answeredBy })).rejects.toThrow(/injected/);
  graph.createEdge = realCreateEdge;

  // The caller saw a throw, so it retries. This one succeeds.
  await session.writes.closeEnquiry({ enquiry, answeredBy });

  const resolving = await graph.query(
    `MATCH (d:Decision)-[:CLOSES]->(:LineOfEnquiry {natural_id: $enquiry}) RETURN d`,
    { d: vertexProps<{ natural_id: string; reason: string }>() },
    { enquiry },
  );
  const status = await session.reads.enquiryStatus({ enquiry });

  expect(resolving).toHaveLength(1);
  // The question was answered "no" on a challenging finding. Anything else is
  // the interrupted close being reported as the researcher's act.
  expect(status.closure).toBe("answered");
  expect(status.bearing).toBe("challenges");
});

/**
 * With the writes intact, retracting the evidence a verdict was reached against **does**
 * withdraw it: `isWithdrawn` is `cited > 0 && standing === 0`.
 */
test("a verdict is withdrawn when the evidence it was reached against is retracted", async () => {
  const { enquiry, obs, analysisClaims, criterion, gate } = await aGatedCheck();

  await session.writes.evaluateCriterion({
    criterion,
    gate,
    value: "9e-9",
    outcome: "fail",
    citing: [claimOf(analysisClaims, "the solver converges")],
  });
  const before = await session.reads.gateStatus({ gate });
  expect((await evaluationsOf(session, before.checks[0]!))[0]?.basis?.map((b) => b.states)).toEqual(
    ["residual 1e-9"],
  );
  expect(before.state).toBe("blocked");

  await reanalyse(session.writes, {
    enquiry,
    method: "convergence, all decades",
    from: [obs],
    concludes: [
      {
        proposition: "the solver converges",
        finding: "residual 4e-9",
        replacing: claimOf(analysisClaims, "the solver converges"),
      },
    ],
  });

  const after = await session.reads.gateStatus({ gate });
  expect((await evaluationsOf(session, after.checks[0]!))[0]?.withdrawn).toBe(true);
  expect(after.state).not.toBe("blocked");
});

/**
 * Closing a closed question is refused.
 */
test("an enquiry cannot be closed twice, and the refusal names the existing close", async () => {
  const s = session;

  const { enquiry } = await s.writes.openEnquiry("does pruning move convergence?");
  const { observations } = await s.writes.recordObservations({
    enquiry,
    name: "readings",
    finding: "twelve runs",
  });
  const { claims: analysisClaims } = await recordAnalysis(s.writes, {
    enquiry,
    method: "paired comparison",
    from: [observations],
    concludes: [
      {
        proposition: "pruning moves convergence",
        finding: "no effect",
        bearing: "challenges",
      },
    ],
  });

  await s.writes.closeEnquiry({ enquiry });
  expect((await s.reads.enquiryStatus({ enquiry })).closure).toBe("abandoned");

  await expect(
    s.writes.closeEnquiry({
      enquiry,
      answeredBy: [claimOf(analysisClaims, "pruning moves convergence")],
    }),
  ).rejects.toThrow(/already closed by DEC_\d+/);

  // And the record is unchanged rather than half-updated: one close, the one
  // that happened.
  const after = await s.reads.enquiryStatus({ enquiry });
  expect(after.closure).toBe("abandoned");
  expect(after.bearing).toBeNull();
});

/**
 * The guard keys on `CLOSES`, and that is load-bearing rather than incidental.
 */
test("a question accepted as unresolved can still be closed when evidence arrives", async () => {
  const s = session;
  const { enquiry } = await s.writes.openEnquiry("does depth move convergence?");
  const { observations } = await s.writes.recordObservations({
    enquiry,
    name: "sweep",
    finding: "runs",
  });
  const { claims: analysisClaims } = await recordAnalysis(s.writes, {
    enquiry,
    method: "paired comparison",
    from: [observations],
    concludes: [
      {
        proposition: "depth moves convergence",
        finding: "moves by ~2 steps",
      },
    ],
  });

  await s.writes.acceptAsUnresolved({
    enquiry,
    because: "the confirmatory set is spent",
    until: "a data source other than the spent set",
    inLightOf: claimOf(analysisClaims, "depth moves convergence"),
  });
  const accepted = await s.reads.enquiryStatus({ enquiry });
  expect(accepted.closure).toBeNull();
  expect(accepted.open).toBe(true);

  // Evidence arrives. This must be allowed -- ACCEPTS is not CLOSES.
  await s.writes.closeEnquiry({
    enquiry,
    answeredBy: [claimOf(analysisClaims, "depth moves convergence")],
  });
  const closed = await s.reads.enquiryStatus({ enquiry });
  expect(closed.closure).toBe("answered");
  expect(closed.bearing).toBe("supports");
});

/**
 * `pursue` is NOT transactional and does not need to be.
 */
test("an interrupted pursue leaves no enquiry at all", async () => {
  const { question } = await session.writes.pose({
    question: "does the coating hold at temperature?",
  });

  const realCreateEdge = graph.createEdge.bind(graph);
  graph.createEdge = (async (from: string, edge: string, to: string) => {
    if (edge === "MOTIVATES") throw new Error("injected: MOTIVATES failed");
    return realCreateEdge(from as never, edge as never, to as never);
  }) as typeof graph.createEdge;

  await expect(session.writes.pursue({ question, approach: "thermal cycling" })).rejects.toThrow(
    /injected/,
  );
  graph.createEdge = realCreateEdge;

  // No enquiry at all: the event store makes every write verb transactional,
  // so no orphan exists to be reasoned about.
  const orphans = await graph.query(`MATCH (loe:LineOfEnquiry) RETURN loe`, {
    loe: vertexProps<{ natural_id: string; name: string }>(),
  });
  expect(orphans).toEqual([]);

  // The question is reported untested, which is true: it is on the books and
  // nothing has been run against it. Same answer `pose()` alone would give.
  const survey = await session.reads.whatIsKnown();
  expect(survey.untested.map((q) => q.asks)).toEqual(["does the coating hold at temperature?"]);
  expect(survey.unresolved).toEqual([]);

  // And pursuing again works — no phantom blocks it, and two enquiries on one
  // question would be legitimate anyway.
  const { enquiry: retried } = await session.writes.pursue({
    question,
    approach: "thermal cycling",
  });
  expect((await session.reads.enquiryStatus({ enquiry: retried })).open).toBe(true);
});

/**
 * `stateCriterion` and `planWork` write **one node and no edge**, so they have no interruption
 * window at all — a single `createNode` either commits or does not.
 */
test("stateCriterion and planWork have no interruption window to have", async () => {
  const realCreateEdge = graph.createEdge.bind(graph);
  let edges = 0;
  graph.createEdge = (async (...args: unknown[]) => {
    edges += 1;
    return (realCreateEdge as (...a: unknown[]) => unknown)(...args);
  }) as typeof graph.createEdge;

  const { criterion } = await session.writes.stateCriterion("residual below 1e-8");
  const { work } = await session.writes.planWork({
    objective: "scale up",
    acceptance: "converges",
  });

  graph.createEdge = realCreateEdge;

  // Neither verb writes an edge, so neither has a gap between two writes.
  expect(edges).toBe(0);
  expect(criterion).toMatch(/^CRIT_/);
  expect(work).toMatch(/^TASK_/);
});

/**
 * `declareGate` writes its edges **after** the node -- `evaluateCriterion`'s arrangement.
 */
test("an interrupted declareGate leaves no gate at all", async () => {
  const { criterion: c1 } = await session.writes.stateCriterion("residual below 1e-8");
  const { criterion: c2 } = await session.writes.stateCriterion("runtime under an hour");
  const { work } = await session.writes.planWork({
    objective: "scale up",
    acceptance: "both hold",
  });

  const realCreateEdge = graph.createEdge.bind(graph);
  let governs = 0;
  graph.createEdge = (async (from: string, edge: string, to: string) => {
    if (edge === "GOVERNS" && ++governs === 2) {
      throw new Error("injected: the second GOVERNS failed");
    }
    return realCreateEdge(from as never, edge as never, to as never);
  }) as typeof graph.createEdge;

  await expect(
    session.writes.declareGate({
      governedBy: [c1, c2],
      consequence: "do not scale up",
      protecting: [work],
    }),
  ).rejects.toThrow(/injected/);
  graph.createEdge = realCreateEdge;

  // No gate at all.
  const gateReaders = await graph.query(`MATCH (g:Gate) RETURN g`, {
    g: vertexProps<{ natural_id: string }>(),
  });
  expect(gateReaders).toEqual([]);

  // The work the gate would have protected is untouched: a failed
  // `declareGate` must not damage what it was declared over.
  const contract = await session.reads.contractFor({ work });
  expect(contract.objective).toBe("scale up");
});

/**
 * The empty contract, which is the case the array conversion could have broken quietly.
 */
test("a task planned with no readable inputs reports an empty contract, not a missing one", async () => {
  const { work: omitted } = await session.writes.planWork({
    objective: "write the discussion section",
    acceptance: "a draft exists",
  });
  const { work: explicit } = await session.writes.planWork({
    objective: "tidy the repository",
    acceptance: "no stray files",
    mayRead: [],
  });

  expect((await session.reads.contractFor({ work: omitted })).mayRead).toEqual([]);
  expect((await session.reads.contractFor({ work: explicit })).mayRead).toEqual([]);

  // And the populated case still round-trips through the same read, so this
  // test fails for the right reason if arrays stop working altogether.
  const { work: populated } = await session.writes.planWork({
    objective: "rerun the sweep",
    acceptance: "all seeds complete",
    mayRead: ["seeds.csv", "config.toml"],
  });
  expect((await session.reads.contractFor({ work: populated })).mayRead).toEqual([
    "seeds.csv",
    "config.toml",
  ]);
});

/**
 * #98: a task can now name the question it serves, and honestly declines to
 * when it wasn't told one -- `planWork` allows ungated work (#91), so an
 * absent `addressing` is a real case, not a gap in this report.
 */
test("a task planned against an enquiry reports it, with wording; one planned without reports none", async () => {
  const { enquiry, question } = await session.writes.openEnquiry(
    "can this mapping reach an external task?",
  );
  const { work: served } = await session.writes.planWork({
    objective: "advance the feasibility ladder",
    acceptance: "every fold converges",
    addressing: enquiry,
  });
  const { work: unaddressed } = await session.writes.planWork({
    objective: "tidy the repository",
    acceptance: "no stray files",
  });

  expect((await session.reads.contractFor({ work: served })).addressing).toEqual({
    enquiry,
    pursuing: "can this mapping reach an external task?",
    question,
    asks: "can this mapping reach an external task?",
  });
  expect((await session.reads.contractFor({ work: unaddressed })).addressing).toBeUndefined();
});

test("criterion report refuses an evaluation with no stored outcome", async () => {
  const { criterion } = await session.writes.stateCriterion("a malformed evaluation is visible");
  const evaluation = await graph.reserveId("CriterionEvaluation");
  await graph.query(
    "CREATE (ev:CriterionEvaluation {natural_id: $id, value: $value, evaluated_at: $at}) RETURN ev",
    { ev: vertexProps<{ natural_id: string }>() },
    { id: evaluation, value: "legacy row", at: "2026-09-11T00:00:00.000Z" },
  );
  await graph.createEdge(criterion, "EVALUATED_AS", evaluation);

  await expect(session.reads.criterionStanding({ criterion })).rejects.toThrow(
    new RegExp(`evaluation ${evaluation} has no stored outcome`),
  );
});

test("knowledge survey refuses an evaluation with a malformed outcome", async () => {
  const { criterion } = await session.writes.stateCriterion(
    "a malformed outcome cannot establish knowledge",
  );
  const { enquiry } = await session.writes.openEnquiry(
    "does malformed evidence establish knowledge?",
  );
  const { observations } = await session.writes.recordObservations({
    enquiry,
    name: "manual review",
    finding: "the malformed result was retained",
  });
  const { claims } = await recordAnalysis(session.writes, {
    enquiry,
    method: "manual review",
    from: [observations],
    concludes: [
      {
        proposition: "malformed evidence establishes knowledge",
        finding: "the malformed result was retained",
      },
    ],
    heldTo: [criterion],
  });
  const claim = claims[0]!.claim;
  await session.writes.isConfirmed({ claim, because: "the answer is being relied on" });
  await session.writes.closeEnquiry({ enquiry, answeredBy: [claim] });

  const evaluation = await graph.reserveId("CriterionEvaluation");
  await graph.query(
    "CREATE (ev:CriterionEvaluation {natural_id: $id, value: $value, outcome: $outcome, evaluated_at: $at}) RETURN ev",
    { ev: vertexProps<{ natural_id: string }>() },
    { id: evaluation, value: "legacy row", outcome: "legacy", at: "2026-09-11T00:00:00.000Z" },
  );
  await graph.createEdge(criterion, "EVALUATED_AS", evaluation);

  await expect(session.reads.whatIsKnown()).rejects.toThrow(
    new RegExp(`evaluation ${evaluation} has no stored outcome`),
  );
});

test("knowledge standing preserves valid pass and fail outcomes", async () => {
  const { criterion } = await session.writes.stateCriterion(
    "a valid outcome preserves knowledge standing",
  );
  const { enquiry } = await session.writes.openEnquiry("does a valid outcome preserve knowledge?");
  const { observations } = await session.writes.recordObservations({
    enquiry,
    name: "validation review",
    finding: "the checked result was retained",
  });
  const { claims } = await recordAnalysis(session.writes, {
    enquiry,
    method: "validation review",
    from: [observations],
    concludes: [
      {
        proposition: "valid evidence establishes knowledge",
        finding: "the checked result was retained",
      },
    ],
    heldTo: [criterion],
  });
  const claim = claims[0]!.claim;
  await session.writes.evaluateCriterion({
    criterion,
    outcome: "pass",
    value: "the check passed",
    citing: [claim],
  });
  await session.writes.isConfirmed({ claim, because: "the checked answer is being relied on" });
  await session.writes.closeEnquiry({ enquiry, answeredBy: [claim] });

  expect((await session.reads.criterionStanding({ criterion })).state).toBe("passed");
  let known = await session.reads.whatIsKnown();
  expect(known.established.map((q) => q.asks)).toContain(
    "does a valid outcome preserve knowledge?",
  );

  await session.writes.evaluateCriterion({
    criterion,
    outcome: "fail",
    value: "the later check failed",
    citing: [claim],
  });
  expect((await session.reads.criterionStanding({ criterion })).state).toBe("failed");
  known = await session.reads.whatIsKnown();
  expect(known.established.map((q) => q.asks)).not.toContain(
    "does a valid outcome preserve knowledge?",
  );
  expect(known.provisional.map((q) => q.asks)).toContain(
    "does a valid outcome preserve knowledge?",
  );
});
