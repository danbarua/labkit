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

describe("addresses in markdown", () => {
  const resolved = (text: string) => {
    const seen: [string, string][] = [];
    const html = renderToStaticMarkup(
      <MarkdownText
        text={text}
        resolveUrl={(url, kind) => {
          seen.push([url, kind]);
          return `/resolved/${kind}/${url}`;
        }}
      />,
    );
    return { html, seen };
  };

  test("an image's src goes through the resolver as a src", () => {
    const { html, seen } = resolved("![a pixel](../pixel.png)");
    expect(seen).toEqual([["../pixel.png", "src"]]);
    expect(html).toContain('src="/resolved/src/../pixel.png"');
  });

  test("a link's href goes through the resolver as an href", () => {
    const { html, seen } = resolved("[the plan](notes/plan.md)");
    expect(seen).toEqual([["notes/plan.md", "href"]]);
    expect(html).toContain('href="/resolved/href/notes/plan.md"');
  });

  test("a javascript: link is dropped before the resolver sees it", () => {
    const { html, seen } = resolved("[run](javascript:alert(1))");
    expect(seen).toEqual([]);
    expect(html).toContain("<span>run</span>");
  });

  test("an address the resolver returns with a scheme that is not allowed is dropped", () => {
    const html = renderToStaticMarkup(
      <MarkdownText text="[the plan](plan.md)" resolveUrl={() => "javascript:alert(1)"} />,
    );
    expect(html).toContain("<span>the plan</span>");
  });

  test("without a resolver, addresses are drawn as written", () => {
    expect(draw("![a pixel](../pixel.png) [the plan](plan.md)")).toContain('src="../pixel.png"');
    expect(draw("[the plan](plan.md)")).toContain('href="plan.md"');
  });
});
