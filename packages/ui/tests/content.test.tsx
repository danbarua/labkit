/**
 * The content views both apps share: a file as code, JSON, a diff read from a patch, and the card
 * they sit in. Drawn as static markup.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentCard } from "../content/card";
import { CodeView, JsonView } from "../content/code";
import { DiffView } from "../content/diff";
import { rowsOfPatch } from "../content/diff-rows";

describe("JSON as code", () => {
  test("keys, strings and numbers are coloured, and the text stays text", () => {
    const out = renderToStaticMarkup(<JsonView value={{ "<k>": "<s>", n: 2 }} />);
    expect(out).toContain('<span class="hljs-attr">&quot;&lt;k&gt;&quot;</span>');
    expect(out).toContain('<span class="hljs-string">&quot;&lt;s&gt;&quot;</span>');
    expect(out).toContain('<span class="hljs-number">2</span>');
    expect(out).not.toContain("lk-caption");
  });
});

describe("a file as code", () => {
  const fifty = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join("\n");

  test("shows its first `preview` lines, and offers the rest", () => {
    const out = renderToStaticMarkup(<CodeView path="notes.txt" text={fifty} preview={40} />);
    expect(out).toContain("Show 10 more lines");
    expect(out).toContain("max-height:calc(40 * 1lh)");
  });

  test("a named language wins over the path's extension; an unknown one is plain text", () => {
    const json = renderToStaticMarkup(<CodeView path="data.txt" text='{"a": 1}' language="json" />);
    expect(json).toContain('data-language="json"');
    const plain = renderToStaticMarkup(
      <CodeView path="x.ts" text="const a = 1;" language="nope" />,
    );
    expect(plain).not.toContain("data-language");
    expect(plain).not.toContain("hljs-");
  });
});

describe("a diff read from a patch", () => {
  test("draws the hunk's header, its marked lines, and its notes", () => {
    const rows = rowsOfPatch("@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file\n");
    const out = renderToStaticMarkup(<DiffView path="x.txt" rows={rows} />);
    expect(out).toContain('<code class="lk-diff-hunk">@@ -1 +1 @@</code>');
    expect(out).toContain('<code class="lk-diff-line remove">- a</code>');
    expect(out).toContain('<code class="lk-diff-line add">+ b</code>');
    expect(out).toContain('<div class="lk-diff-note">\\ No newline at end of file</div>');
  });
});

describe("a long diff", () => {
  test("shows its first `preview` rows, and offers the rest", () => {
    const patch = `@@ -0,0 +1,50 @@\n${Array.from({ length: 50 }, (_, i) => `+${i}`).join("\n")}\n`;
    const out = renderToStaticMarkup(
      <DiffView path="x.txt" rows={rowsOfPatch(patch)} caption={false} preview={40} />,
    );
    expect(out.match(/lk-diff-line add/g)).toHaveLength(39);
    expect(out).toContain("Show 11 more lines");
    expect(out).not.toContain("lk-diff-path");
  });
});

describe("a card for content of any length", () => {
  test("open, it shows its body under a header that folds it", () => {
    const out = renderToStaticMarkup(
      <ContentCard title="Content" meta="3 lines">
        <p>body</p>
      </ContentCard>,
    );
    expect(out).toContain('aria-expanded="true"');
    expect(out).toContain('<span class="lk-card-meta">3 lines</span>');
    expect(out).toContain("<p>body</p>");
  });

  test("folded, it shows only its header and its footer", () => {
    const out = renderToStaticMarkup(
      <ContentCard title="Graph" open={false} onToggle={() => {}} footer={<div>foot</div>}>
        <p>body</p>
      </ContentCard>,
    );
    expect(out).toContain('aria-expanded="false"');
    expect(out).not.toContain("<p>body</p>");
    expect(out).toContain("<div>foot</div>");
  });

  test("folded with `keep`, its body stays, hidden, and the toggle carries its label", () => {
    const out = renderToStaticMarkup(
      <ContentCard
        title="Graph"
        open={false}
        onToggle={() => {}}
        keep
        toggleLabel="Show or hide the graph"
      >
        <canvas />
      </ContentCard>,
    );
    expect(out).toContain('<div class="lk-card-body" hidden=""><canvas></canvas></div>');
    expect(out).toContain('aria-label="Show or hide the graph"');
  });
});
