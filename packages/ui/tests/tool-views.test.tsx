/** A tool's result drawn by the view for that tool, falling back to its shape. */

import { describe, expect, test } from "bun:test";
import type { ToolCall } from "@agentclientprotocol/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolCard } from "../tool";

const done = (name: string, rawInput: unknown, output: unknown): ToolCall =>
  ({
    toolCallId: "t1",
    title: name,
    name,
    status: "completed",
    rawInput,
    rawOutput: JSON.stringify(output),
    content: [{ type: "content", content: { type: "text", text: JSON.stringify(output) } }],
  }) as ToolCall;

const draw = (call: ToolCall) => renderToStaticMarkup(<ToolCard call={call} />);

describe("views for particular tools", () => {
  test("read_file numbers its lines from the line it was asked to start at", () => {
    const html = draw(
      done(
        "read_file",
        { path: "DESIGN.md", line: 10 },
        { path: "/workspace/DESIGN.md", text: "a\nb\n" },
      ),
    );
    expect(html).toContain("DESIGN.md · lines 10–11");
    expect(html).toContain('<code data-line="10">a\n</code><code data-line="11">b\n</code>');
  });

  test("list_dir lists directories first", () => {
    const html = draw(
      done(
        "list_dir",
        { path: "." },
        {
          path: "/workspace",
          entries: [
            { name: "b.md", type: "file" },
            { name: "src", type: "directory" },
            { name: "a.md", type: "file" },
          ],
        },
      ),
    );
    expect(html).toContain(". · 3 entries");
    expect(html.indexOf("src")).toBeLessThan(html.indexOf("a.md"));
    expect(html.indexOf("a.md")).toBeLessThan(html.indexOf("b.md"));
  });

  test("write_file says what was written where", () => {
    const html = draw(
      done("write_file", { path: "x.txt" }, { path: "/workspace/x.txt", bytes: 598 }),
    );
    expect(html).toContain("Wrote 598 bytes to <code>x.txt</code>");
  });

  test("the raw output stays one click away under a view", () => {
    const html = draw(
      done("write_file", { path: "x.txt" }, { path: "/workspace/x.txt", bytes: 5 }),
    );
    expect(html).toContain("<summary>Raw output</summary>");
  });

  test("a result that is not the shape the view knows is drawn by its shape instead", () => {
    const html = draw(done("read_file", { path: "x" }, { surprise: true, other: 1 }));
    expect(html).not.toContain("lk-file");
    expect(html).toContain("<dt>surprise</dt>");
  });

  test("a failed call is never drawn by its tool's view", () => {
    const failed = {
      ...done("read_file", { path: "x" }, { error: "no such file" }),
      status: "failed",
    };
    expect(draw(failed as ToolCall)).not.toContain("lk-file");
  });
});
