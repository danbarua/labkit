/** A Vega-Lite spec in a tool's result is drawn as a chart. */

import { describe, expect, test } from "bun:test";
import { FIXTURES } from "@labkit/acp-scenarios";
import { stateOfFixture } from "@labkit/view-model/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { Conversation } from "../conversation";
import { isVegaLite } from "../plot";

describe("a chart in a tool's result", () => {
  test("the media types Vega-Lite specs travel under", () => {
    expect(isVegaLite("application/vnd.vegalite.v5+json")).toBe(true);
    expect(isVegaLite("application/vnd.vegalite.v6+json")).toBe(true);
    expect(isVegaLite("application/json")).toBe(false);
    expect(isVegaLite(undefined)).toBe(false);
  });

  test("its row starts open, and the chart comes before the data that made it", async () => {
    const fixture = FIXTURES.find((f) => f.id === "tool-plot");
    if (fixture === undefined) throw new Error("no tool-plot fixture");
    const html = renderToStaticMarkup(<Conversation state={await stateOfFixture(fixture)} />);
    expect(html).toMatch(/<details class="lk-tool" data-status="completed" open="">/);
    // Drawn in the browser once the chart library loads; here, the place it is drawn into.
    expect(html).toContain('class="lk-plot" role="img" aria-label="Chart"');
    expect(html.indexOf('class="lk-plot"')).toBeLessThan(html.indexOf("<h4>Input</h4>"));
  });

  test("a resource of another type is still drawn as its text", async () => {
    const { ContentView } = await import("../tool");
    const html = renderToStaticMarkup(
      <ContentView
        block={{ type: "resource", resource: { uri: "x", mimeType: "text/plain", text: "hello" } }}
      />,
    );
    expect(html).toContain('<pre class="lk-pre">hello</pre>');
  });
});
