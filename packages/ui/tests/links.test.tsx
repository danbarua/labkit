/** Links the agent sends, drawn once the page's host says where to fetch them. */

import { describe, expect, test } from "bun:test";
import type { ContentBlock } from "@agentclientprotocol/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { LinksContext, type ResolveLink } from "../links";
import { ContentView } from "../tool";

const draw = (block: ContentBlock, resolve?: ResolveLink) =>
  renderToStaticMarkup(
    <LinksContext.Provider value={resolve}>
      <ContentView block={block} />
    </LinksContext.Provider>,
  );

const blobs: ResolveLink = (uri) =>
  uri.startsWith("blob://") ? `/acp/blobs/${uri.slice("blob://".length)}` : undefined;

const link = (uri: string, mimeType?: string): ContentBlock => ({
  type: "resource_link",
  uri,
  name: "plot.png",
  ...(mimeType ? { mimeType } : {}),
  size: 3_481,
});

describe("a link the agent sent", () => {
  test("without a host that resolves it, it is text", () => {
    const html = draw(link("blob://ab12.png", "image/png"));
    expect(html).toContain("plot.png blob://ab12.png");
    expect(html).not.toContain("<a ");
  });

  test("resolved, an image is shown and every link can be opened or saved", () => {
    const image = draw(link("blob://ab12.png", "image/png"), blobs);
    expect(image).toContain('<img class="lk-img" alt="plot.png" src="/acp/blobs/ab12.png"/>');
    expect(image).toContain('href="/acp/blobs/ab12.png"');
    expect(image).toContain("3.4 KB");
    const file = draw(link("blob://cd34.parquet"), blobs);
    expect(file).not.toContain("<img");
    expect(file).toContain('download="plot.png"');
  });

  test("an HTTP(S) link needs no host", () => {
    expect(draw(link("https://example.org/plot.png"))).toContain(
      'href="https://example.org/plot.png"',
    );
  });

  test("a host answer that is not an HTTP(S) address is not followed", () => {
    expect(draw(link("blob://ab12.png"), () => "javascript:alert(1)")).not.toContain("<a ");
  });

  test("an image sent as a link only is drawn from the resolved link", () => {
    const html = draw(
      { type: "image", data: "", mimeType: "image/png", uri: "blob://ab12.png" },
      blobs,
    );
    expect(html).toContain('src="/acp/blobs/ab12.png"');
  });
});
