/**
 * `how <handle>` — the ordered provenance of any handle's state, with superseded steps marked.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { ResearchSession } from "../src/domain";
import type { TenantGraph } from "../src/db/graph";
import { openScenario, type Scenario } from "./helpers/scenario";
import { recordAnalysis, replaceAnalysis } from "./helpers/analysis";
import { claimOf } from "./helpers/claims";

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

test("how on a first-pose question returns one non-superseded step", async () => {
  const { question } = await session.writes.pose({ question: "does X cause Y?" });
  const h = await session.reads.how({ subject: question });
  expect(h.subject).toBe(question);
  expect(h.steps.length).toBe(1);
  expect(h.steps[0]!.handle).toBe(question);
  expect(h.steps[0]!.superseded).toBe(false);
  expect(h.steps[0]!.successor).toBeUndefined();
});

test("how on a replaced claim marks the old as superseded with successor", async () => {
  const { enquiry } = await session.writes.openEnquiry("does method M work?");
  const { observations } = await session.writes.recordObservations({
    enquiry,
    name: "raw data",
    finding: "measurements",
  });
  const first = await recordAnalysis(session.writes, {
    enquiry,
    method: "initial",
    from: [observations],
    concludes: [{ proposition: "M works on the sample", finding: "p < 0.01" }],
  });
  const claim = claimOf(first.claims, "M works on the sample");

  // review + replace
  const { review } = await session.writes.recordReview({
    of: first.analysis,
    verdict: "fail",
  });
  const repl = await replaceAnalysis(session.writes, {
    supersedes: first.analysis,
    because: review,
    enquiry,
    method: "corrected sampling",
    from: [observations],
    concludes: [
      { proposition: "M does not work after correction", finding: "p = 0.4", replacing: claim },
    ],
  });
  const newClaim = claimOf(repl.claims, "M does not work after correction");

  const howOld = await session.reads.how({ subject: claim });
  const oldStep = howOld.steps.find((s) => s.handle === claim);
  expect(oldStep).toBeDefined();
  expect(oldStep!.superseded).toBe(true);
  expect(oldStep!.successor).toBe(newClaim);

  const howNew = await session.reads.how({ subject: newClaim });
  expect(howNew.steps.some((s) => s.handle === newClaim && !s.superseded)).toBe(true);
});

test("how on notes with supersedes marks superseded and names successor", async () => {
  const { note: old } = await session.writes.note({ text: "initial take" });
  const { note: newer } = await session.writes.note({ text: "replaces it", supersedes: [old] });

  const hOld = await session.reads.how({ subject: old });
  const sOld = hOld.steps.find((s) => s.handle === old);
  expect(sOld?.superseded).toBe(true);
  expect(sOld?.successor).toBe(newer);

  const hNew = await session.reads.how({ subject: newer });
  expect(hNew.steps.some((s) => s.handle === newer && !s.superseded)).toBe(true);
});

test("--since is a cursor: only later seqs, including dropping the named handle", async () => {
  const { note: old } = await session.writes.note({ text: "initial take" });
  const { note: newer } = await session.writes.note({ text: "later take", supersedes: [old] });
  const hOld = await session.reads.how({ subject: old });
  const oldSeq = hOld.steps.find((s) => s.handle === old)?.seq;
  expect(oldSeq).toBeDefined();
  const after = await session.reads.how({ subject: old, since: oldSeq });
  expect(after.steps.every((s) => s.seq !== undefined && s.seq > oldSeq!)).toBe(true);
  expect(after.steps.some((s) => s.handle === old)).toBe(false);
  expect(after.steps.some((s) => s.handle === newer)).toBe(true);
});

test("how refuses unknown handle like why", async () => {
  await expect(session.reads.how({ subject: "NOTE_999999" })).rejects.toThrow(/not found/);
});

test("how dispatches on NOTE, CLM, Q, TASK handles", async () => {
  const { question } = await session.writes.pose({ question: "any kind?" });
  const { note } = await session.writes.note({ text: "a note", on: question });
  const { enquiry } = await session.writes.openEnquiry("enq");
  const { work } = await session.writes.planWork({
    objective: "do the thing",
    acceptance: "done",
    addressing: enquiry,
  });

  // at least they return without throwing and include the subject
  for (const subj of [note, question, work]) {
    const h = await session.reads.how({ subject: subj });
    expect(h.steps.some((s) => s.handle === subj)).toBe(true);
  }
});
