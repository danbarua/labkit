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
  expect(absent.restingOn).toEqual(["obs"]);
  expect(absent.supported).toBe(true);

  await graph.query(
    `MATCH (a:Artefact {kind: 'analysis-output'}) SET a.invalidated = false RETURN a`,
    { a: vertexProps<{ kind: string }>() },
  );

  const explicit = await session.whySupported("P");
  expect(explicit.restingOn).toEqual(absent.restingOn);
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
