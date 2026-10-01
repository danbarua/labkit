/** The indicator of what a running turn is doing, and the thinking block that folds. */

import { describe, expect, test } from "bun:test";
import { initialState, reduce, type TranscriptState, type ViewEvent } from "@labkit/view-model";
import { renderToStaticMarkup } from "react-dom/server";
import { activityMood, afterPause, currentActivity } from "../activity";
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

  test("waiting for the first word right after the prompt", () => {
    expect(currentActivity(state(started))).toEqual({ kind: "waiting" });
  });

  test("waiting on the provider again once this turn's tools have settled", () => {
    expect(currentActivity(state(started, call("a", "completed")))).toEqual({ kind: "waiting" });
  });

  test("a call left unsettled in an earlier turn is not what is happening now", () => {
    expect(
      currentActivity(state(call("old", "pending"), chunk("agent_message_chunk", "done"), started)),
    ).toEqual({ kind: "waiting" });
  });

  test("thinking while a thought is the last block; speaking once answer text arrives", () => {
    expect(currentActivity(state(started, chunk("agent_thought_chunk", "hmm")))).toEqual({
      kind: "thinking",
    });
    expect(
      currentActivity(
        state(started, chunk("agent_thought_chunk", "hmm"), chunk("agent_message_chunk", "So")),
      ),
    ).toEqual({ kind: "speaking" });
  });

  test("thinking or speaking that has gone quiet is waiting on the provider again", () => {
    expect(afterPause({ kind: "speaking" }, true)).toEqual({ kind: "waiting" });
    expect(afterPause({ kind: "thinking" }, true)).toEqual({ kind: "waiting" });
    expect(afterPause({ kind: "speaking" }, false)).toEqual({ kind: "speaking" });
    expect(afterPause({ kind: "tool", label: "x" }, true)).toEqual({ kind: "tool", label: "x" });
    expect(afterPause(undefined, true)).toBeUndefined();
  });

  test("after a turn that ended in an error, failed until the next prompt", () => {
    const failed: ViewEvent = {
      type: "failed",
      message: "Provider request failed: 529 Overloaded",
    };
    expect(currentActivity(state(started, chunk("agent_message_chunk", "So"), failed))).toEqual({
      kind: "failed",
    });
    expect(currentActivity(state(started, failed, started))).toEqual({ kind: "waiting" });
    const html = renderToStaticMarkup(<Conversation state={state(started, failed)} />);
    expect(html).toContain('<span class="lk-badge stopped">Stopped</span>');
    expect(html).toContain('data-mood="failed"');
  });

  test("the loader's pace and colour follow the activity", () => {
    expect(activityMood({ kind: "waiting" })).toBe("waiting");
    expect(activityMood({ kind: "thinking" })).toBe("working");
    expect(activityMood({ kind: "tool", label: "x" })).toBe("working");
    expect(activityMood({ kind: "speaking" })).toBe("speaking");
    expect(activityMood({ kind: "failed" })).toBe("failed");
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
    expect(html).toContain('<div class="lk-working" role="status" aria-label="Answering">');
    expect(html).toContain('data-mood="speaking"');
    expect(html).not.toContain("lk-working-label");
  });

  test("with a composer, the loader sits in its corner and the row under the transcript is words", () => {
    const thinking = renderToStaticMarkup(
      <Conversation
        state={state(started, chunk("agent_thought_chunk", "hmm"))}
        onSend={() => {}}
      />,
    );
    expect(thinking).toMatch(
      /<span class="lk-composer-loader"><div class="lk-loader" data-mood="working"/,
    );
    expect(thinking).toMatch(
      /<div class="lk-working" role="status" aria-label="Thinking"><span class="lk-working-label">/,
    );
    const speaking = renderToStaticMarkup(
      <Conversation state={state(started, chunk("agent_message_chunk", "So"))} onSend={() => {}} />,
    );
    expect(speaking).toContain('<div class="lk-loader" data-mood="speaking"');
    expect(speaking).toContain(
      '<div class="lk-message assistant" data-last="true" data-streaming="true">',
    );
    expect(speaking).not.toContain('class="lk-working"');
  });
});
