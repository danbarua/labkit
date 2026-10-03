/** An agent's markdown, drawn sensibly while it is still arriving and highlighted once it settles. */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownText } from "../markdown";

const draw = (text: string, streaming = false) =>
  renderToStaticMarkup(<MarkdownText text={text} streaming={streaming} />);

describe("markdown while it streams", () => {
  test("emphasis and inline code left open by the last chunk are closed", () => {
    expect(draw("Some **bold", true)).toContain("<strong>bold</strong>");
    expect(draw("run `bun te", true)).toContain("<code>bun te</code>");
  });

  test("a link whose address has not finished arriving is its text, not a link", () => {
    const html = draw("see [the docs](https://exa", true);
    expect(html).toContain("<span>the docs</span>");
    expect(html).not.toContain("<a ");
  });

  test("settled text is drawn as it is", () => {
    expect(draw("Some **bold")).toContain("Some **bold");
  });
});

describe("code blocks in markdown", () => {
  const block = "```python\nimport json\n```";

  test("are highlighted once the text has settled", () => {
    expect(draw(block)).toContain('<span class="hljs-keyword">import</span> json');
  });

  test("are not highlighted while the text streams", () => {
    const html = draw(block, true);
    expect(html).toContain("import json");
    expect(html).not.toContain("hljs-keyword");
  });

  test("in a language the highlighter does not know are plain", () => {
    expect(draw("```labkit\nnow\n```")).toContain('<code class="language-labkit">now\n</code>');
  });
});
