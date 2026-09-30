/** The indicator of what a running turn is doing, and the thinking block that folds. */

import { describe, expect, test } from "bun:test";
import { initialState, reduce, type TranscriptState, type ViewEvent } from "@labkit/view-model";
import { renderToStaticMarkup } from "react-dom/server";
import { currentActivity } from "../activity";
import { Conversation } from "../conversation";

const started: ViewEvent = { type: "prompt_started", content: [{ type: "text", text: "Go" }] };
const call = (id: string, status: string, rawInput?: unknown): ViewEvent => ({
  type: "update",
  update: {
    sessionUpdate: "tool_call",
    toolCallId: id,
    title: "read_file",
    name: "read_file",
    status,
    ...(rawInput === undefined ? {} : { rawInput }),
  } as never,
});
const chunk = (kind: "agent_message_chunk" | "agent_thought_chunk", text: string): ViewEvent => ({
  type: "update",
  update: { sessionUpdate: kind, content: { type: "text", text } },
});
const state = (...events: ViewEvent[]): TranscriptState => events.reduce(reduce, initialState);

describe("what a running turn is doing", () => {
  test("nothing when idle", () => {
    expect(currentActivity(state(call("a", "in_progress")))).toBeUndefined();
  });

  test("the tool call it is waiting on, named with its input", () => {
    expect(
      currentActivity(state(started, call("a", "in_progress", { path: "DESIGN.md" }))),
    ).toEqual({
      kind: "tool",
      label: "read_file DESIGN.md",
    });
  });

  test("a call left unsettled in an earlier turn is not what is happening now", () => {
    expect(
      currentActivity(state(call("old", "pending"), chunk("agent_message_chunk", "done"), started)),
    ).toEqual({ kind: "working" });
  });

  test("thinking while a thought is the last block; nothing once answer text arrives", () => {
    expect(currentActivity(state(started, chunk("agent_thought_chunk", "hmm")))).toEqual({
      kind: "thinking",
    });
    expect(
      currentActivity(
        state(started, chunk("agent_thought_chunk", "hmm"), chunk("agent_message_chunk", "So")),
      ),
    ).toBeUndefined();
  });
});

describe("the thinking block", () => {
  test("is open and says Thinking while it streams", () => {
    const html = renderToStaticMarkup(
      <Conversation state={state(started, chunk("agent_thought_chunk", "hmm"))} />,
    );
    expect(html).toMatch(/<details class="lk-thought" data-streaming="true" open="">/);
    expect(html).toContain("Thinking…");
    expect(html).toContain('class="lk-working"');
  });

  test("is folded and says Thought once the answer has started", () => {
    const html = renderToStaticMarkup(
      <Conversation
        state={state(
          started,
          chunk("agent_thought_chunk", "hmm"),
          chunk("agent_message_chunk", "So"),
        )}
      />,
    );
    expect(html).toContain('<details class="lk-thought"><summary>Thought</summary>');
    expect(html).not.toContain('class="lk-working"');
  });
});
