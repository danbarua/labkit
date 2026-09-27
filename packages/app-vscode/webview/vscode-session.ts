import type { SessionConfigOption } from "@agentclientprotocol/sdk";
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
}

declare function acquireVsCodeApi(): VsCodeApi;

/**
 * The webview's side of the bridge: posts outbound messages, and calls `onMessage` for each one
 * the extension host sends. Sends `ready` once, so a session already open before this script
 * loaded is not shown as if nothing had happened yet.
 */
export function vscodeSession(onMessage: (message: InboundMessage) => void) {
  const api = acquireVsCodeApi();
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
