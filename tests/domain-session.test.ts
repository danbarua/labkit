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
