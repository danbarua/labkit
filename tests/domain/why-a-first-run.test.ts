/**
 * `why <analysis>` answers with the edges the graph holds for the analysis and
 * for the unit that used it, so a reader need not go to `happened` for them.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { recordAnalysis } from "../helpers/analysis";

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

    expect(why.because.length).toBeGreaterThan(0);

    const named = why.because.map((c) => c.handle);
    expect(named).toContain(enquiry);
    expect(named).toContain(observations);
  });
});
