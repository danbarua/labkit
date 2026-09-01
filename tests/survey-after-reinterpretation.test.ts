/**
 * Reinterpreting a closed question's claim does not move the question.
 *
 * **A port got this wrong, which is why it is asserted here.** The Rust/Grafeo
 * spike (#114) hit it: `reinterpret` adds a second `SUPPORTS` from the same
 * evidence to the narrowed claim, so the closing decision's cited evidence
 * reaches *two* claims — and code that took whichever the store handed back
 * first reported the question `provisional` or `established` by luck.
 *
 * **LabKit has the same order-dependence and does not have the bug.**
 * `answeringClaimBearing`'s fold is `found ?? row.answering`, which is a
 * take-first over an unordered read; the precondition below asserts two claims
 * really are reachable. Yet the answer is stable, and two mutations confirm the
 * pick does not reach it:
 *
 *   reverse the fold to take the LAST claim   -> still passes
 *   regrain `checksOf` from byClaim to byQuestion -> still passes
 *
 * **Why it does not reach the answer is not established.** A mechanism was
 * proposed — that `checksOf`'s per-claim grain isolates it — and the second
 * mutation refutes that story without replacing it. So this file asserts the
 * observable property and deliberately does not explain it: a comment naming
 * the wrong reason is the defect PJ-029 is about, and it passes either way.
 *
 * What the test is for: if a future consumer of `answeringClaim` ever depends
 * on *which* claim came back, it goes red here rather than intermittently in
 * somebody's report.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { openScenario, type Scenario } from "./helpers/scenario";
import { vertexProps } from "../src/db/cypher";
import { ResearchSession, inMemoryEventLog, type Clock } from "../src/domain";
import { recordAnalysis } from "../fragments";

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
  // different answers. Promoted-over-an-unmet-check is S-19: the original claim
  // is promoted and its check failed -> `provisional`. The narrowed claim has
  // no criteria at all -> vacuously met -> `established`. With a passing check
  // both readings agree and the probe cannot fail.
  await s.evaluateCriterion({ criterion: crit, value: "0.071", outcome: "fail", citing: claim });
  // Promoted, so the two candidate answering claims give DIFFERENT buckets:
  // the original is promoted and its check is met -> established; the narrowed
  // one is neither -> provisional. Without this the probe cannot fail.
  await s.promote({ claim, because: "held at the prespecified bar" });
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

  // Promoted over a check that failed is S-19's case: `provisional`, not
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
