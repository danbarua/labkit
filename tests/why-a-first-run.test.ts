/**
 * Every analysis is a first run until something revises it, so "a first run"
 * is the ordinary case rather than a rare one. It answered with an empty cause
 * list, and a reader had to go to `happened` for edges the graph already held.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession } from "../packages/core-domain";
import { openScenario, type Scenario } from "./helpers/scenario";
import { recordAnalysis } from "./helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  session = new ResearchSession(await scenario.begin(), {});
});
afterEach(async () => {
  await scenario.end();
});

describe("why <analysis>, on a first run", () => {
  test("names what it was run for, what it read and what it concluded", async () => {
    const { question } = await session.writes.pose({ question: "does the sampler converge?" });
    const { enquiry } = await session.writes.pursue({
      question,
      approach: "compare against the reference",
    });
    const { observations } = await session.writes.recordObservations({
      enquiry,
      name: "sparse-set run",
      finding: "max error 3e-4",
    });
    const { analysis } = await recordAnalysis(session.writes, {
      enquiry,
      method: "error comparison",
      from: [observations],
      concludes: [{ proposition: "the sampler diverges", finding: "3e-4 exceeds the bar" }],
    });

    const why = await session.reads.why({ subject: analysis });
    expect(why.is).toBe("a first run");

    // The bug: `because` was `[]`, and nothing objected.
    expect(why.because.length).toBeGreaterThan(0);

    const named = why.because.map((c) => c.handle);
    expect(named).toContain(enquiry);
    expect(named).toContain(observations);
  });
});
