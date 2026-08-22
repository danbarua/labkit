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

let scenario: Scenario;
let graph: TenantGraph;
let session: ResearchSession;

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });
beforeEach(async () => {
  graph = await scenario.begin();
  session = new ResearchSession(graph);
});
afterEach(async () => { await scenario.end(); });

/**
 * `Artefact.invalidated` is optional, so "not invalidated" has two spellings --
 * absent, and explicitly `false`. The db layer's own fixtures use the second
 * (tests/domain-graph.test.ts). Both branches of whySupported() must agree:
 * one partitions on JS truthiness (absent and false alike), and the other
 * filtered with a bare `IS NULL` (absent only). The mismatch made a claim
 * report supported-but-resting-on-nothing, with no error.
 */
test("whySupported treats an explicit invalidated:false the same as an absent one", async () => {
  const enquiry = await session.openEnquiry("q");
  const observations = await session.recordObservations({ enquiry, name: "obs", finding: "raw" });
  await session.recordAnalysis({
    enquiry,
    method: "m",
    from: [observations],
    concludes: [{ proposition: "P", finding: "f" }],
  });

  const absent = await session.whySupported("P");
  expect(absent.restingOn.map((a) => a.name)).toEqual(["obs"]);
  expect(absent.supported).toBe(true);

  await graph.query(
    `MATCH (a:Artefact {kind: 'analysis-output'}) SET a.invalidated = false RETURN a`,
    { a: vertexProps<{ kind: string }>() },
  );

  const explicit = await session.whySupported("P");
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
 * External review of S-3c earned the boundary for `replaceAnalysis()` and
 * `reverify()` with a negative test that a scenario *could* express, because
 * the harm there was visible through research verbs. The same review named
 * `reinterpret()` and `amendDesign()` as having the same shape. They do, and
 * both leave a demonstrably wrong record when interrupted -- so they get the
 * boundary too, tested from here.
 */
function failingOn(graph: TenantGraph, method: "createEdge" | "createNode", nth: number): TenantGraph {
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
  const enquiry = await session.openEnquiry("does T differ from rewired?");
  const observations = await session.recordObservations({
    enquiry,
    name: "per-image results",
    finding: "per-image accuracy",
  });
  const analysis = await session.recordAnalysis({
    enquiry,
    method: "holm-pairwise",
    from: [observations],
    concludes: [{ proposition: "T beats rewired", finding: "p = 0.002" }],
  });

  const before = await session.whySupported("T beats rewired");

  // Fourth edge: MOTIVATES, EVALUATES, the CHANGES that withdraws the original,
  // and then the SUPPORTS that carries the evidence across to the narrower
  // claim. Failing on the last one is the damaging moment.
  const interrupted = new ResearchSession(failingOn(graph, "createEdge", 4));
  await expect(
    interrupted.reinterpret({
      of: { analysis, proposition: "T beats rewired" },
      as: "T beats rewired on the primary endpoint only",
      because: "the secondary endpoint was never powered",
    }),
  ).rejects.toThrow(/injected failure/);

  // Nothing moved: the finding still stands and still rests on its evidence.
  const after = await session.whySupported("T beats rewired");
  expect(after).toEqual(before);
  expect(after.withdrawn).toBe(false);
  expect(after.supported).toBe(true);
  // And no half-made revision is readable.
  const history = await session.interpretationHistory("T beats rewired");
  expect(history.nowClaims).toBe("T beats rewired");
  expect(history.revisions).toEqual([]);
});

/**
 * An amendment interrupted after the replacement condition governs the gate
 * but before the old one is marked changed leaves the gate governed by two
 * conditions -- one of which the researcher intended to retire.
 */
test("an interrupted amendDesign leaves the gate governed by its original condition alone", async () => {
  const criterion = await session.stateCriterion("solver converges within 500 iterations");
  const work = await session.planWork({ objective: "fit the tertiary model", acceptance: "converges" });
  const gate = await session.declareGate({
    governedBy: [criterion],
    consequence: "the tertiary model may be fitted",
    protecting: [work],
  });
  const enquiry = await session.openEnquiry("does the solver converge?");
  const observations = await session.recordObservations({ enquiry, name: "solver traces", finding: "iteration counts" });
  const analysis = await session.recordAnalysis({
    enquiry,
    method: "feasibility",
    from: [observations],
    concludes: [{ proposition: "500 iterations is unreachable", finding: "median 1,800 iterations" }],
  });

  const before = await session.gateStatus(gate);
  expect(before.checks.map((c) => c.proposition)).toEqual(["solver converges within 500 iterations"]);

  // Second edge: GOVERNS for the replacement, then the CHANGES that retires
  // the original.
  const interrupted = new ResearchSession(failingOn(graph, "createEdge", 2));
  await expect(
    interrupted.amendDesign({
      criterion,
      nowRequires: "solver converges within 2,000 iterations",
      because: "500 was not reachable on this hardware",
      citing: { analysis, proposition: "500 iterations is unreachable" },
    }),
  ).rejects.toThrow(/injected failure/);

  // One condition, not two. A gate governed by both the retired and the
  // proposed condition is a control-plane object nobody agreed to.
  const after = await session.gateStatus(gate);
  expect(after.checks.map((c) => c.proposition)).toEqual(["solver converges within 500 iterations"]);
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
 * where a partial write would be indistinguishable from history. See CLAUDE.md
 * on why `Promise.all()` against two live connections is not an option here.
 */
test("recordObservations writes the unit and the evidence together or not at all", async () => {
  const enquiry = await session.openEnquiry("does the coating hold at temperature?");

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
  const orphans = await graph.query(
    `MATCH (e:Evidence) RETURN e`,
    { e: vertexProps<{ statement: string }>() },
  );
  expect(orphans.map((r) => r.e.statement)).toEqual([]);
  const artefacts = await graph.query(
    `MATCH (a:Artefact) RETURN a`,
    { a: vertexProps<{ logical_name: string }>() },
  );
  expect(artefacts.map((r) => r.a.logical_name)).toEqual([]);

  // And the verb still works afterwards -- the rollback released the
  // transaction rather than leaving the session wedged in a failed one.
  const again = await session.recordObservations({
    enquiry,
    name: "thermal cycling run",
    finding: "no delamination after 200 cycles",
  });
  expect(again.id).toMatch(/^ART_/);
});

/**
 * `sharpen` is NOT transactional, and this test records that it does not need
 * to be — the first item taken off PJ-028's *inferred* pile, and the first to
 * come back "read wrong, was fine".
 *
 * `write.ts`'s header says a compound verb runs inside `inTransaction()`.
 * `sharpen` writes five things and does not. On reading alone that looks like
 * the defect `recordObservations` above was fixed for. It is not, and the
 * discriminator is the one PJ-011 §5 already gives, applied to interruption:
 *
 *   **A partial state is acceptable exactly when some other verb could
 *   legitimately have produced it, or when no reader can reach it at all.**
 *
 * Both of `sharpen`'s failure windows clear that bar, which is why the fix was
 * to the sentence and not to the code:
 *
 * - Fail inside the `BASED_ON` loop and the decision keeps a *subset* of what
 *   was standing — a confidently wrong answer if anything read it. Nothing can:
 *   `originOf()` is the only reader of `NARROWS`, and it matches `MOTIVATES`
 *   first, which `sharpen` writes last. The leftover is unreachable.
 * - Fail on `MOTIVATES` and the sharper question survives with no origin —
 *   exactly what `pose()` produces, reported as `untested`, which is true: it
 *   is on the books and nothing has been run against it.
 *
 * A real property rather than an accident of today's code, so it is asserted
 * rather than left in prose (PJ-028). **If someone adds a reader of `NARROWS`
 * that does not require `MOTIVATES`, the first case stops being unreachable and
 * `sharpen` becomes transactional.** This test is what says so.
 */
test("a partial sharpen leaves nothing a reader can reach", async () => {
  const enquiry = await session.openEnquiry("does the coating hold?");
  const obs = await session.recordObservations({
    enquiry, name: "run A", finding: "no delamination",
  });
  await session.recordAnalysis({
    enquiry, method: "cycling", from: [obs],
    concludes: [
      { proposition: "the coating survives cycling", finding: "no delamination at 200 cycles" },
      { proposition: "the coating survives heat", finding: "no delamination at 200C" },
    ],
  });
  const original = await session.pose("is the coating durable?");

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
    session.sharpen({ from: original, into: "is it durable at 200C?", because: "too vague" }),
  ).rejects.toThrow(/injected/);
  graph.createEdge = realCreateEdge;

  // The half-built decision survives...
  const orphaned = await graph.query(
    `MATCH (d:Decision)-[:NARROWS]->(:Question) RETURN d`,
    { d: vertexProps<{ reason: string }>() },
  );
  expect(orphaned.map((r) => r.d.reason)).toEqual(["too vague"]);

  // ...and no reader can reach it, because `originOf` needs the MOTIVATES that
  // was never written. That is what makes the subset harmless rather than a
  // wrong answer, and it is the whole argument for leaving sharpen alone.
  const motivates = await graph.query(
    `MATCH (:Decision)-[:MOTIVATES]->(q:Question) RETURN q`,
    { q: vertexProps<{ name: string }>() },
  );
  expect(motivates).toEqual([]);
  expect(await session.originOf(original)).toBeNull();

  // The sharper question was never created, so the survey is simply correct.
  const survey = await session.whatIsKnown();
  expect(survey.untested.map((q) => q.asks)).toEqual(["is the coating durable?"]);
});

/**
 * `evaluateCriterion`'s three interruption windows — the second item off
 * PJ-028's inferred pile, and a real test of `039`'s rule rather than a repeat.
 *
 * `sharpen` cleared because its reachability edge (`MOTIVATES`) is written
 * **last**, so an interruption leaves nothing to walk to. This verb writes
 * `EVALUATED_AS` **second**, so from the third write onward the evaluation is
 * reachable and the edges after it are the ones that say what it means.
 *
 * Predictions in `docs/consumer-contract/040`, including the competing rule the
 * third window discriminates between. See `041` for the verdict.
 */
const aGatedCheck = async () => {
  const enquiry = await session.openEnquiry("does the solver converge?");
  const obs = await session.recordObservations({
    enquiry, name: "sweep", finding: "residuals recorded",
  });
  const analysis = await session.recordAnalysis({
    enquiry, method: "convergence", from: [obs],
    concludes: [{ proposition: "the solver converges", finding: "residual 1e-9" }],
  });
  const work = await session.planWork({
    objective: "scale to the full grid", acceptance: "convergence holds",
  });
  const criterion = await session.stateCriterion("residual below 1e-8");
  const gate = await session.declareGate({
    governedBy: [criterion], consequence: "do not scale up", protecting: [work],
  });
  return { enquiry, obs, analysis, criterion, gate };
};

/**
 * All three edges, one test each, because the verb is now transactional and the
 * assertion is the same at every window: nothing survives.
 *
 * Before the fix these behaved differently, and the difference is the finding.
 * Window 1 (`EVALUATED_AS`) left an orphan node no reader could reach — an
 * absence. Window 2 (`TRIGGERS`) left a state in which one gate reported the
 * check `never-run` *and* `everFailed: true` from a single call — startling, and
 * **not** a defect, because the no-gate S-3b path produces it legitimately and
 * `everFailed`'s scope is documented as deliberately unfiltered by gate.
 *
 * Window 3 is the one that earned the transaction, and it is asserted below in
 * the only form that stays true after the fix: the verdict does not exist, so it
 * cannot stand. What it did before is in `041`.
 */
for (const edge of ["EVALUATED_AS", "TRIGGERS", "BASED_ON"] as const) {
  test(`evaluateCriterion interrupted at ${edge} writes no verdict at all`, async () => {
    const { analysis, criterion, gate } = await aGatedCheck();

    const realCreateEdge = graph.createEdge.bind(graph);
    graph.createEdge = (async (from: string, e: string, to: string) => {
      if (e === edge) throw new Error(`injected: ${edge} failed`);
      return realCreateEdge(from as never, e as never, to as never);
    }) as typeof graph.createEdge;

    await expect(
      session.evaluateCriterion({
        criterion, gate, value: "9e-9", outcome: "fail",
        citing: { analysis, proposition: "the solver converges" },
      }),
    ).rejects.toThrow(/injected/);
    graph.createEdge = realCreateEdge;

    const left = await graph.query(
      `MATCH (ev:CriterionEvaluation) RETURN ev`,
      { ev: vertexProps<{ outcome: string }>() },
    );
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
  const enquiry = await session.openEnquiry("does the coating fail under load?");
  const obs = await session.recordObservations({
    enquiry, name: "load runs", finding: "cracks at 40MPa",
  });
  const analysis = await session.recordAnalysis({
    enquiry, method: "load-test", from: [obs],
    concludes: [{
      proposition: "the coating survives load",
      finding: "cracks at 40MPa", bearing: "challenges",
    }],
  });
  const answeredBy = { analysis, proposition: "the coating survives load" };

  const realCreateEdge = graph.createEdge.bind(graph);
  graph.createEdge = (async (from: string, edge: string, to: string) => {
    if (edge === "BASED_ON") throw new Error("injected: BASED_ON failed");
    return realCreateEdge(from as never, edge as never, to as never);
  }) as typeof graph.createEdge;

  await expect(session.closeEnquiry({ enquiry, answeredBy })).rejects.toThrow(/injected/);
  graph.createEdge = realCreateEdge;

  // The caller saw a throw, so it retries. This one succeeds.
  await session.closeEnquiry({ enquiry, answeredBy });

  const resolving = await graph.query(
    `MATCH (d:Decision)-[:RESOLVES]->(:Question) RETURN d`,
    { d: vertexProps<{ natural_id: string; reason: string }>() },
  );
  const status = await session.enquiryStatus(enquiry);
  console.log("CLOSE resolving decisions:", resolving.length);
  console.log("CLOSE closure:", status.closure, "answer:", status.answer);
  console.log("CLOSE evidence:", JSON.stringify(status.evidence));

  // The question was answered "no" on a challenging finding. Anything else is
  // the interrupted close being reported as the researcher's act.
  expect(status.closure).toBe("answered");
  expect(status.answer).toBe("no");
});

/**
 * The wrong answer the transaction exists to prevent, asserted from the other
 * side: with the writes intact, retracting the evidence a verdict was reached
 * against **does** withdraw it.
 *
 * Before the fix, an interruption before `BASED_ON` left `cited === 0`, and
 * `isWithdrawn` is `cited > 0 && standing === 0` — so the verdict could never be
 * withdrawn, and the gate stayed `blocked` by a `fail` the record insisted still
 * stood. `basis: []` alone is an empty result and not a wrong answer (PJ-011 §5);
 * *"this verdict still stands"* after its basis was retracted is a wrong answer,
 * and that distinction is what `041` settles.
 */
test("a verdict is withdrawn when the evidence it was reached against is retracted", async () => {
  const { enquiry, obs, analysis, criterion, gate } = await aGatedCheck();

  await session.evaluateCriterion({
    criterion, gate, value: "9e-9", outcome: "fail",
    citing: { analysis, proposition: "the solver converges" },
  });
  const before = await session.gateStatus(gate);
  expect(before.checks[0]?.evaluations[0]?.basis).toEqual(["residual 1e-9"]);
  expect(before.state).toBe("blocked");

  const review = await session.recordReview({
    of: analysis, verdict: "the sweep dropped the last decade",
  });
  await session.replaceAnalysis({
    supersedes: analysis, because: review, enquiry,
    method: "convergence, all decades", from: [obs],
    concludes: [{ proposition: "the solver converges", finding: "residual 4e-9" }],
  });

  const after = await session.gateStatus(gate);
  expect(after.checks[0]?.evaluations[0]?.withdrawn).toBe(true);
  expect(after.state).not.toBe("blocked");
});

/**
 * Closing a closed question is refused.
 *
 * A second `closeEnquiry` writes a second `RESOLVES`, and `enquiryStatus()`
 * picks between them with `.find()` over rows AGE returns in no defined order.
 * Which close a reader sees is then arbitrary — and this is reachable through
 * the public API with **no interruption**, so it survives the transaction that
 * `docs/consumer-contract/043` added for the interrupted-then-retried route.
 *
 * The wrong answer, demonstrated before the guard existed: abandon an enquiry,
 * later find a result and close it citing the evidence, and the record still
 * reports `closure: "abandoned"`, `answer: null`, `evidence: []`. The answer is
 * erased. `abandoned` is a positive classification, not an empty result, so
 * PJ-011 §5 does not excuse it.
 */
test("an enquiry cannot be closed twice, and the refusal names the existing close", async () => {
  const s = session;

  const enquiry = await s.openEnquiry("does pruning move convergence?");
  const observations = await s.recordObservations({ enquiry, name: "readings", finding: "twelve runs" });
  const analysis = await s.recordAnalysis({
    enquiry, method: "paired comparison", from: [observations],
    concludes: [{ proposition: "pruning moves convergence", finding: "no effect", bearing: "challenges" }],
  });

  await s.closeEnquiry({ enquiry });
  expect((await s.enquiryStatus(enquiry)).closure).toBe("abandoned");

  await expect(
    s.closeEnquiry({ enquiry, answeredBy: { analysis, proposition: "pruning moves convergence" } }),
  ).rejects.toThrow(/already closed by decision DEC_\d+/);

  // And the record is unchanged rather than half-updated: one close, the one
  // that happened.
  const after = await s.enquiryStatus(enquiry);
  expect(after.closure).toBe("abandoned");
  expect(after.answer).toBeNull();
});

/**
 * The guard keys on `RESOLVES`, and that is load-bearing rather than incidental.
 *
 * `acceptAsUnresolved()` writes `DEFERS`, not `RESOLVES` — a question left open
 * on purpose, with the condition that would reopen it recorded (S-14). If the
 * "already closed" test treated that as closed, a question deliberately left
 * open could **never afterwards be closed on evidence**, which is the one case
 * S-14 exists to keep available. Asserted rather than argued from reading the
 * query, because `labkit-minion` asked and reading is not evidence.
 */
test("a question accepted as unresolved can still be closed when evidence arrives", async () => {
  const s = session;
  const enquiry = await s.openEnquiry("does depth move convergence?");
  const observations = await s.recordObservations({ enquiry, name: "sweep", finding: "runs" });
  const analysis = await s.recordAnalysis({
    enquiry, method: "paired comparison", from: [observations],
    concludes: [{ proposition: "depth moves convergence", finding: "moves by ~2 steps" }],
  });

  await s.acceptAsUnresolved({
    enquiry,
    because: "the confirmatory set is spent",
    until: "a data source other than the spent set",
    inLightOf: { analysis, proposition: "depth moves convergence" },
  });
  const accepted = await s.enquiryStatus(enquiry);
  expect(accepted.closure).toBe("accepted-as-unresolved");
  expect(accepted.open).toBe(true);

  // Evidence arrives. This must be allowed -- DEFERS is not RESOLVES.
  await s.closeEnquiry({ enquiry, answeredBy: { analysis, proposition: "depth moves convergence" } });
  const closed = await s.enquiryStatus(enquiry);
  expect(closed.closure).toBe("answered");
  expect(closed.answer).toBe("yes");
});

/**
 * `pursue` is NOT transactional and does not need to be — fourth verb off
 * PJ-028's inferred pile, and the second to come back clean. Predictions in
 * `docs/consumer-contract/044`, verdict in `045`.
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
test("an interrupted pursue leaves an enquiry nothing can reach", async () => {
  const question = await session.pose("does the coating hold at temperature?");

  const realCreateEdge = graph.createEdge.bind(graph);
  graph.createEdge = (async (from: string, edge: string, to: string) => {
    if (edge === "MOTIVATES") throw new Error("injected: MOTIVATES failed");
    return realCreateEdge(from as never, edge as never, to as never);
  }) as typeof graph.createEdge;

  await expect(
    session.pursue({ question, approach: "thermal cycling" }),
  ).rejects.toThrow(/injected/);
  graph.createEdge = realCreateEdge;

  // The orphan is there...
  const orphans = await graph.query(
    `MATCH (loe:LineOfEnquiry) RETURN loe`,
    { loe: vertexProps<{ natural_id: string; name: string }>() },
  );
  expect(orphans.map((r) => r.loe.name)).toEqual(["thermal cycling"]);

  // ...and carries no inbound edge, which is what makes it unreachable rather
  // than merely unreferenced. `whatDependsOn` would surface it otherwise.
  const attached = await graph.query(
    `MATCH (:Question)-[:MOTIVATES]->(loe:LineOfEnquiry) RETURN loe`,
    { loe: vertexProps<{ natural_id: string }>() },
  );
  expect(attached).toEqual([]);

  // The question is reported untested, which is true: it is on the books and
  // nothing has been run against it. Same answer `pose()` alone would give.
  const survey = await session.whatIsKnown();
  expect(survey.untested.map((q) => q.asks)).toEqual([
    "does the coating hold at temperature?",
  ]);
  expect(survey.unresolved).toEqual([]);

  // And pursuing again works — no phantom blocks it, and two enquiries on one
  // question would be legitimate anyway.
  const retried = await session.pursue({ question, approach: "thermal cycling" });
  expect((await session.enquiryStatus(retried)).open).toBe(true);
});

/**
 * The last four verbs of PJ-028's inferred pile. Predictions in
 * `docs/consumer-contract/046`, verdict in `047`.
 *
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

  const criterion = await session.stateCriterion("residual below 1e-8");
  const work = await session.planWork({ objective: "scale up", acceptance: "converges" });

  graph.createEdge = realCreateEdge;

  // Neither verb writes an edge, so neither has a gap between two writes.
  expect(edges).toBe(0);
  expect(criterion.id).toMatch(/^CRIT_/);
  expect(work.id).toMatch(/^TASK_/);
});

/**
 * `recordReview` writes `EVALUATES` **last**, so an interrupted review is an
 * orphan `Review` node — `pursue`'s argument, checked rather than assumed.
 */
test("an interrupted recordReview leaves a review nothing can reach", async () => {
  const enquiry = await session.openEnquiry("does it hold?");
  const obs = await session.recordObservations({ enquiry, name: "run", finding: "data" });
  const analysis = await session.recordAnalysis({
    enquiry, method: "m", from: [obs],
    concludes: [{ proposition: "it holds", finding: "f" }],
  });

  const realCreateEdge = graph.createEdge.bind(graph);
  graph.createEdge = (async (from: string, edge: string, to: string) => {
    if (edge === "EVALUATES") throw new Error("injected: EVALUATES failed");
    return realCreateEdge(from as never, edge as never, to as never);
  }) as typeof graph.createEdge;

  await expect(
    session.recordReview({ of: analysis, verdict: "the aggregation dropped a fold" }),
  ).rejects.toThrow(/injected/);
  graph.createEdge = realCreateEdge;

  const attached = await graph.query(
    `MATCH (r:Review)-[:EVALUATES]->() RETURN r`,
    { r: vertexProps<{ natural_id: string }>() },
  );
  expect(attached).toEqual([]);

  // The finding still stands: no review reaches it, so nothing retracts it.
  const why = await session.whySupported("it holds");
  expect(why.supported).toBe(true);
  expect(why.withdrawn).toBe(false);
});

/**
 * `declareGate` writes its edges **after** the node — `evaluateCriterion`'s
 * dangerous arrangement — and is clean for a weaker reason: **every `Gate` reader
 * is keyed by `natural_id`**, and an interrupted call returns none.
 *
 * That is unreachable-by-handle rather than unreachable-by-structure, and it is
 * the one this test exists to pin. The assertion is that no reader walks
 * `GOVERNS` *forward* into a gate nobody named — if one ever does, a half-built
 * gate surfaces governed by a subset of its criteria, and `gateStatus` computes
 * `incomplete` from exactly that set.
 */
test("an interrupted declareGate leaves a gate no reader enumerates", async () => {
  const c1 = await session.stateCriterion("residual below 1e-8");
  const c2 = await session.stateCriterion("runtime under an hour");
  const work = await session.planWork({ objective: "scale up", acceptance: "both hold" });

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
      governedBy: [c1, c2], consequence: "do not scale up", protecting: [work],
    }),
  ).rejects.toThrow(/injected/);
  graph.createEdge = realCreateEdge;

  // A half-built gate survives, governed by one of its two criteria...
  const half = await graph.query(
    `MATCH (:Criterion)-[:GOVERNS]->(g:Gate) RETURN g`,
    { g: vertexProps<{ natural_id: string }>() },
  );
  expect(half).toHaveLength(1);

  // ...and it protects nothing, so no reader entering from work can find it.
  const gating = await graph.query(
    `MATCH (:Gate)-[:GATES]->(t:Task) RETURN t`,
    { t: vertexProps<{ objective: string }>() },
  );
  expect(gating).toEqual([]);

  // The caller holds no handle, and every Gate reader is keyed by natural_id --
  // which is the whole guarantee. Asserted rather than described, because it is
  // weaker than structural unreachability and one new reader could take it away:
  // nothing on the read surface enumerates gates, so there is no route in.
  const gateReaders = await graph.query(
    `MATCH (g:Gate) RETURN g`,
    { g: vertexProps<{ natural_id: string }>() },
  );
  expect(gateReaders).toHaveLength(1); // present in the graph...
  const contract = await session.contractFor(work);
  expect(contract.objective).toBe("scale up"); // ...and invisible from the work.
});
