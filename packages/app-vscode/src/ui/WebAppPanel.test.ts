/** The web app tab: a frame on the app's URL, allowed by its policy and nothing more. */

import { afterEach, expect, mock, spyOn, test } from "bun:test";

import { vscodeFake } from "../testing/vscode-fake.ts";

mock.module("vscode", () => vscodeFake);

const { WebAppPanel, webAppHtml } = await import("./WebAppPanel.ts");

const CONFIGURED = "http://127.0.0.1:8850/app/";
const FORWARDED = "http://localhost:61234/app/";

const spies: { mockRestore(): void }[] = [];
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
});

/** A remote window: the client reaches the configured address through a forwarded port. */
function forwarded() {
  spies.push(
    spyOn(vscodeFake.env, "asExternalUri").mockImplementation(async () =>
      vscodeFake.Uri.parse(FORWARDED),
    ),
  );
}

function fetchAnswers(answer: () => Promise<Response>) {
  const fetched = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(answer, { preconnect: globalThis.fetch.preconnect }),
  );
  spies.push(fetched);
  return fetched;
}

test("the page frames the app's URL and its policy allows only that origin", () => {
  const html = webAppHtml("http://127.0.0.1:8850/app/gallery");
  expect(html).toContain('<iframe src="http://127.0.0.1:8850/app/gallery"');
  expect(html).toContain("frame-src http://127.0.0.1:8850;");
  expect(html).toContain("default-src 'none'");
  expect(html).not.toContain("<script");
});

test("a URL with a quote in it stays inside its attribute", () => {
  const html = webAppHtml('http://127.0.0.1:8850/app/?q="><b>x</b>');
  expect(html).toContain("&quot;");
  expect(html).not.toContain('"><b>');
});

test("in a remote window the check asks the configured address and the tab frames the forwarded one", async () => {
  forwarded();
  const fetched = fetchAnswers(async () => new Response(null));
  let dispose = () => {};
  const panel = {
    webview: { html: "" },
    reveal() {},
    onDidDispose(listener: () => void) {
      dispose = listener;
    },
  };
  spies.push(spyOn(vscodeFake.window, "createWebviewPanel").mockImplementation(() => panel));

  await WebAppPanel.show();
  dispose();

  expect(fetched.mock.calls.map(([input]) => String(input))).toEqual([CONFIGURED]);
  expect(panel.webview.html).toContain(`<iframe src="${FORWARDED}"`);
});

test("when nothing answers, the error names the configured address and no tab opens", async () => {
  forwarded();
  fetchAnswers(async () => {
    throw new Error("connect ECONNREFUSED");
  });
  const opened = spyOn(vscodeFake.window, "createWebviewPanel");
  const shown = spyOn(vscodeFake.window, "showErrorMessage");
  spies.push(opened, shown);

  await WebAppPanel.show();

  expect(shown.mock.calls[0]?.[0]).toContain(
    `not answering at ${CONFIGURED} (connect ECONNREFUSED)`,
  );
  expect(opened).not.toHaveBeenCalled();
});
