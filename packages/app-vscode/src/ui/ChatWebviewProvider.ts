import { isAbsolute } from "node:path";

import type { SessionConfigOption, SessionNotification } from "@agentclientprotocol/sdk";
import { promptEnded, type ViewEvent } from "@labkit/view-model";
import * as vscode from "vscode";

import type { SessionManager } from "../core/SessionManager";
import type { SessionUpdateHandler, SessionUpdateListener } from "../handlers/SessionUpdateHandler";
import { sendEvent } from "../utils/Diagnostics";
import { logDiagnostic, logError } from "../utils/Logger";

/** What this webview sends the extension host; the mirror of `webview/vscode-session.ts`'s type. */
type FromWebview =
  | { readonly kind: "ready" }
  | { readonly kind: "prompt"; readonly text: string }
  | { readonly kind: "cancel" }
  | {
      readonly kind: "setConfigOption";
      readonly configId: string;
      readonly value: string | boolean;
    };

/**
 * WebviewViewProvider for the ACP chat sidebar.
 *
 * Renders `packages/app-vscode/dist/webview` — the same `@labkit/ui` `Conversation` component the
 * web app uses, built as its own browser bundle (`bun run build:webview`). This class is the
 * transport: it turns ACP session updates into the `ViewEvent`s that component's view model
 * expects (matching `@labkit/acp-client`'s HTTP client exactly, so the component needs nothing
 * webview-specific) and turns the webview's `prompt`/`cancel`/`setConfigOption` messages into
 * `SessionManager` calls. Tool permission decisions stay native (`PermissionHandler`'s
 * `QuickPick`), not shown here.
 */
