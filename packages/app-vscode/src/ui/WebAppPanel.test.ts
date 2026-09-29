/** The web app tab's page: a frame on the configured URL, allowed by its policy and nothing more. */

import { expect, mock, test } from "bun:test";

mock.module("vscode", () => ({
  window: { createOutputChannel: () => ({ appendLine() {}, dispose() {} }) },
  workspace: { getConfiguration: () => ({ get: (_name: string, fallback: unknown) => fallback }) },
}));

const { webAppHtml } = await import("./WebAppPanel.ts");

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
