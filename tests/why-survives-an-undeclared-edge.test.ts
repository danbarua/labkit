/**
 * `why` reads `type(r)` out of the graph, so the label it gets is whatever is
 * stored — not whatever this build declares. A backfill writes edges ahead of
 * the code that names them, and an older binary reads a record a newer one
 * wrote. Neither is allowed to take `why` down for the whole record.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { scalar } from "@labkit/core-db/cypher";
import { ResearchSession } from "@labkit/core-domain";
import { openScenario, type Scenario } from "./helpers/scenario";

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

describe("why, against an edge label this build does not declare", () => {
  test("reports the record instead of throwing", async () => {
    const graph = await scenario.current();
    const { question } = await session.writes.pose({ question: "does it hold?" });
    const { note } = await session.writes.note({ text: `following up on ${question}` });

    // Written the way a backfill writes it: straight into the graph, under a
    // label no `EDGE_LABELS` entry and no `PHRASE` entry knows about.
    await graph.query(
      `MATCH (n:Note {natural_id: $n}), (q:Question {natural_id: $q})
       CREATE (n)-[r:SOMETHING_LATER]->(q) RETURN type(r) AS made`,
      { made: scalar<string>() },
      { n: note, q: question },
    );

    const why = await new ResearchSession(graph, {}).reads.why({ subject: question });
    expect(why.subject).toBe(question);
    // The edge is reported, worded from the label itself rather than dropped.
    const said = why.because.map((b) => b.wording).join(" | ");
    expect(said).toContain("something later");
  });
});