export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "acp-chat";

  private view?: vscode.WebviewView;
  private updateListener: SessionUpdateListener;
  private _hasChatContent = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessionManager: SessionManager,
    private readonly sessionUpdateHandler: SessionUpdateHandler,
    private readonly editor: typeof vscode = vscode,
  ) {
    this.updateListener = (update: SessionNotification) => {
      this.handleSessionUpdate(update);
    };
    this.sessionUpdateHandler.addListener(this.updateListener);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message: FromWebview) => {
      switch (message.kind) {
        case "ready":
          this.sendReady();
          break;
        case "prompt":
          this._hasChatContent = true;
          await this.handleSendPrompt(message.text);
          break;
        case "cancel":
          await this.handleCancelTurn();
          break;
        case "setConfigOption":
          await this.handleSetConfigOption(message.configId, message.value);
          break;
      }
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  /** Forward a session update to the webview, unchanged, as the `ViewEvent` it already is. */
  private handleSessionUpdate(update: SessionNotification): void {
    const updateData = update.update;
    if (updateData.sessionUpdate === "usage_update")
      this.sessionManager.applyUsageUpdate(update.sessionId, updateData);

    // Persist session state BEFORE the active-session check. During session
    // creation the agent can dispatch notifications (e.g.
    // `available_commands_update`) before connectToAgent finishes setting
    // `activeSessionId`. Without this, those updates would be dropped and
    // the slash-command popup would never have commands to show.
    if (updateData.sessionUpdate === "available_commands_update") {
      this.sessionManager.applyAvailableCommands(
        update.sessionId,
        updateData.availableCommands || [],
      );
    }
    if (updateData.sessionUpdate === "config_option_update") {
      this.sessionManager.applyConfigOptions(update.sessionId, updateData.configOptions || []);
    }
    if (updateData.sessionUpdate === "session_info_update") {
      this.sessionManager.applySessionInfoUpdate(update.sessionId, {
        title: updateData.title,
        updatedAt: (updateData as { updatedAt?: string }).updatedAt,
      });
    }

    // Only forward to the webview if this is the active session — the
    // webview only ever shows one session at a time.
    if (update.sessionId !== this.sessionManager.getActiveSessionId()) return;

    this.postEvent({ type: "update", update: update.update });
  }

  private async handleSendPrompt(text: string): Promise<void> {
    const activeId = this.sessionManager.getActiveSessionId();
    if (!activeId) {
      this.postEvent({ type: "failed", message: "No active session. Create a session first." });
      return;
    }

    sendEvent(
      "chat/messageSent",
      { agentName: this.sessionManager.getActiveAgentName() ?? "" },
      { messageLength: text.length },
    );
    this.sessionManager.recordFirstPrompt(activeId, text);
    this.postEvent({ type: "prompt_started", content: [{ type: "text", text }] });

    try {
      const response = await this.sessionManager.sendPrompt(activeId, text);
      this.postEvent(promptEnded(response));
      this.sessionManager.touchHistory(activeId);
    } catch (e) {
      logError("Prompt failed", e);
      const message = e instanceof Error ? e.message : "Prompt failed";
      this.postEvent({ type: "failed", message });
    }
  }

  private async handleCancelTurn(): Promise<void> {
    const activeId = this.sessionManager.getActiveSessionId();
    if (activeId) {
      try {
        await this.sessionManager.cancelTurn(activeId);
      } catch (e) {
        logError("Cancel failed", e);
      }
    }
  }

  /**
   * A generic config-option change from the webview's config bar (ACP "Session Config
   * Options" — covers model, mode, thinking and any agent-defined option alike). ACP has the
   * agent answer with the full configOptions state; `SessionManager` stores that answer, and
   * nothing is posted here on success. The webview changes only when the agent also sends a
   * `config_option_update`, which arrives through `handleSessionUpdate`. ACP does not require
   * that notification for a change the client made.
   */
  private async handleSetConfigOption(configId: string, value: string | boolean): Promise<void> {
    const activeId = this.sessionManager.getActiveSessionId();
    if (!activeId || !configId) return;
    try {
      await this.sessionManager.setConfigOption(activeId, configId, value);
    } catch (e) {
      logError("Failed to set config option", e);
      const message = e instanceof Error ? e.message : String(e);
      this.postEvent({ type: "failed", message: `Failed to set ${configId}: ${message}` });
    }
  }

  /** Answers the webview's own `ready` message with whatever configuration its session already has. */
  private sendReady(): void {
    const activeId = this.sessionManager.getActiveSessionId();
    const session = activeId ? this.sessionManager.getSession(activeId) : null;
    this.postMessage({
      kind: "ready",
      configOptions: (session?.configOptions ?? []) as readonly SessionConfigOption[],
    });
  }

  /** Notify the webview of a newly active or switched session: start its transcript over. */
  notifyActiveSessionChanged(): void {
    this.postMessage({ kind: "reset" });
    this.sendReady();
  }

  /**
   * Mode and model choices already arrive as `config_option_update` through
   * {@link handleSessionUpdate} — a mode or model change is a `setConfigOption` call against an
   * option whose category is `"mode"` or `"model"`. These two exist only so callers that still
   * react to the legacy `mode-changed`/`model-changed` events need no change.
   */
  notifyModesUpdate(_modes: unknown): void {}
  notifyModelsUpdate(_models: unknown): void {}

  /** Open a tool call's reported location in the editor. */
  async openToolLocation(toolCallId: string, index: number): Promise<void> {
    const sessionId = this.sessionManager.getActiveSessionId();
    const tool = sessionId
      ? this.sessionUpdateHandler.getToolCall(sessionId, toolCallId)
      : undefined;
    const location = Number.isInteger(index) && index >= 0 ? tool?.locations?.[index] : undefined;
    if (!location || !isAbsolute(location.path)) {
      logDiagnostic("warning", "vscode.tool.location_rejected", {
        sessionId,
        toolCallId,
        index,
        message:
          "The requested location is not an absolute path in this session's reported tool locations",
      });
      return;
    }
    try {
      const document = await this.editor.workspace.openTextDocument(
        this.editor.Uri.file(location.path),
      );
      const line = Math.min(Math.max(0, (location.line ?? 1) - 1), document.lineCount - 1);
      await this.editor.window.showTextDocument(document, {
        preview: true,
        selection: new this.editor.Range(line, 0, line, 0),
      });
      logDiagnostic("info", "vscode.tool.location_opened", {
        sessionId,
        toolCallId,
        path: location.path,
        line: location.line,
      });
    } catch (error) {
      logError(
        `Cannot open tool location ${location.path} for ${toolCallId} in session ${sessionId}`,
        error,
      );
    }
  }

  private postEvent(event: ViewEvent): void {
    this.postMessage({ kind: "event", event });
  }

  private postMessage(message: unknown): void {
    this.view?.webview.postMessage(message);
  }

  /** Whether the chat has any messages. */
  get hasChatContent(): boolean {
    return this._hasChatContent;
  }

  /**
   * Notify webview that a `session/load` replay is starting or has finished. The replayed history
   * arrives as ordinary session updates through {@link handleSessionUpdate}, after the transcript
   * was started over for the session (`notifyActiveSessionChanged`), and before the load's answer.
   * A load that succeeded sends the configuration options its answer carried, and does not start
   * the transcript over, which would discard the history just replayed.
   */
  notifyLoadSessionStart(): void {
    this.postMessage({ kind: "loadStart" });
  }

  notifyLoadSessionEnd(ok: boolean): void {
    this.postMessage({ kind: "loadEnd", ok });
    if (ok) this.sendReady();
  }

  notifySessionInfoUpdate(_title: string | undefined | null): void {
    // The title lives in the tree view and the editor tab; the transcript itself does not
    // repeat it.
  }

  /** Clear the chat history and reset to welcome state. Called when starting a new conversation. */
  clearChat(): void {
    this._hasChatContent = false;
    this.postMessage({ kind: "reset" });
  }

  /** Attach a file URI. Not yet wired into the webview's composer; the command still runs. */
  attachFile(_uri: vscode.Uri): void {
    this.view?.show?.(true);
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const nonce = getNonce();
    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(root, "main.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(root, "main.css"));

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>ACP Chat</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.sessionUpdateHandler.removeListener(this.updateListener);
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
