import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import type { Theme } from "@labkit/ui";
import type { ViewEvent } from "@labkit/view-model";

/**
 * Messages the extension host sends this webview. `event` is a `ViewEvent`, fed straight into
 * the view model's reducer, unchanged from how the web app's HTTP client feeds it — the webview
 * does not know or care that a VS Code postMessage channel stands in for HTTP here. `reset`
 * starts a new session or switches to another one; `ready` replies to this webview's own
 * `{ kind: "ready" }` with the configuration options and commands a freshly opened session
 * already has, since they arrived before this script had loaded and would otherwise be lost.
 */
export type InboundMessage =
  | { readonly kind: "event"; readonly event: ViewEvent }
  | { readonly kind: "reset" }
  | { readonly kind: "ready"; readonly configOptions: readonly SessionConfigOption[] };

/** Messages this webview sends the extension host. */
export type OutboundMessage =
  | { readonly kind: "ready" }
  | { readonly kind: "prompt"; readonly text: string }
  | { readonly kind: "cancel" }
  | {
      readonly kind: "setConfigOption";
      readonly configId: string;
      readonly value: string | boolean;
    };

interface VsCodeApi {
  postMessage(message: OutboundMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// VS Code throws if a webview calls `acquireVsCodeApi()` more than once in its lifetime. A
// `reset` (a new session, or switching to another) remounts the React tree that calls
// `vscodeSession`, so the handle is acquired once here, at module scope, and reused.
const api = acquireVsCodeApi();

/**
 * The theme last picked in this view. VS Code keeps a webview's state while it is hidden and
 * shown again; what comes back is whatever was saved, so anything else reads as "system".
 */
export function savedTheme(): Theme {
  const saved = api.getState();
  const theme =
    typeof saved === "object" && saved !== null && "theme" in saved ? saved.theme : undefined;
  return theme === "light" || theme === "dark" ? theme : "system";
}

export function saveTheme(theme: Theme): void {
  api.setState({ theme });
}

/**
 * The webview's side of the bridge: posts outbound messages, and calls `onMessage` for each one
 * the extension host sends. Sends `ready` once, so a session already open before this script
 * loaded is not shown as if nothing had happened yet.
 */
export function vscodeSession(onMessage: (message: InboundMessage) => void) {
  const listener = (ev: MessageEvent<InboundMessage>) => onMessage(ev.data);
  window.addEventListener("message", listener);
  api.postMessage({ kind: "ready" });

  return {
    prompt: (text: string) => api.postMessage({ kind: "prompt", text }),
    cancel: () => api.postMessage({ kind: "cancel" }),
    setConfigOption: (configId: string, value: string | boolean) =>
      api.postMessage({ kind: "setConfigOption", configId, value }),
    dispose: () => window.removeEventListener("message", listener),
  };
}
