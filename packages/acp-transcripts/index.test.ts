/** Each recorded transcript replays through the real reducer, the same as a live session would. */

import { expect, test } from "bun:test";
import { initialState, reduce } from "@labkit/view-model";
import { TRANSCRIPTS } from "./index";

test("every transcript has a distinct id and at least one event", () => {
  const ids = TRANSCRIPTS.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const transcript of TRANSCRIPTS) expect(transcript.events.length).toBeGreaterThan(0);
});

test("every transcript folds through reduce into a transcript with blocks and no failure", () => {
  for (const transcript of TRANSCRIPTS) {
    const state = transcript.events.reduce(reduce, initialState);
    expect(state.blocks.length).toBeGreaterThan(0);
    expect(state.blocks.some((b) => b.kind === "notice" && b.severity === "error")).toBe(false);
  }
});

test("a recorded tool call that finished carries the reconstructed marker replay sets", () => {
  // A plan update (update_plan) is never finalised through a tool_call_update, so it stays
  // pending and unmarked even on a real, completed session -- the check is scoped to calls
  // replay actually settled.
  const [transcript] = TRANSCRIPTS;
  const state = transcript!.events.reduce(reduce, initialState);
  const settled = Object.values(state.toolCalls).filter((call) => call.status !== "pending");
  expect(settled.length).toBeGreaterThan(0);
  expect(settled.every((call) => call._meta?.["labkit.dev/reconstructed"] === true)).toBe(true);
});

test("no transcript names the real machine path it was recorded from", () => {
  for (const transcript of TRANSCRIPTS) {
    expect(JSON.stringify(transcript.events)).not.toContain("/Users/");
  }
});
