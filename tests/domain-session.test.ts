/**
 * Robustness tests for the domain service layer's queries, against states the
 * persistence layer can legitimately produce but the research verbs don't
 * currently create themselves.
 *
 * These live outside tests/scenarios/ deliberately. A scenario asserts that a
 * researcher's intent works through research verbs alone and may not import
 * src/db; this file needs to write a raw property to set up its case, which
 * makes it a persistence-adjacent test rather than an acceptance scenario.
 * Adding a verb just to reach the state would be inventing API to satisfy a
 * test.
 */

import { afterAll, beforeAll, beforeEach, afterEach, expect, test } from "bun:test";
import { ResearchSession } from "../src/domain";
import { openScenario, type Scenario } from "./helpers/scenario";
import { vertexProps } from "../src/db/cypher";
import type { TenantGraph } from "../src/db/graph";
import { claimNamed, claimOf } from "./helpers/claims";
import { recordAnalysis, replaceAnalysis } from "../fragments";
import { evaluationsOf } from "./helpers/criteria";

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
 * `Artefact.invalidated` is optional, so "not invalidated" has two spellings --
 * absent, and explicitly `false`. The db layer's own fixtures use the second
 * (tests/domain-graph.test.ts). Both branches of whySupported() must agree:
 * one partitions on JS truthiness (absent and false alike), and the other
 * filtered with a bare `IS NULL` (absent only). The mismatch made a claim
 * report supported-but-resting-on-nothing, with no error.
 */
test("whySupported treats an explicit invalidated:false the same as an absent one", async () => {
  const { enquiry } = await session.openEnquiry("q");
  const { observations } = await session.recordObservations({
    enquiry,
    name: "obs",
    finding: "raw",
  });
  await recordAnalysis(session, {
    enquiry,
    method: "m",
    from: [observations],
    concludes: [{ proposition: "P", finding: "f" }],
  });

  const absent = await session.whySupported(await claimNamed(session, "P"));
  expect(absent.restingOn.map((a) => a.name)).toEqual(["obs"]);
  expect(absent.supported).toBe(true);

  await graph.query(
    `MATCH (a:Artefact {kind: 'analysis-output'}) SET a.invalidated = false RETURN a`,
    { a: vertexProps<{ kind: string }>() },
  );

  const explicit = await session.whySupported(await claimNamed(session, "P"));
  expect(explicit.restingOn.map((a) => a.name)).toEqual(absent.restingOn.map((a) => a.name));
  expect(explicit.supported).toBe(true);
});

/**
 * Compound verbs must be all-or-nothing.
 *
 * These live here rather than in tests/scenarios/ on purpose: "does this
 * command roll back when its second half fails?" is not a question a
 * researcher asks, and staging the failure needs a seam a scenario is not
 * allowed to touch. It is an invariant of the service layer, not an acceptance
 * conversation.
 *
 * `replaceAnalysis()`, `reverify()`, `reinterpret()`, and `amendDesign()` all
 * leave a demonstrably wrong record when interrupted, so they get the
 * boundary tested from here.
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
 * A reinterpretation interrupted after the original has been withdrawn but
 * before the narrower claim inherits its evidence retracts a finding and puts
 * nothing in its place: the record stops asserting the original sentence, and
 * the sentence meant to replace it is supported by nothing at all.
 *
 * Note which edge that is. The obvious guess -- fail before the withdrawal, so
 * both sentences stand -- was wrong, and probing each edge in turn showed why:
 * at that point no reader has changed its answer yet. The damage is one write
 * later. Guessing where a compound verb hurts is exactly as reliable here as
 * guessing anywhere else in this project.
 */
