/**
 * `note` — the one write with no prerequisites besides `pose` (#179).
 *
 * The behaviour worth asserting is exactly the shape of the promise: nothing
 * beyond `text` is required, `search` reaches it for free once it exists, and
 * `on` is a real edge to whatever the caller names — including another note,
 * since `CONCERNS` is deliberately not scoped to one target kind.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { ResearchSession } from "../src/domain";
import { openScenario, type Scenario } from "./helpers/scenario";
import type { TenantGraph } from "../src/db/graph";

let scenario: Scenario;
let graph: TenantGraph;
let session: ResearchSession;

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

test("a bare note needs only its text, and search finds it afterward", async () => {
  const { note } = await session.note({
    text: "are the AIs inventing markdown temples again?",
  });
  expect(note).toMatch(/^NOTE_\d+$/);

  const groups = await session.search("markdown temples");
  const notes = groups.find((g) => g.label === "Note");
  expect(notes?.matches.map((m) => m.handle)).toContain(note);
});

test("--on attaches to a real record, and search still finds the note by its own text", async () => {
  const { question } = await session.pose("does the pruning schedule move convergence?");
  const { note } = await session.note({
    text: "worth checking before ripping the schedule out",
    on: question,
  });

  const groups = await session.search("ripping the schedule out");
  expect(groups.find((g) => g.label === "Note")?.matches.map((m) => m.handle)).toContain(note);
});

test("a note may concern another note -- CONCERNS is not scoped to one target kind", async () => {
  const { note: first } = await session.note({ text: "first thought" });
  const { note: second } = await session.note({ text: "see also the first one", on: first });
  expect(second).toMatch(/^NOTE_\d+$/);
});

test("--on refuses a handle from the wrong kind of act", async () => {
  await expect(session.note({ text: "x", on: "NOT_A_REAL_HANDLE" as never })).rejects.toThrow();
});
