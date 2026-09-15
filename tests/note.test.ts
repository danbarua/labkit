/**
 * `note` — the one write with no prerequisites besides `pose`.
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
  const { note } = await session.writes.note({
    text: "are the AIs inventing markdown temples again?",
  });
  expect(note).toMatch(/^NOTE_\d+$/);

  const groups = await session.reads.search({ text: "markdown temples" });
  const notes = groups.find((g) => g.label === "Note");
  expect(notes?.matches.map((m) => m.handle)).toContain(note);
});

test("--on attaches to a real record, and search still finds the note by its own text", async () => {
  const { question } = await session.writes.pose({
    question: "does the pruning schedule move convergence?",
  });
  const { note } = await session.writes.note({
    text: "worth checking before ripping the schedule out",
    on: question,
  });

  const groups = await session.reads.search({ text: "ripping the schedule out" });
  expect(groups.find((g) => g.label === "Note")?.matches.map((m) => m.handle)).toContain(note);
});

test("a note may concern another note -- CONCERNS is not scoped to one target kind", async () => {
  const { note: first } = await session.writes.note({ text: "first thought" });
  const { note: second } = await session.writes.note({ text: "see also the first one", on: first });
  expect(second).toMatch(/^NOTE_\d+$/);
});

test("--on refuses a handle from the wrong kind of act", async () => {
  await expect(
    session.writes.note({ text: "x", on: "NOT_A_REAL_HANDLE" as never }),
  ).rejects.toThrow();
});

test("supersedes writes SUPERSEDES edges (repeatable) and why walks both directions with PHRASE", async () => {
  const { note: old1 } = await session.writes.note({ text: "initial take" });
  const { note: old2 } = await session.writes.note({ text: "another take" });
  const { note: newer } = await session.writes.note({
    text: "replaces the earlier notes",
    supersedes: [old1, old2],
  });

  // why on old includes the newer as replacement
  const whyOld1 = await session.reads.why({ subject: old1 });
  expect(
    whyOld1.because.some((b) => b.handle === newer && /was replaced by/.test(b.wording ?? "")),
  ).toBe(true);

  const whyNew = await session.reads.why({ subject: newer });
  expect(
    whyNew.because.some(
      (b) => (b.handle === old1 || b.handle === old2) && /replaced/.test(b.wording ?? ""),
    ),
  ).toBe(true);

  // listed notes surface the arrays
  const listed = await session.reads.notes({});
  const byId = new Map(listed.map((n) => [n.note, n] as const));
  expect(byId.get(newer)!.supersedes.slice().sort()).toEqual([old1, old2].sort());
  expect(byId.get(old1)!.supersededBy).toContain(newer);
  expect(byId.get(old2)!.supersededBy).toContain(newer);
});

test("note --supersedes refuses missing target", async () => {
  await expect(
    session.writes.note({ text: "x", supersedes: ["NOTE_999999"] as never }),
  ).rejects.toThrow(/NOTE_999999 not found/);
});

test("note --supersedes refuses non-note handle (treated as missing note target)", async () => {
  const { question } = await session.writes.pose({ question: "some q" });
  await expect(session.writes.note({ text: "x", supersedes: [question] as never })).rejects.toThrow(
    /not found/,
  );
});

test("note --supersedes refuses self", async () => {
  // Patch reserveId for this graph instance to force the id minted for this note()
  // to a known value present in the supersedes input. This exercises the exact
  // post-mint `if (old === noted)` self guard in Asking.note.
  const g = graph as unknown as {
    reserveId: (label: import("../src/db/domain").NodeLabel) => Promise<string>;
  };
  const original = g.reserveId;
  g.reserveId = async (label) => {
    if (label === "Note") return "NOTE_SELF";
    return original.call(graph, label);
  };
  try {
    await expect(
      session.writes.note({
        text: "would supersede the note being created",
        supersedes: ["NOTE_SELF"] as never,
      }),
    ).rejects.toThrow(/a note cannot supersede itself \(NOTE_SELF\)/);
  } finally {
    g.reserveId = original;
  }
});

test("an existing note can supersede another without minting a third", async () => {
  const { note: old } = await session.writes.note({ text: "initial take" });
  const { note: newer } = await session.writes.note({ text: "later take" });
  const result = await session.writes.note({ note: newer, supersedes: [old] });
  expect(result.note).toBe(newer);
  const listed = await session.reads.notes({});
  expect(listed.map((n) => n.note).sort()).toEqual([old, newer].sort());
  const byId = new Map(listed.map((n) => [n.note, n] as const));
  expect(byId.get(newer)!.supersedes).toContain(old);
  expect(byId.get(old)!.supersededBy).toContain(newer);
  const whyOld = await session.reads.why({ subject: old });
  expect(whyOld.because.some((b) => b.handle === newer)).toBe(true);
});

test("historic supersedes refuses a missing standing note", async () => {
  const { note: old } = await session.writes.note({ text: "old" });
  await expect(
    session.writes.note({ note: "NOTE_999999" as never, supersedes: [old] }),
  ).rejects.toThrow(/NOTE_999999 not found/);
});

test("historic supersedes refuses self", async () => {
  const { note } = await session.writes.note({ text: "only" });
  await expect(session.writes.note({ note, supersedes: [note] })).rejects.toThrow(
    /a note cannot supersede itself/,
  );
});
