/**
 * Reinterpreting a closed question's claim does not move the question.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { openScenario, type Scenario } from "./helpers/scenario";
import { vertexProps } from "../src/db/cypher";
import { ResearchSession, inMemoryEventLog, type Clock } from "../src/domain";
import { recordAnalysis } from "./helpers/analysis";

const clock: Clock = { now: () => "2026-08-29T09:00:00.000Z" };
let scenario: Scenario;
let s: ResearchSession;
beforeAll(async () => {
  scenario = await openScenario();
});
let graph: Awaited<ReturnType<Scenario["begin"]>>;
beforeEach(async () => {
  graph = await scenario.begin();
  s = new ResearchSession(graph, { clock, events: inMemoryEventLog() });
});
afterEach(async () => {
  await scenario.end();
});
afterAll(async () => {
  await scenario.close();
});

const BUCKETS = ["established", "provisional", "unresolved", "untested", "accepted"] as const;

test("a reinterpretation does not move the question between buckets", async () => {
  const { enquiry } = await s.openEnquiry("does the drug work?");
  const { criterion: crit } = await s.stateCriterion("holds under leave-one-out");
  const { observations: obs } = await s.recordObservations({
    enquiry,
    name: "cohort",
    finding: "+11%",
  });
  const rec = await recordAnalysis(s, {
    enquiry,
    method: "fit",
    from: [obs],
    concludes: [{ proposition: "the drug causes the improvement", finding: "+11%" }],
    heldTo: [crit],
  });
  const claim = rec.claims[0]!.claim;
  // **Failed**, which is what makes the two candidate answering claims give
  // different answers. Promoted over an unmet check: the original claim is
  // promoted and its check failed -> `provisional`. The narrowed claim has
  // no criteria at all -> vacuously met -> `established`. With a passing check
  // both readings agree and the probe cannot fail.
  await s.evaluateCriterion({ criterion: crit, value: "0.071", outcome: "fail", citing: [claim] });
  // Promoted, so the two candidate answering claims give DIFFERENT buckets:
  // the original is promoted and its check is met -> established; the narrowed
  // one is neither -> provisional. Without this the probe cannot fail.
  await s.is({ claim, state: "confirmed", because: "held at the prespecified bar" });
  await s.closeEnquiry({ enquiry, answeredBy: claim });

  const before = await s.whatIsKnown();
  const bucketBefore = BUCKETS.find((b) => before[b].some((q) => q.asks === "does the drug work?"));

  await s.reinterpret({
    of: claim,
    as: "the drug is associated with the improvement",
    because: "the design cannot separate selection from effect",
  });

  const after = await s.whatIsKnown();
  const bucketAfter = BUCKETS.find((b) => after[b].some((q) => q.asks === "does the drug work?"));

  // Promoted over a check that failed reads `provisional`, not
  // `established`. Both before and after, and the "after" is the claim.
  expect(bucketBefore).toBe("provisional");
  expect(bucketAfter).toBe("provisional");

  // Stable, not merely correct once. An order-dependent answer would vary
  // between reads of the same graph.
  const runs: (string | undefined)[] = [];
  for (let i = 0; i < 5; i++) {
    const k = await s.whatIsKnown();
    runs.push(BUCKETS.find((b) => k[b].some((q) => q.asks === "does the drug work?")));
  }
  expect(new Set(runs)).toEqual(new Set(["provisional"]));

  // The precondition, measured rather than inferred: does the evidence the
  // closing decision cites support more than one claim?
  const rows = await graph.query(
    `MATCH (:Decision)-[:RESOLVES]->(:Question)
     MATCH (d:Decision)-[:BASED_ON]->(e:Evidence)-[:SUPPORTS]->(c:Claim)
     RETURN c`,
    { c: vertexProps<{ natural_id: string; name: string }>() },
    {},
  );
  // **The precondition, asserted rather than assumed.** Without two claims
  // reachable here the test above passes for a reason unrelated to the defect
  // it guards — the check that cannot fail, one level out.
  expect(rows.length).toBe(2);
});
