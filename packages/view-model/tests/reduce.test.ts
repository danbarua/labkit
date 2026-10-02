/** The reducer's rules, one at a time, against updates written out by hand. */

import { describe, expect, test } from "bun:test";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import {
  initialState,
  mergeToolCall,
  reduce,
  replay,
  textOf,
  type TranscriptState,
  type ViewEvent,
} from "../index";

const update = (u: SessionUpdate): ViewEvent => ({ type: "update", update: u });

const said = (text: string, messageId?: string): ViewEvent =>
  update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text }, messageId });

const texts = (state: TranscriptState): string[] =>
  state.blocks.flatMap((b) => ("content" in b ? [textOf(b.content)] : []));

describe("chunks", () => {
  test("chunks of one message id join, and a new id starts a new message", () => {
    const state = replay([said("Two ", "m1"), said("parts", "m1"), said("Next", "m2")]);
    expect(texts(state)).toEqual(["Two parts", "Next"]);
  });

  test("chunks with no id continue the message before them", () => {
    expect(texts(replay([said("a"), said("b")]))).toEqual(["ab"]);
  });

  test("a tool call between chunks splits the message in two", () => {
    const state = replay([
      said("before", "m1"),
      update({ sessionUpdate: "tool_call", toolCallId: "c1", title: "read" }),
      said("after", "m1"),
    ]);
    expect(state.blocks.map((b) => b.kind)).toEqual(["assistant", "tool", "assistant"]);
  });

  test("a thought and an answer with no ids stay separate blocks", () => {
    const state = replay([
      update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "hm" } }),
      said("ok"),
    ]);
    expect(state.blocks.map((b) => b.kind)).toEqual(["thought", "assistant"]);
  });
});

describe("tool calls", () => {
  test("an update for a call not yet announced still makes a card", () => {
    const state = replay([
      update({ sessionUpdate: "tool_call_update", toolCallId: "c9", status: "completed" }),
    ]);
    expect(state.blocks).toEqual([{ kind: "tool", toolCallId: "c9" }]);
    expect(state.toolCalls.c9?.title).toBe("Tool c9");
  });

  test("an update that omits or nulls a field keeps what was there", () => {
    const first = mergeToolCall(undefined, {
      toolCallId: "c1",
      title: "read",
      kind: "read",
      content: [{ type: "content", content: { type: "text", text: "kept" } }],
      rawOutput: { ok: true },
    });
    const next = mergeToolCall(first, {
      toolCallId: "c1",
      title: null,
      content: null,
      status: "completed",
    });
    expect(next.title).toBe("read");
    expect(next.content).toEqual(first.content);
    expect(next.rawOutput).toEqual({ ok: true });
    expect(next.status).toBe("completed");
  });
});

describe("plans", () => {
  const plan = (planId: string, ...statuses: ("pending" | "completed")[]): ViewEvent =>
    update({
      sessionUpdate: "plan_update",
      plan: {
        type: "items",
        planId,
        entries: statuses.map((status, i) => ({
          content: `step ${i}`,
          priority: "medium" as const,
          status,
        })),
      },
    });

  test("an update to a known plan replaces its entries and adds no block", () => {
    const state = replay([plan("p", "pending", "pending"), plan("p", "completed", "pending")]);
    expect(state.blocks).toEqual([{ kind: "plan", planId: "p" }]);
    const shown = state.plans.p;
    expect(shown?.kind === "items" && shown.entries.map((e) => e.status)).toEqual([
      "completed",
      "pending",
    ]);
  });

  test("a plan updated to no entries is cleared, heading and all", () => {
    expect(replay([plan("p", "pending"), plan("p")]).blocks).toEqual([]);
    const cleared = replay([
      update({
        sessionUpdate: "plan",
        entries: [{ content: "step", priority: "high", status: "pending" }],
      }),
      update({ sessionUpdate: "plan", entries: [] }),
    ]);
    expect(cleared.blocks).toEqual([]);
    expect(cleared.plans).toEqual({});
  });

  test("removing a plan takes its block with it", () => {
    const state = replay([
      plan("p", "pending"),
      update({ sessionUpdate: "plan_removed", planId: "p" }),
    ]);
    expect(state.blocks).toEqual([]);
    expect(state.plans).toEqual({});
  });

  test("a plan given as markdown or a file is kept as sent", () => {
    const state = replay([
      update({
        sessionUpdate: "plan_update",
        plan: { type: "markdown", planId: "m", content: "# Plan" },
      }),
      update({
        sessionUpdate: "plan_update",
        plan: { type: "file", planId: "f", uri: "file:///plan.md" },
      }),
    ]);
    expect(state.plans.m).toEqual({ kind: "markdown", content: "# Plan" });
    expect(state.plans.f).toEqual({ kind: "file", uri: "file:///plan.md" });
  });
});

describe("the client's own events", () => {
  test("sending a prompt adds the user's message and starts the turn", () => {
    const state = reduce(initialState, {
      type: "prompt_started",
      content: [{ type: "text", text: "hello" }],
    });
    expect(state.running).toBe(true);
    expect(texts(state)).toEqual(["hello"]);
  });

  test("a new prompt forgets how the last turn ended", () => {
    const ended = reduce(initialState, { type: "prompt_ended", stopReason: "refusal" });
    expect(ended.stopReason).toBe("refusal");
    const next = reduce(ended, {
      type: "prompt_started",
      content: [{ type: "text", text: "again" }],
    });
    expect(next.stopReason).toBeUndefined();
  });

  test("a failed request ends the turn and shows why", () => {
    const running = reduce(initialState, {
      type: "prompt_started",
      content: [{ type: "text", text: "go" }],
    });
    const state = reduce(running, { type: "failed", message: "connection refused" });
    expect(state.running).toBe(false);
    expect(state.blocks.at(-1)).toMatchObject({
      kind: "notice",
      severity: "error",
      description: "connection refused",
    });
  });

  test("answering a request that is not known changes nothing", () => {
    const state = reduce(initialState, {
      type: "permission_answered",
      requestId: "nope",
      outcome: { outcome: "cancelled" },
    });
    expect(state).toEqual(initialState);
  });
});

describe("purity", () => {
  test("reducing does not change the state it was given", () => {
    const before = replay([said("x", "m1")]);
    const snapshot = JSON.stringify(before);
    reduce(before, said("y", "m1"));
    reduce(before, update({ sessionUpdate: "tool_call", toolCallId: "c", title: "t" }));
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test("an update type this version does not know changes nothing", () => {
    const future = { sessionUpdate: "from_a_later_version" } as unknown as SessionUpdate;
    const state = replay([said("x")]);
    expect(reduce(state, update(future))).toBe(state);
  });
});
