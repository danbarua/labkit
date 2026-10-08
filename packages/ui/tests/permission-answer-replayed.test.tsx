/**
 * A call's permission answer drawn live, where this client was asked, and after the session is
 * loaded again, where it is not: labkit's agent sends the answer with the call in both.
 */

import { describe, expect, test } from "bun:test";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { PERMISSION_ANSWER_KEY, replay, type ViewEvent } from "@labkit/view-model";
import { renderToStaticMarkup } from "react-dom/server";
import { Conversation } from "../index";

const OPTIONS = [
  { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
  { optionId: "reject-once", name: "Reject", kind: "reject_once" },
] as const;

const update = (u: SessionUpdate): ViewEvent => ({ type: "update", update: u });

/** One call, asked about and answered with `option`; `live` adds the question and its answer. */
function answered(id: string, option: (typeof OPTIONS)[number], live: boolean): ViewEvent[] {
  const asked: ViewEvent[] = live
    ? [
        {
          type: "permission_requested",
          requestId: `request-${id}`,
          request: { toolCall: { toolCallId: id, status: "pending" }, options: [...OPTIONS] },
        },
        {
          type: "permission_answered",
          requestId: `request-${id}`,
          outcome: { outcome: "selected", optionId: option.optionId },
        },
      ]
    : [];
  const allowed = option.kind === "allow_once";
  return [
    update({ sessionUpdate: "tool_call", toolCallId: id, title: id, status: "pending" }),
    ...asked,
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: id,
      _meta: { [PERMISSION_ANSWER_KEY]: { ...option } },
    }),
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: id,
      status: allowed ? "completed" : "failed",
      rawOutput: allowed ? "Wrote 5 bytes" : "The person refused this call",
    }),
  ];
}

const draw = (live: boolean): string =>
  renderToStaticMarkup(
    <Conversation
      state={replay([
        { type: "prompt_started", content: [{ type: "text", text: "Write it" }] },
        ...answered("write_file", OPTIONS[0], live),
        ...answered("run_command", OPTIONS[1], live),
      ])}
    />,
  );

describe("a call's permission answer", () => {
  test("draws the same receipt and status live and after the session is loaded again", () => {
    expect(draw(false)).toBe(draw(true));
  });

  test("after a reload, reads Allowed once or Denied, with the option's name as hover text, and a denied call shows as refused", () => {
    const html = draw(false);
    expect(html).toContain('lk-decision allow" title="Allow once">Allowed once</span>');
    expect(html).toContain('lk-decision reject" title="Reject">Denied</span>');
    expect(html).toContain('class="lk-status refused" role="img" aria-label="Refused"');
  });

  test("after a reload of a call the agent recorded no answer for, draws no receipt", () => {
    const html = renderToStaticMarkup(
      <Conversation
        state={replay([
          update({ sessionUpdate: "tool_call", toolCallId: "c1", title: "c1", status: "pending" }),
        ])}
      />,
    );
    expect(html).not.toContain("lk-decision");
  });
});