test("an interrupted reinterpret does not retract a finding it cannot replace", async () => {
  const { enquiry } = await session.openEnquiry("does T differ from rewired?");
  const { observations } = await session.recordObservations({
    enquiry,
    name: "per-image results",
    finding: "per-image accuracy",
  });
  const { claims: analysisClaims } = await recordAnalysis(session, {
    enquiry,
    method: "holm-pairwise",
    from: [observations],
    concludes: [{ proposition: "T beats rewired", finding: "p = 0.002" }],
  });

  const before = await session.whySupported(await claimNamed(session, "T beats rewired"));

  // Fourth edge: MOTIVATES, EVALUATES, the CHANGES that withdraws the original,
  // and then the SUPPORTS that carries the evidence across to the narrower
  // claim. Failing on the last one is the damaging moment.
  const interrupted = new ResearchSession(failingOn(graph, "createEdge", 4));
  await expect(
    interrupted.reinterpret({
      of: claimOf(analysisClaims, "T beats rewired"),
      as: "T beats rewired on the primary endpoint only",
      because: "the secondary endpoint was never powered",
    }),
  ).rejects.toThrow(/injected failure/);

  // Nothing moved: the finding still stands and still rests on its evidence.
  const after = await session.whySupported(await claimNamed(session, "T beats rewired"));
  expect(after).toEqual(before);
  expect(after.withdrawn).toBe(false);
  expect(after.supported).toBe(true);
  // And no half-made revision is readable.
  const history = await session.interpretationHistory(await claimNamed(session, "T beats rewired"));
  expect(history.nowClaims.asserts).toBe("T beats rewired");
  expect(history.revisions).toEqual([]);
});

/**
 * An amendment interrupted after the replacement condition governs the gate
 * but before the old one is marked changed leaves the gate governed by two
 * conditions -- one of which the researcher intended to retire.
 */
