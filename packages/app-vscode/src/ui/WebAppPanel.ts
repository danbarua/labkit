import * as vscode from "vscode";

import { log, logError } from "../utils/Logger";

/**
 * The LabKit web app in an editor tab: a webview whose only content is a frame on the app's URL
 * (`labkit.webAppUrl`, the dev server by default), so the app runs as it does in a browser, hot
 * reload included. One tab at a time; running the command again brings it forward.
 */
export class WebAppPanel {
  static readonly viewType = "labkit.webApp";
  private static current: WebAppPanel | undefined;

  static async show(): Promise<void> {
    const configured = vscode.workspace
      .getConfiguration("labkit")
      .get<string>("webAppUrl", "http://127.0.0.1:8850/app/");
    // Resolves a local address to one this window can reach, for remote and forwarded setups.
    const url = (await vscode.env.asExternalUri(vscode.Uri.parse(configured))).toString(true);
    const reachable = await answers(url);
    if (!reachable.ok) {
      logError(`LabKit web app not reachable at ${url}`, reachable.error);
      void vscode.window.showErrorMessage(
        `The LabKit web app is not answering at ${url} (${reachable.error}). Start it with \`bun run --cwd packages/app-web dev\` (or \`dev:with-agent\` for the real agent), or set labkit.webAppUrl to where it runs.`,
      );
      return;
    }
    if (WebAppPanel.current) {
      WebAppPanel.current.panel.reveal();
      WebAppPanel.current.load(url);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      WebAppPanel.viewType,
      "LabKit",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    WebAppPanel.current = new WebAppPanel(panel);
    WebAppPanel.current.load(url);
    log(`LabKit web app opened at ${url}`);
  }

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.onDidDispose(() => {
      WebAppPanel.current = undefined;
    });
  }

  private load(url: string): void {
    this.panel.webview.html = webAppHtml(url);
  }
}

/** Whether anything answers at `url`, and if not, why. */
async function answers(url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The tab's page: a frame filling it, on `url`. Its policy allows framing that origin and nothing
 * else; the page itself runs no script.
 */
export function webAppHtml(url: string): string {
  const origin = new URL(url).origin;
  const attr = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${attr(origin)}; style-src 'unsafe-inline';">
<style>html, body, iframe { margin: 0; padding: 0; border: 0; width: 100%; height: 100%; overflow: hidden; }</style>
</head>
<body>
<iframe src="${attr(url)}" title="LabKit" allow="clipboard-read; clipboard-write"></iframe>
</body>
</html>`;
}
