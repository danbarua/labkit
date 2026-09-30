/** A tool's result drawn by the view for that tool, falling back to its shape. */

import { describe, expect, test } from "bun:test";
import type { ToolCall } from "@agentclientprotocol/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { languageOf, previewLength } from "../code";
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

const PY =
  'import json\n\nSEEDS = 25\n\n\ndef auc(scores):\n    """One number."""\n    return 1\n\nprint(auc([]))\nprint("done")\n';

const wrote = (before: unknown, oldText: string | null): ToolCall =>
  ({
    toolCallId: "t1",
    title: "write_file",
    name: "write_file",
    status: "completed",
    rawInput: { path: "score.py", text: PY },
    rawOutput: JSON.stringify({
      path: "/workspace/score.py",
      bytes: PY.length,
      before,
      newText: PY,
    }),
    content: [{ type: "diff", path: "/workspace/score.py", oldText, newText: PY }],
  }) as ToolCall;

describe("a file a tool wrote", () => {
  const created = draw(wrote({ kind: "absent", source: "filesystem" }, null));
  const changed = draw(
    wrote({ kind: "text", source: "filesystem", text: "import json\n" }, "import json\n"),
  );

  test("a new file is drawn as code in its language, not as a diff of added lines", () => {
    expect(created).toContain(
      '<figcaption class="lk-caption" title="/workspace/score.py">score.py · new file · 11 lines',
    );
    expect(created).toContain('data-language="py"');
    expect(created).toContain('<span class="hljs-keyword">import</span> json');
    expect(created).not.toContain("lk-diff");
    expect(created).not.toContain("+ import json");
  });

  test("it opens on its first five lines that are not blank, and offers the rest", () => {
    expect(previewLength(PY.split("\n"))).toBe(8);
    expect(created).toContain('style="max-height:calc(8 * 1lh)"');
    expect(created).toContain('aria-expanded="false"');
    expect(created).toContain("Show 3 more lines");
  });

  test("a file no longer than the opening has nothing more to offer", () => {
    expect(previewLength(["a", "", "b"])).toBe(3);
    const short = draw({
      ...wrote(null, null),
      content: [{ type: "diff", path: "/workspace/a.py", oldText: null, newText: "x = 1\n" }],
    } as ToolCall);
    expect(short).toContain(">/workspace/a.py · new file · 1 line");
    expect(short).not.toContain("max-height");
    expect(short).not.toContain("<button");
  });

  test("a file in a language it does not know is plain text", () => {
    expect(languageOf("notes.labkit")).toBeUndefined();
    expect(languageOf("Makefile")).toBeUndefined();
    expect(languageOf("/workspace/run.TOML")).toBe("toml");
    const plain = draw({
      ...wrote(null, null),
      content: [{ type: "diff", path: "/workspace/notes.labkit", oldText: null, newText: "if x" }],
    } as ToolCall);
    expect(plain).toContain("<code>if x</code>");
  });

  test("the text and the path are not repeated as the input or as the raw output", () => {
    for (const html of [created, changed]) {
      expect(html).not.toContain("<h4>Input</h4>");
      expect(html).not.toContain("Raw output");
      expect(html).not.toContain("Wrote ");
    }
  });

  test("an argument the result does not draw is still shown", () => {
    const html = draw({
      ...wrote(null, null),
      rawInput: { path: "score.py", text: PY, mode: "0644" },
    } as ToolCall);
    expect(html).toContain("<h4>Input</h4>");
    expect(html).toContain("0644");
  });

  test("a decorator is drawn as code, not as a comment", () => {
    const decorated = draw({
      ...wrote(null, null),
      content: [
        {
          type: "diff",
          path: "/workspace/app.py",
          oldText: null,
          newText: "@app.route('/')\ndef index():\n    # home\n    pass\n",
        },
      ],
    } as ToolCall);
    expect(decorated).toContain('<span class="hljs-meta">@app.route(');
    expect(decorated).toContain('<span class="hljs-comment"># home</span>');
  });

  test("a changed file is still a diff, under the path the call named", () => {
    expect(changed).toContain(
      '<div class="lk-diff-path" title="/workspace/score.py">score.py</div>',
    );
    expect(changed).toContain("lk-diff-line add");
    expect(changed).toContain("+ SEEDS = 25");
    expect(changed).not.toContain("lk-code");
  });
});