test("an interrupted amendDesign leaves the gate governed by its original condition alone", async () => {
  const { criterion } = await session.stateCriterion("solver converges within 500 iterations");
  const { work } = await session.planWork({
    objective: "fit the tertiary model",
    acceptance: "converges",
  });
  const { gate } = await session.declareGate({
    governedBy: [criterion],
    consequence: "the tertiary model may be fitted",
    protecting: [work],
  });
  const { enquiry } = await session.openEnquiry("does the solver converge?");
  const { observations } = await session.recordObservations({
    enquiry,
    name: "solver traces",
    finding: "iteration counts",
  });
  const { claims: analysisClaims } = await recordAnalysis(session, {
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

  const before = await session.gateStatus(gate);
  expect(before.checks.map((c) => c.proposition)).toEqual([
    "solver converges within 500 iterations",
  ]);

  // Second edge: GOVERNS for the replacement, then the CHANGES that retires
  // the original.
  const interrupted = new ResearchSession(failingOn(graph, "createEdge", 2));
  await expect(
    interrupted.amendDesign({
      criterion,
      nowRequires: "solver converges within 2,000 iterations",
      because: "500 was not reachable on this hardware",
      citing: claimOf(analysisClaims, "500 iterations is unreachable"),
    }),
  ).rejects.toThrow(/injected failure/);

  // One condition, not two. A gate governed by both the retired and the
  // proposed condition is a control-plane object nobody agreed to.
  const after = await session.gateStatus(gate);
  expect(after.checks.map((c) => c.proposition)).toEqual([
    "solver converges within 500 iterations",
  ]);
  expect(after).toEqual(before);
});

/**
 * Row AD's atomicity, and the reason this test exists at all.
 *
 * `recordObservations()` wrote two nodes and two edges for eighteen scenarios
 * with no transaction around them, and that was survivable: an interrupted call
 * left a half-written record, but nothing the model called impossible.
 *
 * Minting the `EvidenceUnit` changes that. A failure between the evidence and
 * the unit writes *precisely* the invariant the fix exists to remove — an
 * `Evidence` with no producing `EvidenceUnit` — durably, and looking exactly
 * like the records that predate the fix, which is the worst possible disguise
 * for a defect. So the verb became transactional in the same change, and this
 * is the negative test every other compound verb in `src/domain` already has.
 *
 * Deterministic by injection rather than by racing: the graph's `createNode` is
 * made to throw on the `EvidenceUnit` specifically, which is the one ordering
 * where a partial write would be indistinguishable from history.
 */
test("recordObservations writes the unit and the evidence together or not at all", async () => {
  const { enquiry } = await session.openEnquiry("does the coating hold at temperature?");

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
    session.recordObservations({
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
  const { observations: again } = await session.recordObservations({
    enquiry,
    name: "thermal cycling run",
    finding: "no delamination after 200 cycles",
  });
  expect(again).toMatch(/^ART_/);
});

/**
 * Every write verb runs inside `inTransaction()`, because an event has to
 * commit with the writes it describes. So an interrupted `sharpen` leaves
 * nothing at all -- not even an unreachable leftover -- which is what a
 * reader checking the record after a failure would expect.
 */
test("an interrupted sharpen leaves nothing at all", async () => {
  const { enquiry } = await session.openEnquiry("does the coating hold?");
  const { observations: obs } = await session.recordObservations({
    enquiry,
    name: "run A",
    finding: "no delamination",
  });
  await recordAnalysis(session, {
    enquiry,
    method: "cycling",
    from: [obs],
    concludes: [
      {
        proposition: "the coating survives cycling",
        finding: "no delamination at 200 cycles",
      },
      {
        proposition: "the coating survives heat",
        finding: "no delamination at 200C",
      },
    ],
  });
  const { question: original } = await session.pose({ question: "is the coating durable?" });

  // Fail on the second BASED_ON edge: the decision keeps one finding of three.
  const realCreateEdge = graph.createEdge.bind(graph);
  let basedOn = 0;
  graph.createEdge = (async (from: string, edge: string, to: string) => {
    if (edge === "BASED_ON" && ++basedOn === 2) {
      throw new Error("injected: the second BASED_ON failed");
    }
    return realCreateEdge(from as never, edge as never, to as never);
  }) as typeof graph.createEdge;

  await expect(
    session.sharpen({
      from: original,
      into: "is it durable at 200C?",
      because: "too vague",
    }),
  ).rejects.toThrow(/injected/);
  graph.createEdge = realCreateEdge;

  // No decision at all: the rollback means there is nothing to reach.
  const decisions = await graph.query(`MATCH (d:Decision) RETURN d`, {
    d: vertexProps<{ reason: string }>(),
  });
  expect(decisions).toEqual([]);

  // And so `originOf` answers null because the question genuinely has no
  // origin, not because the edge it needs happened to be written last.
  expect(await session.originOf(original)).toBeNull();

  // The sharper question was never created, so the survey is simply correct.
  const survey = await session.whatIsKnown();
  expect(survey.untested.map((q) => q.asks)).toEqual(["is the coating durable?"]);
});

/**
 * `evaluateCriterion`'s three interruption windows.
 *
 * `sharpen` cleared because its reachability edge (`MOTIVATES`) is written
 * **last**, so an interruption leaves nothing to walk to. This verb writes
 * `EVALUATED_AS` **second**, so from the third write onward the evaluation is
 * reachable and the edges after it are the ones that say what it means.
 */
const aGatedCheck = async () => {
  const { enquiry } = await session.openEnquiry("does the solver converge?");
  const { observations: obs } = await session.recordObservations({
    enquiry,
    name: "sweep",
    finding: "residuals recorded",
  });
  const { analysis, claims: analysisClaims } = await recordAnalysis(session, {
    enquiry,
    method: "convergence",
    from: [obs],
    concludes: [{ proposition: "the solver converges", finding: "residual 1e-9" }],
  });
  const { work } = await session.planWork({
    objective: "scale to the full grid",
    acceptance: "convergence holds",
  });
  const { criterion } = await session.stateCriterion("residual below 1e-8");
  const { gate } = await session.declareGate({
    governedBy: [criterion],
    consequence: "do not scale up",
    protecting: [work],
  });
  return { enquiry, obs, analysis, analysisClaims, criterion, gate };
};

/**
 * All three edges, one test each: the verb is transactional, so nothing
 * survives an interruption at any of them.
 *
 * Window 1 (`EVALUATED_AS`) leaves no orphan node reachable — an absence.
 * Window 2 (`TRIGGERS`) can leave a gate reporting the check `never-run`
 * *and* `everFailed: true` from a single call — startling, and **not** a
 * defect, because the no-gate path produces it legitimately and
 * `everFailed`'s scope is documented as deliberately unfiltered by gate.
 * Window 3 is asserted below in the only form that stays true: the verdict
 * does not exist, so it cannot stand.
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
      session.evaluateCriterion({
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

    const status = await session.gateStatus(gate);
    expect(status.state).toBe("never-evaluated");
    expect(status.everFailed).toBe(false);
  });
}

/**
 * `closeEnquiry`, third off the inferred pile. Predictions in `042` were wrong
 * about the mechanism — it writes **one** `BASED_ON`, not one per finding — and
 * wrong about the consequence: `enquiryStatus` guards the empty case explicitly
 * (*"abandoned, not answered — absence of evidence is not a negative result"*),
 * so there is no polarity inversion.
 *
 * What survives is the retry. The close writes `RESOLVES` before `BASED_ON`, so
 * an interrupted close leaves a resolving decision behind and the caller, who
 * saw a throw, retries. Two decisions then resolve one question, and
 * `enquiryStatus` picks with `.find()` over unordered rows.
 */
test("a close interrupted before BASED_ON, then retried, leaves two resolving decisions", async () => {
  const { enquiry } = await session.openEnquiry("does the coating fail under load?");
  const { observations: obs } = await session.recordObservations({
    enquiry,
    name: "load runs",
    finding: "cracks at 40MPa",
  });
  const { claims: analysisClaims } = await recordAnalysis(session, {
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
  const answeredBy = claimOf(analysisClaims, "the coating survives load");

  const realCreateEdge = graph.createEdge.bind(graph);
  graph.createEdge = (async (from: string, edge: string, to: string) => {
    if (edge === "BASED_ON") throw new Error("injected: BASED_ON failed");
    return realCreateEdge(from as never, edge as never, to as never);
  }) as typeof graph.createEdge;

  await expect(session.closeEnquiry({ enquiry, answeredBy })).rejects.toThrow(/injected/);
  graph.createEdge = realCreateEdge;

  // The caller saw a throw, so it retries. This one succeeds.
  await session.closeEnquiry({ enquiry, answeredBy });

  const resolving = await graph.query(`MATCH (d:Decision)-[:RESOLVES]->(:Question) RETURN d`, {
    d: vertexProps<{ natural_id: string; reason: string }>(),
  });
  const status = await session.enquiryStatus(enquiry);
  console.log("CLOSE resolving decisions:", resolving.length);
  console.log("CLOSE closure:", status.question!.closure, "answer:", status.question!.answer);
  console.log("CLOSE evidence:", JSON.stringify(status.question!.evidence));

  // The question was answered "no" on a challenging finding. Anything else is
  // the interrupted close being reported as the researcher's act.
  expect(status.question!.closure).toBe("answered");
  expect(status.question!.answer).toBe("no");
});

/**
 * With the writes intact, retracting the evidence a verdict was reached
 * against **does** withdraw it: `isWithdrawn` is `cited > 0 && standing === 0`.
 * `basis: []` alone is an empty result, not a wrong answer; a verdict that
 * insists *"this still stands"* after its basis was retracted is the wrong
 * answer this distinguishes.
 */
test("a verdict is withdrawn when the evidence it was reached against is retracted", async () => {
  const { enquiry, obs, analysis, analysisClaims, criterion, gate } = await aGatedCheck();

  await session.evaluateCriterion({
    criterion,
    gate,
    value: "9e-9",
    outcome: "fail",
    citing: [claimOf(analysisClaims, "the solver converges")],
  });
  const before = await session.gateStatus(gate);
  expect((await evaluationsOf(session, before.checks[0]!))[0]?.basis?.map((b) => b.states)).toEqual(
    ["residual 1e-9"],
  );
  expect(before.state).toBe("blocked");

  const { review } = await session.recordReview({
    of: analysis,
    verdict: "the sweep dropped the last decade",
  });
  await replaceAnalysis(session, {
    supersedes: analysis,
    because: review,
    enquiry,
    method: "convergence, all decades",
    from: [obs],
    concludes: [{ proposition: "the solver converges", finding: "residual 4e-9" }],
  });

  const after = await session.gateStatus(gate);
  expect((await evaluationsOf(session, after.checks[0]!))[0]?.withdrawn).toBe(true);
  expect(after.state).not.toBe("blocked");
});

/**
 * Closing a closed question is refused.
 *
 * A second `closeEnquiry` writes a second `RESOLVES`, and `enquiryStatus()`
 * picks between them with `.find()` over rows AGE returns in no defined order.
 * Which close a reader sees would then be arbitrary -- reachable through the
 * public API with **no interruption**, which is why this is guarded directly
 * rather than left to the transaction that covers the interrupted-then-retried
 * route.
 *
 * Without the guard: abandon an enquiry, later find a result and close it
 * citing the evidence, and the record could still report `closure: "abandoned"`,
 * `answer: null`, `evidence: []` -- the answer erased. `abandoned` is a
 * positive classification, not an empty result, so that would be a wrong
 * answer, not a harmless absence.
 */
test("an enquiry cannot be closed twice, and the refusal names the existing close", async () => {
  const s = session;

  const { enquiry } = await s.openEnquiry("does pruning move convergence?");
  const { observations } = await s.recordObservations({
    enquiry,
    name: "readings",
    finding: "twelve runs",
  });
  const { claims: analysisClaims } = await recordAnalysis(s, {
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

  await s.closeEnquiry({ enquiry });
  expect((await s.enquiryStatus(enquiry)).question!.closure).toBe("abandoned");

  await expect(
    s.closeEnquiry({
      enquiry,
      answeredBy: claimOf(analysisClaims, "pruning moves convergence"),
    }),
  ).rejects.toThrow(/already closed by decision DEC_\d+/);

  // And the record is unchanged rather than half-updated: one close, the one
  // that happened.
  const after = await s.enquiryStatus(enquiry);
  expect(after.question!.closure).toBe("abandoned");
  expect(after.question!.answer).toBeNull();
});

/**
 * The guard keys on `RESOLVES`, and that is load-bearing rather than incidental.
 *
 * `acceptAsUnresolved()` writes `DEFERS`, not `RESOLVES` — a question left open
 * on purpose, with the condition that would reopen it recorded. If the
 * "already closed" test treated that as closed, a question deliberately left
 * open could **never afterwards be closed on evidence**. Asserted rather than
 * argued from reading the query, since reading is not evidence.
 */
test("a question accepted as unresolved can still be closed when evidence arrives", async () => {
  const s = session;
  const { enquiry } = await s.openEnquiry("does depth move convergence?");
  const { observations } = await s.recordObservations({
    enquiry,
    name: "sweep",
    finding: "runs",
  });
  const { claims: analysisClaims } = await recordAnalysis(s, {
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

  await s.acceptAsUnresolved({
    enquiry,
    because: "the confirmatory set is spent",
    until: "a data source other than the spent set",
    inLightOf: claimOf(analysisClaims, "depth moves convergence"),
  });
  const accepted = await s.enquiryStatus(enquiry);
  expect(accepted.question!.closure).toBe("accepted-as-unresolved");
  expect(accepted.question!.open).toBe(true);

  // Evidence arrives. This must be allowed -- DEFERS is not RESOLVES.
  await s.closeEnquiry({
    enquiry,
    answeredBy: claimOf(analysisClaims, "depth moves convergence"),
  });
  const closed = await s.enquiryStatus(enquiry);
  expect(closed.question!.closure).toBe("answered");
  expect(closed.question!.answer).toBe("yes");
});

/**
 * `pursue` is NOT transactional and does not need to be.
 *
 * It writes the `LineOfEnquiry` node and then `MOTIVATES`: **reachability edge
 * last**, `sharpen`'s arrangement rather than `evaluateCriterion`'s. An
 * interruption leaves an orphan enquiry, and no reader can derive an answer from
 * it — `enquiryStatus` matches by `natural_id` and the caller never got one,
 * every survey traversal enters through `Question -[:MOTIVATES]->`, and
 * `whatDependsOn`'s bare `OPTIONAL MATCH (loe:LineOfEnquiry)` is saved only by
 * requiring an inbound `REQUIRES` that an orphan has none of.
 *
 * **That last one is the tripwire**, which is why it is asserted rather than
 * described: if anything ever writes `REQUIRES` before `MOTIVATES`, the orphan
 * becomes reachable and `pursue` needs the transaction.
 */
test("an interrupted pursue leaves no enquiry at all", async () => {
  const { question } = await session.pose({ question: "does the coating hold at temperature?" });

  const realCreateEdge = graph.createEdge.bind(graph);
  graph.createEdge = (async (from: string, edge: string, to: string) => {
    if (edge === "MOTIVATES") throw new Error("injected: MOTIVATES failed");
    return realCreateEdge(from as never, edge as never, to as never);
  }) as typeof graph.createEdge;

  await expect(session.pursue({ question, approach: "thermal cycling" })).rejects.toThrow(
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
  const survey = await session.whatIsKnown();
  expect(survey.untested.map((q) => q.asks)).toEqual(["does the coating hold at temperature?"]);
  expect(survey.unresolved).toEqual([]);

  // And pursuing again works — no phantom blocks it, and two enquiries on one
  // question would be legitimate anyway.
  const { enquiry: retried } = await session.pursue({
    question,
    approach: "thermal cycling",
  });
  expect((await session.enquiryStatus(retried)).question!.open).toBe(true);
});

/**
 * `stateCriterion` and `planWork` write **one node and no edge**, so they have no
 * interruption window at all — a single `createNode` either commits or does not.
 * That is a third *kind* of answer rather than two more clean results, and the
 * assertion below is about the shape rather than about a partial state, because
 * there is no partial state to assert on.
 */
test("stateCriterion and planWork have no interruption window to have", async () => {
  const realCreateEdge = graph.createEdge.bind(graph);
  let edges = 0;
  graph.createEdge = (async (...args: unknown[]) => {
    edges += 1;
    return (realCreateEdge as (...a: unknown[]) => unknown)(...args);
  }) as typeof graph.createEdge;

  const { criterion } = await session.stateCriterion("residual below 1e-8");
  const { work } = await session.planWork({
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
 * `recordReview` writes `EVALUATES` **last**, so an interrupted review is an
 * orphan `Review` node — `pursue`'s argument, checked rather than assumed.
 */
test("an interrupted recordReview leaves a review nothing can reach", async () => {
  const { enquiry } = await session.openEnquiry("does it hold?");
  const { observations: obs } = await session.recordObservations({
    enquiry,
    name: "run",
    finding: "data",
  });
  const { analysis } = await recordAnalysis(session, {
    enquiry,
    method: "m",
    from: [obs],
    concludes: [{ proposition: "it holds", finding: "f" }],
  });

  const realCreateEdge = graph.createEdge.bind(graph);
  graph.createEdge = (async (from: string, edge: string, to: string) => {
    if (edge === "EVALUATES") throw new Error("injected: EVALUATES failed");
    return realCreateEdge(from as never, edge as never, to as never);
  }) as typeof graph.createEdge;

  await expect(
    session.recordReview({
      of: analysis,
      verdict: "the aggregation dropped a fold",
    }),
  ).rejects.toThrow(/injected/);
  graph.createEdge = realCreateEdge;

  const attached = await graph.query(`MATCH (r:Review)-[:EVALUATES]->() RETURN r`, {
    r: vertexProps<{ natural_id: string }>(),
  });
  expect(attached).toEqual([]);

  // The finding still stands: no review reaches it, so nothing retracts it.
  const why = await session.whySupported(await claimNamed(session, "it holds"));
  expect(why.supported).toBe(true);
  expect(why.withdrawn).toBe(false);
});

/**
 * `declareGate` writes its edges **after** the node -- `evaluateCriterion`'s
 * arrangement. Every write verb runs inside `inTransaction`, because an event
 * has to commit with the writes it describes, so an interrupted call leaves
 * no gate at all: nothing for a reader to enumerate or fail to enumerate.
 */
test("an interrupted declareGate leaves no gate at all", async () => {
  const { criterion: c1 } = await session.stateCriterion("residual below 1e-8");
  const { criterion: c2 } = await session.stateCriterion("runtime under an hour");
  const { work } = await session.planWork({
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
    session.declareGate({
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
  const contract = await session.contractFor(work);
  expect(contract.objective).toBe("scale up");
});

/**
 * The empty contract, which is the case the array conversion could have broken
 * quietly.
 *
 * `Task.mayRead` is read back through a `JSON.parse` in a try/catch. The
 * populated round trip is covered elsewhere; nothing covered **no** values,
 * and that is where a native agtype array can differ from a serialised one --
 * an empty list is the shape most likely to come back absent rather than
 * empty.
 *
 * Both spellings are asserted because `planWork` accepts either, and both mean
 * "reads nothing". `contractFor` has **no fallback** for a missing property, so
 * these assertions read the stored array itself rather than a default standing
 * in for it -- verified by putting a sentinel in a `?? []` and watching it
 * never appear.
 */
test("a task planned with no readable inputs reports an empty contract, not a missing one", async () => {
  const { work: omitted } = await session.planWork({
    objective: "write the discussion section",
    acceptance: "a draft exists",
  });
  const { work: explicit } = await session.planWork({
    objective: "tidy the repository",
    acceptance: "no stray files",
    mayRead: [],
  });

  expect((await session.contractFor(omitted)).mayRead).toEqual([]);
  expect((await session.contractFor(explicit)).mayRead).toEqual([]);

  // And the populated case still round-trips through the same read, so this
  // test fails for the right reason if arrays stop working altogether.
  const { work: populated } = await session.planWork({
    objective: "rerun the sweep",
    acceptance: "all seeds complete",
    mayRead: ["seeds.csv", "config.toml"],
  });
  expect((await session.contractFor(populated)).mayRead).toEqual(["seeds.csv", "config.toml"]);
});

/**
 * #98: a task can now name the question it serves, and honestly declines to
 * when it wasn't told one -- `planWork` allows ungated work (#91), so an
 * absent `addressing` is a real case, not a gap in this report.
 */
test("a task planned against an enquiry reports it, with wording; one planned without reports none", async () => {
  const { enquiry, question } = await session.openEnquiry(
    "can this mapping reach an external task?",
  );
  const { work: served } = await session.planWork({
    objective: "advance the feasibility ladder",
    acceptance: "every fold converges",
    addressing: enquiry,
  });
  const { work: unaddressed } = await session.planWork({
    objective: "tidy the repository",
    acceptance: "no stray files",
  });

  expect((await session.contractFor(served)).addressing).toEqual({
    enquiry,
    pursuing: "can this mapping reach an external task?",
    question,
    asks: "can this mapping reach an external task?",
  });
  expect((await session.contractFor(unaddressed)).addressing).toBeUndefined();
});
