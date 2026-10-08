/**
 * One ACP session, as a browser holds it: a client over Streamable HTTP whose traffic comes out
 * as the events the view model reduces. It uses `fetch` and nothing else from the platform, so it
 * runs in a page, a webview or a test, and a different agent behind the same URL changes nothing.
 *
 * The protocol is `effective-acp`'s, run on a runtime of its own per connection; what comes out is
 * Promises and the view model's events, so nothing that uses this needs Effect.
 */

import type * as acp from "@agentclientprotocol/sdk";
import { type PermissionRequest, promptEnded, type ViewEvent } from "@labkit/view-model";
import { Effect, Exit, Layer, ManagedRuntime, Schema, Scope } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Client from "effective-acp/client";
import * as Http from "effective-acp/http";
import * as Protocol from "effective-acp/protocol";
import * as V1 from "effective-acp/schema/v1";
import { type PromptFile, promptBlocks } from "./prompt-blocks";

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
  /** What the agent takes in a prompt besides text, as its `initialize` answer advertises it. */
  readonly promptCapabilities: acp.PromptCapabilities;
  /**
   * Sends a prompt: `text`, and `files` as `promptBlocks` turns them into blocks. Resolves when the
   * turn has ended; what happened arrives through `onEvent`, as does a file the agent does not take.
   */
  prompt(text: string, files?: readonly PromptFile[]): Promise<void>;
  /**
   * Asks the agent to stop the turn (`session/cancel`), then answers every permission request still
   * open as `cancelled`, as ACP requires of a client that cancels a turn. The prompt then resolves
   * as `cancelled`.
   */
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

const CLIENT_INFO = { name: "labkit-view", version: "0.0.0" };

/**
 * What this client draws. An agent sends a notice, a compaction update or a boolean option only to
 * a client that advertises it. `plan` advertises `plan_update` and `plan_removed`; a `plan` update
 * needs no capability. The client library also drops a gated update that arrives unasked.
 * Questions are drawn in both modes.
 */
const CAPABILITIES: V1.ClientCapabilities = {
  elicitation: { form: {}, url: {} },
  plan: {},
  session: { notices: {}, compaction: {}, configOptions: { boolean: {} } },
};

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** The services a connection runs on: HTTP through `fetch`, or through the one given. */
const runtimeFor = (fetchImpl: typeof fetch | undefined) =>
  ManagedRuntime.make(
    fetchImpl === undefined
      ? FetchHttpClient.layer
      : Layer.mergeAll(FetchHttpClient.layer, Layer.succeed(FetchHttpClient.Fetch, fetchImpl)),
  );

type Runtime = ReturnType<typeof runtimeFor>;
type Connection = Client.ConnectionOf<ReturnType<typeof implementation>>;

/** The client's side of version 1: what it draws, and how it answers the agent's requests. */
const implementation = (
  handlers: Client.ClientHandlers<Protocol.V1Version, never>,
): Client.ClientImplementation<Protocol.V1Version, never> =>
  Client.implement(Protocol.v1, {
    capabilities: CAPABILITIES,
    handlers: () => Effect.succeed(handlers),
  });

/**
 * Opens a connection to the agent at `url` and introduces this client (`initialize`). The
 * connection lasts until `scope` is closed.
 */
const open = (
  runtime: Runtime,
  scope: Scope.Closeable,
  url: string,
  handlers: Client.ClientHandlers<Protocol.V1Version, never>,
): Promise<Connection> =>
  runtime.runPromise(
    Effect.gen(function* () {
      const wire = yield* Http.connect(url);
      return yield* Client.connect({
        wire,
        info: CLIENT_INFO,
        implementations: [implementation(handlers)],
      });
    }).pipe(Scope.provide(scope)),
  );

/** Ends the connection and the runtime it ran on. */
const shut = async (runtime: Runtime, scope: Scope.Closeable): Promise<void> => {
  await runtime.runPromise(Scope.close(scope, Exit.void));
  await runtime.dispose();
};

