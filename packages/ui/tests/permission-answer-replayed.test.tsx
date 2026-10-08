/**
 * A call's permission outcome drawn live, where this client was asked, and after the session is
 * loaded again, where it is not: labkit's agent sends the outcome with the call in both.
 */

import { describe, expect, test } from "bun:test";
import type { RequestPermissionOutcome, SessionUpdate } from "@agentclientprotocol/sdk";
import { PERMISSION_ANSWER_KEY, replay, type ViewEvent } from "@labkit/view-model";
import { renderToStaticMarkup } from "react-dom/server";
import { Conversation } from "../index";

const OPTIONS = [
  { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
  { optionId: "reject-once", name: "Reject", kind: "reject_once" },
] as const;

const ALLOW = OPTIONS[0];
const REJECT = OPTIONS[1];

const update = (u: SessionUpdate): ViewEvent => ({ type: "update", update: u });

/**
 * One call, asked about, with `option` selected or, for `"cancelled"`, its turn cancelled; `live`
 * adds the question and this client's answer, which a loaded session does not send.
 */
function answered(
  id: string,
  option: (typeof OPTIONS)[number] | "cancelled",
  live: boolean,
): ViewEvent[] {
  const given: RequestPermissionOutcome =
    option === "cancelled"
      ? { outcome: "cancelled" }
      : { outcome: "selected", optionId: option.optionId };
  const asked: ViewEvent[] = live
    ? [
        {
          type: "permission_requested",
          requestId: `request-${id}`,
          request: { toolCall: { toolCallId: id, status: "pending" }, options: [...OPTIONS] },
        },
        { type: "permission_answered", requestId: `request-${id}`, outcome: given },
      ]
    : [];
  const recorded =
    option === "cancelled" ? given : { ...given, name: option.name, kind: option.kind };
  const ran = option === ALLOW;
  return [
    update({ sessionUpdate: "tool_call", toolCallId: id, title: id, status: "pending" }),
    ...asked,
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: id,
      _meta: { [PERMISSION_ANSWER_KEY]: recorded },
    }),
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: id,
      status: ran ? "completed" : "failed",
      ...(ran ? { rawOutput: "Wrote 5 bytes" } : {}),
    }),
  ];
}

const draw = (...events: ViewEvent[][]): string =>
  renderToStaticMarkup(
    <Conversation
      state={replay([
        { type: "prompt_started", content: [{ type: "text", text: "Write it" }] },
        ...events.flat(),
      ])}
    />,
  );

describe("a call's permission outcome", () => {
  test("draws the same receipt and status live and after the session is loaded again", () => {
    const calls = (live: boolean) => [
      answered("write_file", ALLOW, live),
      answered("run_command", REJECT, live),
    ];
    expect(draw(...calls(false))).toBe(draw(...calls(true)));
  });

  test("after a reload, reads Allowed once or Denied, with the option's name as hover text, and a denied call shows as refused", () => {
    const html = draw(answered("write_file", ALLOW, false), answered("run_command", REJECT, false));
    expect(html).toContain('lk-decision allow" title="Allow once">Allowed once</span>');
    expect(html).toContain('lk-decision reject" title="Reject">Denied</span>');
    expect(html).toContain('class="lk-status refused" role="img" aria-label="Refused"');
  });

  test("of a request whose turn was cancelled reads Cancelled before a decision, live and after a reload alike", () => {
    const reloaded = draw(answered("write_file", "cancelled", false));
    expect(reloaded).toBe(draw(answered("write_file", "cancelled", true)));
    expect(reloaded).toContain('lk-decision cancelled">Cancelled before a decision</span>');
    expect(reloaded).toContain('class="lk-status cancelled" role="img" aria-label="Cancelled"');
    expect(reloaded).not.toContain("Denied");
  });

  test("after a reload of a call the agent recorded no outcome for, draws no receipt", () => {
    const html = draw([
      update({ sessionUpdate: "tool_call", toolCallId: "c1", title: "c1", status: "pending" }),
    ]);
    expect(html).not.toContain("lk-decision");
  });
});
