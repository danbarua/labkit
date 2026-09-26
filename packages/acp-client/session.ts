/**
 * One ACP session, as a browser holds it: a client over Streamable HTTP whose traffic comes out
 * as the events the view model reduces. It uses `fetch` and nothing else from the platform, so it
 * runs in a page, a webview or a test, and a different agent behind the same URL changes nothing.
 */

import * as acp from "@agentclientprotocol/sdk";
import { createHttpStream } from "@agentclientprotocol/sdk/experimental/http-client";
import type { PermissionRequest, ViewEvent } from "@labkit/view-model";

export interface ConnectOptions {
  /** The agent's ACP endpoint. */
  readonly url: string;
  /** Called for everything that should change the view, in the order it happened. */
  readonly onEvent: (event: ViewEvent) => void;
  /** Reopen this session instead of starting one. The agent replays it through `onEvent`. */
  readonly sessionId?: string;
  /** The directory the session is about. */
  readonly cwd?: string;
  /** Replaces the platform `fetch`, to reach a server in the same process. */
  readonly fetch?: typeof fetch;
}

export interface SessionClient {
  readonly sessionId: string;
  /** Sends a prompt. Resolves when the turn has ended; what happened arrives through `onEvent`. */
  prompt(text: string): Promise<void>;
  /** Asks the agent to stop the turn. The prompt then resolves as `cancelled`. */
  cancel(): Promise<void>;
  /** Answers a permission request the agent is waiting on. */
  answerPermission(requestId: string, outcome: acp.RequestPermissionOutcome): void;
  close(): Promise<void>;
}

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export async function connectSession(options: ConnectOptions): Promise<SessionClient> {
  const { onEvent } = options;
  const cwd = options.cwd ?? "/";
  const stream = createHttpStream(options.url, options.fetch ? { fetch: options.fetch } : {});

  /** Requests the agent is waiting on, by the id the view knows them by. */
  const open = new Map<string, (response: acp.RequestPermissionResponse) => void>();
  let requests = 0;
  let sessionId: string | undefined = options.sessionId;

  const answer = (requestId: string, outcome: acp.RequestPermissionOutcome): void => {
    const respond = open.get(requestId);
    if (respond === undefined) return;
    open.delete(requestId);
    onEvent({ type: "permission_answered", requestId, outcome });
    respond({ outcome });
  };

  const connection = acp
    .client({ name: "labkit-view" })
    .onRequest(
      acp.methods.client.session.requestPermission,
      (ctx) =>
        new Promise<acp.RequestPermissionResponse>((resolve) => {
          const requestId = `permission-${++requests}`;
          const { sessionId: _session, ...request } = ctx.params;
          open.set(requestId, resolve);
          onEvent({
            type: "permission_requested",
            requestId,
            request: request as PermissionRequest,
          });
          // A request the agent has given up on stops waiting for the person.
          ctx.signal.addEventListener("abort", () => answer(requestId, { outcome: "cancelled" }), {
            once: true,
          });
        }),
    )
    .onNotification(acp.methods.client.session.update, (ctx) => {
      if (sessionId === undefined || ctx.params.sessionId === sessionId) {
        onEvent({ type: "update", update: ctx.params.update });
      }
    })
    .connect(stream);

  const { agent } = connection;

  try {
    await agent.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    });
    if (sessionId === undefined) {
      sessionId = (await agent.request(acp.methods.agent.session.new, { cwd, mcpServers: [] }))
        .sessionId;
    } else {
      await agent.request(acp.methods.agent.session.load, { sessionId, cwd, mcpServers: [] });
    }
  } catch (err) {
    connection.close(err);
    throw err;
  }

  const id = sessionId;

  return {
    sessionId: id,
    async prompt(text) {
      onEvent({ type: "prompt_started", content: [{ type: "text", text }] });
      try {
        const { stopReason } = await agent.request(acp.methods.agent.session.prompt, {
          sessionId: id,
          prompt: [{ type: "text", text }],
        });
        onEvent({ type: "prompt_ended", stopReason });
      } catch (err) {
        onEvent({ type: "failed", message: describeError(err) });
      }
    },
    cancel: () => agent.notify(acp.methods.agent.session.cancel, { sessionId: id }),
    answerPermission: answer,
    async close() {
      for (const requestId of [...open.keys()]) answer(requestId, { outcome: "cancelled" });
      connection.close();
      await stream.writable.close().catch(() => {});
    },
  };
}