const decodePermissionResponse = Schema.decodeUnknownSync(V1.RequestPermissionResponse);
const decodeElicitationResponse = Schema.decodeUnknownSync(V1.CreateElicitationResponse);

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
  const runtime = runtimeFor(options.fetch);
  const scope = await runtime.runPromise(Scope.make());
  try {
    const connection = await open(runtime, scope, options.url, {});
    if (!connection.profile.agent.capabilities.sessionCapabilities?.list) return undefined;
    const sessions: acp.SessionInfo[] = [];
    let cursor: string | undefined;
    do {
      const page = await runtime.runPromise(
        connection.agent["session/list"]({
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
          ...(cursor === undefined ? {} : { cursor }),
        }),
      );
      sessions.push(...(page.sessions as unknown as readonly acp.SessionInfo[]));
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    return sessions;
  } finally {
    await shut(runtime, scope);
  }
}

export async function connectSession(options: ConnectOptions): Promise<SessionClient> {
  const { onEvent } = options;
  const cwd = options.cwd ?? "/";
  const runtime = runtimeFor(options.fetch);
  const scope = await runtime.runPromise(Scope.make());

  /** Requests the agent is waiting on, by the id the view knows them by. */
  const waiting = new Map<string, (outcome: acp.RequestPermissionOutcome) => void>();
  /** Questions the agent is waiting on, by the id the view knows them by. */
  const asked = new Map<string, (response: acp.CreateElicitationResponse) => void>();
  let requests = 0;
  // Ids the agent's methods take are branded; one given as text is branded once, here.
  let sessionId: V1.SessionId | undefined =
    options.sessionId === undefined ? undefined : V1.SessionId.make(options.sessionId);

  const showConfigOptions = (configOptions: readonly unknown[]): void =>
    onEvent({
      type: "update",
      update: {
        sessionUpdate: "config_option_update",
        configOptions: [...configOptions] as acp.SessionConfigOption[],
      },
    });

  const answer = (requestId: string, outcome: acp.RequestPermissionOutcome): void => {
    const respond = waiting.get(requestId);
    if (respond === undefined) return;
    waiting.delete(requestId);
    onEvent({ type: "permission_answered", requestId, outcome });
    respond(outcome);
  };

  const answerQuestion = (requestId: string, response: acp.CreateElicitationResponse): void => {
    const respond = asked.get(requestId);
    if (respond === undefined) return;
    asked.delete(requestId);
    onEvent({ type: "elicitation_answered", requestId, response });
    respond(response);
  };

  const handlers: Client.ClientHandlers<Protocol.V1Version, never> = {
    // The person may take minutes. A request the agent gives up on, or one still open when the
    // connection closes, is answered as cancelled, which also stops it waiting for the person.
    "session/request_permission": ({ sessionId: _session, ...request }) =>
      Effect.suspend(() => {
        const requestId = `permission-${++requests}`;
        return Effect.callback<acp.RequestPermissionOutcome>((resume) => {
          waiting.set(requestId, (outcome) => resume(Effect.succeed(outcome)));
          onEvent({
            type: "permission_requested",
            requestId,
            request: request as unknown as PermissionRequest,
          });
          return Effect.sync(() => answer(requestId, { outcome: "cancelled" }));
        }).pipe(Effect.map((outcome) => decodePermissionResponse({ outcome })));
      }),
    "elicitation/create": (params) =>
      Effect.suspend(() => {
        const requestId = `question-${++requests}`;
        return Effect.callback<acp.CreateElicitationResponse>((resume) => {
          asked.set(requestId, (response) => resume(Effect.succeed(response)));
          onEvent({
            type: "elicitation_requested",
            requestId,
            request: params as unknown as acp.CreateElicitationRequest,
          });
          return Effect.sync(() => answerQuestion(requestId, { action: "cancel" }));
        }).pipe(Effect.map(decodeElicitationResponse));
      }),
    "elicitation/complete": ({ elicitationId }) =>
      Effect.sync(() => onEvent({ type: "elicitation_completed", elicitationId })),
    "session/update": (params) =>
      Effect.sync(() => {
        if (sessionId === undefined || params.sessionId === sessionId)
          onEvent({ type: "update", update: params.update as unknown as acp.SessionUpdate });
      }),
  };

  let connection: Connection;
  let opened: { readonly configOptions?: readonly unknown[] | null | undefined };
  try {
    connection = await open(runtime, scope, options.url, handlers);
    if (sessionId === undefined) {
      const created = await runtime.runPromise(
        connection.agent["session/new"]({ cwd, mcpServers: [] }),
      );
      sessionId = created.sessionId;
      opened = created;
    } else {
      opened = await runtime.runPromise(
        connection.agent["session/load"]({ sessionId, cwd, mcpServers: [] }),
      );
    }
  } catch (err) {
    await shut(runtime, scope);
    throw err;
  }
  // The options a session starts with come in the response to opening it, not as an update.
  if (opened.configOptions) showConfigOptions(opened.configOptions);

  const id = sessionId;
  const promptCapabilities = (connection.profile.agent.capabilities.promptCapabilities ??
    {}) as acp.PromptCapabilities;

  return {
    sessionId: id,
    promptCapabilities,
    async prompt(text, files = []) {
      let content: acp.ContentBlock[];
      try {
        content = await promptBlocks(text, files, promptCapabilities);
      } catch (err) {
        onEvent({ type: "failed", message: describeError(err) });
        return;
      }
      onEvent({ type: "prompt_started", content });
      try {
        const response = await runtime.runPromise(
          connection.agent["session/prompt"]({
            sessionId: id,
            prompt: content as unknown as readonly V1.ContentBlock[],
          }),
        );
        onEvent(promptEnded(response as unknown as acp.PromptResponse));
      } catch (err) {
        onEvent({ type: "failed", message: describeError(err) });
      }
    },
    async cancel() {
      await runtime.runPromise(connection.notify("session/cancel", { sessionId: id }));
      for (const requestId of [...waiting.keys()]) answer(requestId, { outcome: "cancelled" });
    },
    answerPermission: answer,
    answerQuestion,
    async setConfigOption(configId, value) {
      try {
        const { configOptions } = await runtime.runPromise(
          connection.agent["session/set_config_option"](
            typeof value === "boolean"
              ? {
                  sessionId: id,
                  configId: V1.SessionConfigId.make(configId),
                  type: "boolean",
                  value,
                }
              : {
                  sessionId: id,
                  configId: V1.SessionConfigId.make(configId),
                  value: V1.SessionConfigValueId.make(value),
                },
          ),
        );
        showConfigOptions(configOptions);
      } catch (err) {
        onEvent({ type: "failed", message: describeError(err) });
      }
    },
    async close() {
      // Answered here, so the agent hears it before the connection goes; closing would otherwise
      // answer each as cancelled itself, once.
      for (const requestId of [...waiting.keys()]) answer(requestId, { outcome: "cancelled" });
      for (const requestId of [...asked.keys()]) answerQuestion(requestId, { action: "cancel" });
      await shut(runtime, scope);
    },
  };
}

export interface HistoryOptions {
  /** The agent's ACP endpoint. */
  readonly url: string;
  /** The session to reopen. */
  readonly sessionId: string;
  /** The directory the session is about. */
  readonly cwd?: string;
  /** Replaces the platform `fetch`, to reach a server in the same process. */
  readonly fetch?: typeof fetch;
}

/**
 * Everything the agent sends while reopening `sessionId`, then the connection closed. The reopen
 * completes once the replayed history has been handled (effective-acp counts it, or waits for it
 * to stop arriving with an agent that sends no count), so what was collected by then is all of it.
 */
export async function sessionHistory(options: HistoryOptions): Promise<readonly ViewEvent[]> {
  const events: ViewEvent[] = [];
  const client = await connectSession({ ...options, onEvent: (event) => events.push(event) });
  await client.close();
  return events;
}
