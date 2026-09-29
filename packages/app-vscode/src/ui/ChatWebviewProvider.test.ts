/** The webview bridge: ACP session updates become the view model's ViewEvents, and back. */

import { expect, mock, test } from "bun:test";

import { vscodeFake } from "../testing/vscode-fake.ts";

mock.module("vscode", () => vscodeFake);

const { ChatWebviewProvider } = await import("./ChatWebviewProvider.ts");

function fixture(overrides: Record<string, unknown> = {}) {
  const posted: unknown[] = [];
  const sessionManager = {
    getActiveSessionId: () => "s1",
    getSession: () => ({ configOptions: [{ id: "model", type: "select" }] }),
    getActiveAgentName: () => "agent",
    sendPrompt: async () => ({ stopReason: "end_turn" }),
    cancelTurn: async () => {},
    setConfigOption: async () => {},
    recordFirstPrompt: () => {},
    touchHistory: () => {},
    applyUsageUpdate: () => {},
    applyAvailableCommands: () => {},
    applyConfigOptions: () => {},
    applySessionInfoUpdate: () => {},
    ...overrides,
  };
  let sessionUpdateListener: ((update: unknown) => void) | undefined;
  const sessionUpdateHandler = {
    addListener: (l: (update: unknown) => void) => {
      sessionUpdateListener = l;
    },
    removeListener: () => {},
    getToolCall: () => undefined,
  };
  const provider = new (
    ChatWebviewProvider as unknown as new (
      extensionUri: unknown,
      sessionManager: unknown,
      sessionUpdateHandler: unknown,
    ) => InstanceType<typeof ChatWebviewProvider>
  )({ fsPath: "/ext" }, sessionManager, sessionUpdateHandler);
  let fromWebview: ((message: unknown) => Promise<void> | void) | undefined;
  const view = {
    webview: {
      postMessage: (message: unknown) => {
        posted.push(message);
      },
      options: {},
      html: "",
      asWebviewUri: (uri: unknown) => uri,
      cspSource: "vscode-webview:",
      onDidReceiveMessage: (l: (message: unknown) => Promise<void> | void) => {
        fromWebview = l;
      },
    },
    onDidDispose: () => {},
  };
  provider.resolveWebviewView(view as never, {} as never, {} as never);
  return {
    provider,
    posted,
    emitSessionUpdate: (update: unknown, sessionId = "s1") =>
      sessionUpdateListener?.({ sessionId, update }),
    fromWebview: async (message: unknown) => {
      await fromWebview?.(message);
    },
  };
}

test("a session update for the active session is forwarded as an update event, unchanged", () => {
  const f = fixture();
  const update = { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } };
  f.emitSessionUpdate(update);
  expect(f.posted).toContainEqual({ kind: "event", event: { type: "update", update } });
});

test("a session update for a session other than the active one is dropped", () => {
  const f = fixture();
  f.emitSessionUpdate(
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "x" } },
    "some-other-session",
  );
  expect(f.posted).toEqual([]);
});

test("ready answers with the active session's configuration options", async () => {
  const f = fixture();
  await f.fromWebview({ kind: "ready" });
  expect(f.posted).toContainEqual({
    kind: "ready",
    configOptions: [{ id: "model", type: "select" }],
  });
});

test("a prompt is a prompt_started event, the call, then a prompt_ended event with its stop reason", async () => {
  const f = fixture();
  await f.fromWebview({ kind: "prompt", text: "hello" });
  expect(f.posted).toContainEqual({
    kind: "event",
    event: { type: "prompt_started", content: [{ type: "text", text: "hello" }] },
  });
  expect(f.posted).toContainEqual({
    kind: "event",
    event: { type: "prompt_ended", stopReason: "end_turn" },
  });
});

test("a prompt with no active session fails without calling the agent", async () => {
  const f = fixture({ getActiveSessionId: () => null });
  await f.fromWebview({ kind: "prompt", text: "hello" });
  expect(f.posted).toContainEqual({
    kind: "event",
    event: { type: "failed", message: "No active session. Create a session first." },
  });
});

test("a rejected prompt is a failed event, naming the agent's own message", async () => {
  const f = fixture({
    sendPrompt: async () => {
      throw new Error("agent unreachable");
    },
  });
  await f.fromWebview({ kind: "prompt", text: "hello" });
  expect(f.posted).toContainEqual({
    kind: "event",
    event: { type: "failed", message: "agent unreachable" },
  });
});

test("cancel asks the session manager to cancel the active session's turn", async () => {
  let cancelled: string | undefined;
  const f = fixture({
    cancelTurn: async (sessionId: string) => {
      cancelled = sessionId;
    },
  });
  await f.fromWebview({ kind: "cancel" });
  expect(cancelled).toBe("s1");
});

test("setConfigOption is a plain call through: the applied result arrives back as its own update", async () => {
  const calls: [string, string, unknown][] = [];
  const f = fixture({
    setConfigOption: async (sessionId: string, configId: string, value: unknown) => {
      calls.push([sessionId, configId, value]);
    },
  });
  await f.fromWebview({ kind: "setConfigOption", configId: "thinking", value: true });
  expect(calls).toEqual([["s1", "thinking", true]]);
});

test("active-session-changed resets the webview and re-sends the new session's configuration", () => {
  const f = fixture();
  f.provider.notifyActiveSessionChanged();
  expect(f.posted).toContainEqual({ kind: "reset" });
  expect(f.posted).toContainEqual({
    kind: "ready",
    configOptions: [{ id: "model", type: "select" }],
  });
});

test("clearChat resets the webview and drops hasChatContent", async () => {
  const f = fixture();
  await f.fromWebview({ kind: "prompt", text: "hi" });
  expect(f.provider.hasChatContent).toBe(true);
  f.provider.clearChat();
  expect(f.provider.hasChatContent).toBe(false);
  expect(f.posted).toContainEqual({ kind: "reset" });
});
