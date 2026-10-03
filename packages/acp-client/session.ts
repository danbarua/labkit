/**
 * One ACP session, as a browser holds it: a client over Streamable HTTP whose traffic comes out
 * as the events the view model reduces. It uses `fetch` and nothing else from the platform, so it
 * runs in a page, a webview or a test, and a different agent behind the same URL changes nothing.
 */

import * as acp from "@agentclientprotocol/sdk";
import { createHttpStream } from "@agentclientprotocol/sdk/experimental/http-client";
import { type PermissionRequest, promptEnded, type ViewEvent } from "@labkit/view-model";

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
  /** Answers a question the agent asked (`elicitation/create`) and is waiting on. */
  answerQuestion(requestId: string, response: acp.CreateElicitationResponse): void;
  /**
   * Selects a configuration option, such as the model. The agent takes the selection at once and
   * applies it between turns; the options it answers with come out through `onEvent`.
   */
  setConfigOption(configId: string, value: string | boolean): Promise<void>;
  close(): Promise<void>;
}

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Introduces this client to the agent: the protocol it speaks and what it can draw. */
const introduce = (agent: acp.ClientConnection["agent"]) =>
  agent.request(acp.methods.agent.initialize, {
    protocolVersion: acp.PROTOCOL_VERSION,
    // Questions in both modes are drawn in the conversation; nothing else is offered.
    clientCapabilities: { elicitation: { form: {}, url: {} } },
  });

export interface ListOptions {
  /** The agent's ACP endpoint. */
  readonly url: string;
  /** Only the sessions about this directory. */
  readonly cwd?: string;
  /** Replaces the platform `fetch`, to reach a server in the same process. */
  readonly fetch?: typeof fetch;
}

/**
 * Every session the agent keeps for `cwd`, in the agent's order, read page by page. Resolves to
 * `undefined` when the agent does not list its sessions (it does not advertise `session/list`).
 */
export async function listSessions(
  options: ListOptions,
): Promise<readonly acp.SessionInfo[] | undefined> {
  const stream = createHttpStream(options.url, options.fetch ? { fetch: options.fetch } : {});
  const connection = acp.client({ name: "labkit-view" }).connect(stream);
  try {
    const { agentCapabilities } = await introduce(connection.agent);
    if (!agentCapabilities?.sessionCapabilities?.list) return undefined;
    const sessions: acp.SessionInfo[] = [];
    let cursor: string | undefined;
    do {
      const page = await connection.agent.request(acp.methods.agent.session.list, {
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        ...(cursor === undefined ? {} : { cursor }),
      });
      sessions.push(...page.sessions);
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    return sessions;
  } finally {
    connection.close();
    await stream.writable.close().catch(() => {});
  }
}

export async function connectSession(options: ConnectOptions): Promise<SessionClient> {
  const { onEvent } = options;
  const cwd = options.cwd ?? "/";
  const stream = createHttpStream(options.url, options.fetch ? { fetch: options.fetch } : {});

  /** Requests the agent is waiting on, by the id the view knows them by. */
  const open = new Map<string, (response: acp.RequestPermissionResponse) => void>();
  /** Questions the agent is waiting on, by the id the view knows them by. */
  const asked = new Map<string, (response: acp.CreateElicitationResponse) => void>();
  let requests = 0;
  let sessionId: string | undefined = options.sessionId;

  const showConfigOptions = (configOptions: readonly acp.SessionConfigOption[]): void =>
    onEvent({
      type: "update",
      update: { sessionUpdate: "config_option_update", configOptions: [...configOptions] },
    });

  const answer = (requestId: string, outcome: acp.RequestPermissionOutcome): void => {
    const respond = open.get(requestId);
    if (respond === undefined) return;
    open.delete(requestId);
    onEvent({ type: "permission_answered", requestId, outcome });
    respond({ outcome });
  };

  const answerQuestion = (requestId: string, response: acp.CreateElicitationResponse): void => {
    const respond = asked.get(requestId);
    if (respond === undefined) return;
    asked.delete(requestId);
    onEvent({ type: "elicitation_answered", requestId, response });
    respond(response);
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
    .onRequest(
      acp.methods.client.elicitation.create,
      (ctx) =>
        new Promise<acp.CreateElicitationResponse>((resolve) => {
          const requestId = `question-${++requests}`;
          asked.set(requestId, resolve);
          onEvent({ type: "elicitation_requested", requestId, request: ctx.params });
          // A question the agent has given up on stops waiting for the person.
          ctx.signal.addEventListener(
            "abort",
            () => answerQuestion(requestId, { action: "cancel" }),
            { once: true },
          );
        }),
    )
    .onNotification(acp.methods.client.elicitation.complete, (ctx) => {
      onEvent({ type: "elicitation_completed", elicitationId: ctx.params.elicitationId });
    })
    .onNotification(acp.methods.client.session.update, (ctx) => {
      if (sessionId === undefined || ctx.params.sessionId === sessionId) {
        onEvent({ type: "update", update: ctx.params.update });
      }
    })
    .connect(stream);

  const { agent } = connection;

  try {
    await introduce(agent);
    let opened: { configOptions?: readonly acp.SessionConfigOption[] | null };
    if (sessionId === undefined) {
      const created = await agent.request(acp.methods.agent.session.new, { cwd, mcpServers: [] });
      sessionId = created.sessionId;
      opened = created;
    } else {
      opened = await agent.request(acp.methods.agent.session.load, {
        sessionId,
        cwd,
        mcpServers: [],
      });
    }
    // The options a session starts with come in the response to opening it, not as an update.
    if (opened.configOptions) showConfigOptions(opened.configOptions);
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
        const response = await agent.request(acp.methods.agent.session.prompt, {
          sessionId: id,
          prompt: [{ type: "text", text }],
        });
        onEvent(promptEnded(response));
      } catch (err) {
        onEvent({ type: "failed", message: describeError(err) });
      }
    },
    cancel: () => agent.notify(acp.methods.agent.session.cancel, { sessionId: id }),
    answerPermission: answer,
    answerQuestion,
    async setConfigOption(configId, value) {
      try {
        const { configOptions } = await agent.request(acp.methods.agent.session.setConfigOption, {
          sessionId: id,
          configId,
          ...(typeof value === "boolean"
            ? { type: "boolean" as const, value }
            : { type: "id" as const, value }),
        });
        showConfigOptions(configOptions);
      } catch (err) {
        onEvent({ type: "failed", message: describeError(err) });
      }
    },
    async close() {
      for (const requestId of [...open.keys()]) answer(requestId, { outcome: "cancelled" });
      for (const requestId of [...asked.keys()]) answerQuestion(requestId, { action: "cancel" });
      connection.close();
      await stream.writable.close().catch(() => {});
    },
  };
}
