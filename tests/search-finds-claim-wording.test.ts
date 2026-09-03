/**
 * `search` reaches a claim's proposition and an artefact's name.
 *
 * Both are `IndexedString` — text that also behaves like a key — and both were
 * excluded from `search` on the argument that `claimsAsserting` is already the
 * exact-match lookup for a claim's wording. `claimsAsserting` needs the whole
 * sentence, so a researcher with a phrase in mind got "nothing on the record
 * contains this text" about a record that contained it.
 *
 * A phrase, not a whole proposition, is the point of every assertion here: a
 * test passing the full sentence would pass against `claimsAsserting`'s own
 * behaviour and prove nothing about substring reach.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { ResearchSession } from "../src/domain";
import { recordAnalysis } from "../fragments";
import { openScenario, type Scenario } from "./helpers/scenario";
import type { TenantGraph } from "../src/db/graph";

let scenario: Scenario;
let session: ResearchSession;
let graph: TenantGraph;

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

/** The claim's whole sentence — long on purpose: nobody retypes it. */
const PROPOSITION = "T is the unique winner among the four tested evolved graphs on this task";

/** One analysis with one conclusion, and the artefact it read. */
async function aRecordedFinding() {
  const { enquiry } = await session.openEnquiry("does the pruning schedule move convergence?");
  const { observations } = await session.recordObservations({
    enquiry,
    name: "depth-sweep-raw",
    finding: "convergence step counts at depths 4 through 20",
  });
  const { claims } = await recordAnalysis(session, {
    enquiry,
    method: "paired comparison against the unpruned baseline",
    from: [observations],
    concludes: [
      {
        proposition: PROPOSITION,
        finding: "all six pairwise comparisons Holm-rejected",
      },
    ],
  });
  return { artefact: observations, claim: claims[0]!.claim };
}

test("a phrase from a claim's proposition finds the claim", async () => {
  const { claim } = await aRecordedFinding();

  const groups = await session.search("unique winner");
  const found = groups.find((g) => g.label === "Claim")?.matches.map((m) => String(m.handle));
  expect(found).toContain(String(claim));
});

test("a phrase from an artefact's name finds the artefact", async () => {
  const { artefact } = await aRecordedFinding();

  const groups = await session.search("depth-sweep");
  const found = groups.find((g) => g.label === "Artefact")?.matches.map((m) => String(m.handle));
  expect(found).toContain(String(artefact));
});

test("claimsAsserting still needs the whole sentence, which is why search had to reach it", async () => {
  const { claim } = await aRecordedFinding();

  // The exact-match seam, unchanged: the full proposition resolves.
  expect((await session.claimsAsserting(PROPOSITION)).map((c) => c.claim)).toEqual([claim]);
  // A phrase does not, and nobody retypes the sentence above.
  expect(await session.claimsAsserting("unique winner")).toEqual([]);
});

test("an empty answer is empty because nothing matched, not because nothing was scanned", async () => {
  await aRecordedFinding();

  expect(await session.search("a phrase nothing on this record uses")).toEqual([]);
});
