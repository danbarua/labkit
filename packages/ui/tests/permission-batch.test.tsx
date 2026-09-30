/** Several permission requests answered together. */

import { describe, expect, test } from "bun:test";
import type { RequestPermissionOutcome } from "@agentclientprotocol/sdk";
import type { PermissionEntry } from "@labkit/view-model";
import { renderToStaticMarkup } from "react-dom/server";
import { PermissionBatch, PermissionPrompt } from "../permission";

const entry = (id: string, kinds: string[]): PermissionEntry => ({
  requestId: id,
  request: {
    toolCall: { toolCallId: `call-${id}`, title: "write_file" },
    options: kinds.map((kind) => ({ optionId: `${id}-${kind}`, name: kind, kind })) as never,
  },
});

describe("answering every waiting request", () => {
  test("offers a choice only when every request has an option of that kind", () => {
    const both = renderToStaticMarkup(
      <PermissionBatch
        entries={[
          entry("a", ["allow_once", "reject_once"]),
          entry("b", ["allow_once", "reject_once"]),
        ]}
        onAnswer={() => {}}
      />,
    );
    expect(both).toContain("2 requests are waiting");
    expect(both).toContain("Allow all once");
    expect(both).toContain("Deny all");
    const some = renderToStaticMarkup(
      <PermissionBatch
        entries={[
          entry("a", ["allow_once", "reject_once"]),
          entry("b", ["allow_always", "reject_once"]),
        ]}
        onAnswer={() => {}}
      />,
    );
    expect(some).not.toContain("Allow all once");
    expect(some).toContain("Deny all");
  });

  test("answers each request with that request's own option", () => {
    const answers: [string, RequestPermissionOutcome][] = [];
    // The component's handler, called as its button would.
    const entries = [
      entry("a", ["allow_once", "reject_once"]),
      entry("b", ["allow_once", "reject_once"]),
    ];
    const element = PermissionBatch({
      entries,
      onAnswer: (id, outcome) => answers.push([id, outcome]),
    });
    const deny = (element.props.children as { props: { children: unknown[] } }[])[1]?.props
      .children[1] as {
      props: { onClick: () => void };
    };
    deny.props.onClick();
    expect(answers).toEqual([
      ["a", { outcome: "selected", optionId: "a-reject_once" }],
      ["b", { outcome: "selected", optionId: "b-reject_once" }],
    ]);
  });
});

describe("one waiting request", () => {
  test("names in full every file it acts on, whatever its input calls them", () => {
    const html = renderToStaticMarkup(
      <PermissionPrompt
        entry={{
          requestId: "a",
          request: {
            toolCall: {
              toolCallId: "call-a",
              title: "write_file",
              rawInput: { path: "settings.json", text: "{}" },
              locations: [
                { path: "/Users/dan/.vscode/settings.json" },
                { path: "/w/a.py", line: 3 },
              ],
            },
            options: [{ optionId: "ok", name: "Allow once", kind: "allow_once" }],
          },
        }}
      />,
    );
    expect(html).toContain("<code>/Users/dan/.vscode/settings.json</code>");
    expect(html).toContain("<code>/w/a.py:3</code>");
  });
});
