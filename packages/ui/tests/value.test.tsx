/**
 * A tool's input and result drawn by shape, on the shapes real sessions produce: a result
 * serialised as a JSON string, reported twice (as a text block and as raw output).
 */

import { describe, expect, test } from "bun:test";
import type { ToolCall } from "@agentclientprotocol/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolCard } from "../tool";
import { decode, inlineArguments, sameValue } from "../value";

/** A settled call whose result arrives as one serialised text block and again as raw output. */
function settled(name: string, rawInput: unknown, result: unknown): ToolCall {
  const text = JSON.stringify(result);
  return {
    toolCallId: "t1",
    title: name,
    name,
    status: "completed",
    rawInput,
    content: [{ type: "content", content: { type: "text", text } }],
    rawOutput: text,
  } as ToolCall;
}

const draw = (call: ToolCall) => renderToStaticMarkup(<ToolCard call={call} />);

describe("decoding", () => {
  test("a string holding a JSON object or array is what it encodes", () => {
    expect(decode('{"a":1}')).toEqual({ a: 1 });
    expect(decode(" [1,2] ")).toEqual([1, 2]);
  });

  test("any other string stays a string, including malformed JSON", () => {
    expect(decode("plain")).toBe("plain");
    expect(decode("42")).toBe("42");
    expect(decode("{not json")).toBe("{not json");
  });

  test("a serialised value and the value it encodes are the same", () => {
    expect(sameValue('{"a":1}', { a: 1 })).toBe(true);
    expect(sameValue('{"a":1}', '{"a":2}')).toBe(false);
  });
});

describe("a tool's input", () => {
  test("one short field is its value alone", () => {
    expect(inlineArguments({ path: "." })).toEqual([[undefined, "."]]);
  });

  test("a few short fields keep their names", () => {
    expect(inlineArguments({ path: "package.json", line: 1, limit: 10 })).toEqual([
      ["path", "package.json"],
      ["line", 1],
      ["limit", 10],
    ]);
  });

  test("a long or nested field is not squeezed onto one line", () => {
    expect(inlineArguments({ path: "a", text: "one\ntwo" })).toBeUndefined();
    expect(inlineArguments({ entries: [{ content: "x" }] })).toBeUndefined();
  });
});

describe("a tool card", () => {
  test("a serialised result is drawn once, as fields, never as an escaped string", () => {
    const html = draw(
      settled(
        "list_dir",
        { path: "." },
        {
          path: "/workspace",
          entries: [
            { name: "README.md", type: "file" },
            { name: "instruments", type: "directory" },
          ],
        },
      ),
    );
    expect(html).not.toContain("\\&quot;");
    expect(html).not.toContain("<summary>Raw output</summary>");
    expect(html).toContain("<dt>path</dt>");
    expect(html).toContain("<th>name</th><th>type</th>");
    expect(html).toContain("<td>instruments</td><td>directory</td>");
    expect(html).toContain(
      '<div class="lk-args"><span><code class="lk-args-value">.</code></span></div>',
    );
  });

  test("a refusal shows its reason as text", () => {
    const html = draw(
      settled("list_dir", { path: "." }, { refused: true, reason: "The user refused permission." }),
    );
    expect(html).toContain('<span class="lk-text">The user refused permission.</span>');
  });

  test("a file's text inside a result stays text, even when it is JSON", () => {
    const html = draw(
      settled(
        "read_file",
        { path: "package.json" },
        { path: "/w/package.json", text: '{\n  "a": 1\n}\n' },
      ),
    );
    expect(html).toContain('<pre class="lk-pre">{\n  &quot;a&quot;: 1\n}\n</pre>');
  });

  test("a call is one closed row that names what it ran on", () => {
    const html = draw(settled("list_dir", { path: "instruments" }, { entries: [] }));
    expect(html).toMatch(/^<details class="lk-tool" data-status="completed">/);
    expect(html).toContain('<span class="lk-tool-preview">instruments</span>');
    // The title and the name are the same here, so the name is not said twice.
    expect(html).not.toContain("lk-tool-name");
  });

  test("a long input's row previews its first line", () => {
    const html = draw(settled("write_file", { path: "a.txt", text: "one\ntwo" }, "ok"));
    expect(html).toContain('<span class="lk-tool-preview">a.txt</span>');
  });

  test("a large input is drawn by shape: a list of steps is a table", () => {
    const entries = [
      { content: "Read the file", priority: "high", status: "completed" },
      { content: "Write the file", priority: "medium", status: "pending" },
    ];
    const html = draw(settled("update_plan", { entries }, { entries }));
    expect(html).toContain("<h4>Input</h4>");
    expect(html).toContain("<th>content</th><th>priority</th><th>status</th>");
    expect(html).not.toContain("<summary>Raw output</summary>");
  });

  test("raw output that adds to what is shown is still offered", () => {
    const call = {
      ...settled("labkit_why", { handle: "CLM_3" }, "unused"),
      content: [{ type: "content", content: { type: "text", text: "CLM_3 rests on EV_4." } }],
      rawOutput: { supports: ["EV_4"] },
    } as ToolCall;
    expect(draw(call)).toContain("<summary>Raw output</summary>");
  });
});
