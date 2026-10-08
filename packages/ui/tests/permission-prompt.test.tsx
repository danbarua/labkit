/** A permission request drawn for the person to decide: what the agent sent about the call. */

import { describe, expect, test } from "bun:test";
import type { ToolCall, ToolCallContent } from "@agentclientprotocol/sdk";
import type { PermissionEntry } from "@labkit/view-model";
import { renderToStaticMarkup } from "react-dom/server";
import { PermissionPrompt } from "../permission";
import { ToolCard } from "../tool";

const COMMAND = "sed -i '' -e 's/alpha/ALPHA/' -e '/^$/d' notes.txt";

/** The reasons labkit-effect sends with a command's question, as Markdown. */
const NEEDS = [
  "This command needs permission:",
  "",
  `- ${COMMAND}: it is not allowed yet`,
  "",
  "  Edits notes.txt in place:",
  "  - Replaces the first match of `alpha` with `ALPHA`, on every line.",
  "  - Deletes lines matching `^$`.",
  `- ${COMMAND}: it writes notes.txt`,
].join("\n");

const asking = (content: ToolCallContent[] | undefined): PermissionEntry => ({
  requestId: "r1",
  request: {
    toolCall: {
      toolCallId: "call-1",
      title: "Uppercase alpha",
      status: "pending",
      rawInput: { command: COMMAND },
      ...(content === undefined ? {} : { content }),
    },
    options: [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "reject-once", name: "Reject", kind: "reject_once" },
    ],
  },
});

const draw = (entry: PermissionEntry) =>
  renderToStaticMarkup(<PermissionPrompt entry={entry} onAnswer={() => {}} />);

describe("the content a permission request carries", () => {
  test("a command's reasons and explanation are drawn as lists, with no Markdown markers left in the text", () => {
    const html = draw(asking([{ type: "content", content: { type: "text", text: NEEDS } }]));
    expect(html).toContain('class="lk-permission-why"');
    expect(html).toContain("<li>Replaces the first match of <code>alpha</code>");
    expect(html).toContain("<li>Deletes lines matching <code>^$</code>.</li>");
    expect(html).not.toContain("- Replaces");
    expect(html).not.toContain("`alpha`");
  });

  test("a diff sent with the request is left to the call's card", () => {
    const html = draw(
      asking([{ type: "diff", path: "/work/notes.txt", oldText: "alpha\n", newText: "ALPHA\n" }]),
    );
    expect(html).not.toContain("lk-diff");
    expect(html).not.toContain("lk-permission-why");
  });

  test("a request with no content draws no explanation", () => {
    expect(draw(asking(undefined))).not.toContain("lk-permission-why");
  });
});

describe("the heading over a tool call's content", () => {
  const call = (status: ToolCall["status"]): ToolCall => ({
    toolCallId: "call-1",
    title: "run_command",
    status,
    content: [
      { type: "content", content: { type: "text", text: "This command needs permission" } },
    ],
  });

  test("a call that has not ended heads its content Details", () => {
    for (const status of ["pending", "in_progress"] as const) {
      const html = renderToStaticMarkup(<ToolCard call={call(status)} />);
      expect(html).toContain("<h4>Details</h4>");
      expect(html).not.toContain("<h4>Result</h4>");
    }
  });

  test("a call waiting on the person's answer leaves its text to the permission request, and still draws its diff", () => {
    const html = renderToStaticMarkup(
      <ToolCard
        call={{
          ...call("pending"),
          content: [
            ...(call("pending").content ?? []),
            { type: "diff", path: "/work/notes.txt", oldText: "alpha\n", newText: "ALPHA\n" },
          ],
        }}
        permission={asking(undefined)}
      />,
    );
    expect(html).not.toContain("This command needs permission");
    expect(html).toContain('class="lk-diff"');
  });

  test("a call that has completed or failed heads its content Result", () => {
    for (const status of ["completed", "failed"] as const)
      expect(renderToStaticMarkup(<ToolCard call={call(status)} />)).toContain("<h4>Result</h4>");
  });
});

/** The `<button>` element among `node`'s descendants whose text is `label`. */
function buttonNamed(node: unknown, label: string): { props: Record<string, unknown> } | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = buttonNamed(child, label);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof node !== "object" || node === null || !("props" in node)) return undefined;
  const element = node as { type: unknown; props: Record<string, unknown> };
  if (element.type === "button" && element.props.children === label) return element;
  return buttonNamed(element.props.children, label);
}

describe("cancelling the turn from a permission request", () => {
  test("Cancel turn cancels the turn, and does not answer the request", () => {
    const answers: unknown[] = [];
    let cancels = 0;
    const card = PermissionPrompt({
      entry: asking(undefined),
      onAnswer: (requestId, outcome) => answers.push([requestId, outcome]),
      onCancel: () => {
        cancels += 1;
      },
    });
    const cancel = buttonNamed(card, "Cancel turn");
    if (cancel === undefined) throw new Error("no Cancel turn button");
    (cancel.props.onClick as () => void)();
    expect(cancels).toBe(1);
    expect(answers).toEqual([]);
  });

  test("with no way to cancel the turn, Cancel turn is disabled though the options can be answered", () => {
    const html = draw(asking(undefined));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Cancel turn<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Allow once<\/button>/);
  });
});
