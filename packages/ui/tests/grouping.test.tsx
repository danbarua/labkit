/** Consecutive tool calls drawn as one row, and what breaks a run. */

import { describe, expect, test } from "bun:test";
import { initialState, reduce, type TranscriptState, type ViewEvent } from "@labkit/view-model";
import { renderToStaticMarkup } from "react-dom/server";
import { Conversation } from "../conversation";
import { drawnBlocks, toolTally } from "../grouping";

const call = (id: string, name: string, status = "completed"): ViewEvent => ({
  type: "update",
  update: { sessionUpdate: "tool_call", toolCallId: id, title: name, name, status } as never,
});
const text = (value: string): ViewEvent => ({
  type: "update",
  update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: value } },
});
const state = (...events: ViewEvent[]): TranscriptState => events.reduce(reduce, initialState);

describe("folding runs of tool calls", () => {
  test("two or more calls in a row become one item; a lone call stays a block", () => {
    const drawn = drawnBlocks(
      state(call("a", "read_file"), call("b", "read_file"), text("so"), call("c", "list_dir")),
    );
    expect(drawn.map((d) => d.kind)).toEqual(["tools", "block", "block"]);
    expect(drawn[0]?.kind === "tools" && drawn[0].blocks.length).toBe(2);
  });

  test("a message that is only whitespace is not drawn, and does not break a run", () => {
    const drawn = drawnBlocks(state(call("a", "read_file"), text("\n\n"), call("b", "read_file")));
    expect(drawn.map((d) => d.kind)).toEqual(["tools"]);
  });

  test("a call waiting on the person breaks the run and stands alone", () => {
    const asked: ViewEvent = {
      type: "permission_requested",
      requestId: "p1",
      request: {
        toolCall: { toolCallId: "b", title: "write_file" },
        options: [{ optionId: "ok", name: "Allow once", kind: "allow_once" }],
      },
    };
    const drawn = drawnBlocks(
      state(
        call("a", "read_file"),
        call("b", "write_file", "pending"),
        call("c", "read_file"),
        asked,
      ),
    );
    expect(drawn.map((d) => d.kind)).toEqual(["block", "block", "block"]);
  });

  test("an item keeps its key when a block before it is removed", () => {
    const plan = (entries: number): ViewEvent => ({
      type: "update",
      update: {
        sessionUpdate: "plan",
        entries: Array.from({ length: entries }, () => ({
          content: "step",
          priority: "medium" as const,
          status: "pending" as const,
        })),
      },
    });
    const before = state(text("first"), plan(1), call("a", "read_file"), text("then"));
    const after = reduce(before, plan(0));
    const keys = (drawn: ReturnType<typeof drawnBlocks>) => drawn.map((d) => d.key);
    expect(keys(drawnBlocks(after))).toEqual(
      keys(drawnBlocks(before)).filter((key) => !key.startsWith("plan/")),
    );
    expect(new Set(keys(drawnBlocks(after))).size).toBe(drawnBlocks(after).length);
  });

  test("the tally counts each tool in the order it first appears", () => {
    expect(toolTally(["read_file", "list_dir", "read_file", "update_plan", "read_file"])).toBe(
      "read_file ×3 · list_dir · update_plan",
    );
  });
});

describe("a group's row", () => {
  test("says how many, which tools, and how many failed or were refused", () => {
    const html = renderToStaticMarkup(
      <Conversation
        state={state(call("a", "read_file"), call("b", "read_file", "failed"), {
          type: "update",
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "c",
            title: "list_dir",
            name: "list_dir",
            status: "failed",
            rawOutput: { refused: true },
          } as never,
        })}
      />,
    );
    expect(html).toContain('<span class="lk-tool-count">3 tool calls</span>');
    expect(html).toContain('<span class="lk-tool-preview">read_file ×2 · list_dir</span>');
    expect(html).toContain('<span class="lk-tool-tally failed">1 failed</span>');
    expect(html).toContain('<span class="lk-tool-tally refused">1 refused</span>');
    // Most calls finished, so the run as a whole did; the tallies carry the failures.
    expect(html).toMatch(/<details class="lk-tool lk-tool-group" data-status="completed">/);
  });

  test("is failed only when every call failed or was refused", () => {
    const html = renderToStaticMarkup(
      <Conversation
        state={state(call("a", "read_file", "failed"), call("b", "list_dir", "failed"))}
      />,
    );
    expect(html).toMatch(/lk-tool-group" data-status="failed"/);
  });

  test("shows the spinner while any call is still going", () => {
    const html = renderToStaticMarkup(
      <Conversation state={state(call("a", "read_file"), call("b", "read_file", "in_progress"))} />,
    );
    expect(html).toMatch(/lk-tool-group" data-status="in_progress"/);
    expect(html).toContain('class="lk-status in_progress"');
  });
});
