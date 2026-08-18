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
