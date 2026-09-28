import type { AgentContext, SessionUpdate } from "@agentclientprotocol/sdk";
import { blobUri } from "@labkit/core-agent";
import type {
  JournalBody,
  JournalState,
  MessageView,
  SessionBindings,
  SessionRuntime,
  SessionState,
  ViewToolCall,
} from "@labkit/core-agent";
import {
  settledTool,
  toolAnnouncement,
  toolLocations,
  toolCallIdOf,
  type HostToolNotification,
  type Tool,
  type ToolIdentity,
} from "@labkit/core-agent/host";
import { diagnostic, diagnosticError } from "@labkit/core-agent/logging";

import type { AcpOptions } from "../adapter.ts";
import { parseSessionInfo } from "../session-info.ts";
import { renderToolContent, type AcpToolContent } from "../tool-content.ts";
import type { ConfigProjection } from "./config.ts";
import type { AdapterCore } from "./core.ts";
import type { Session } from "./session.ts";

/** Runtime display callbacks that ACP projects to the client. */
export type DisplayBindings = Pick<SessionBindings, "observe" | "toolUpdate" | "streamUpdate">;

/** Projects runtime state and display events to `session/update` notifications. */
export type SessionUpdates = Readonly<{
  observe(
    entry: Omit<Session, "runtime"> & { runtime?: SessionRuntime },
    client: AgentContext,
    snapshot: SessionState,
  ): void;
  refreshInfo(entry: Session, client: AgentContext): void;
  replay(
    client: AgentContext,
    id: string,
    messages: readonly MessageView[],
    prefix: string,
    facts: ReplayFacts,
    tools: ReadonlyMap<string, Tool>,
    renderers: ReadonlyMap<string, AcpToolContent>,
  ): Promise<void>;
  bindings(
    entry: Omit<Session, "runtime"> & { runtime?: SessionRuntime },
    client: AgentContext,
    renderers: ReadonlyMap<string, AcpToolContent>,
    subscribers: DisplayBindings,
    boundSessionId: () => string | undefined,
  ): DisplayBindings;
  terminalAttached(
    client: AgentContext,
    sessionIdentity: () => string,
  ): (toolCallId: string, terminalId: string) => void;
  resetTurn(entry: Session): void;
}>;

/** Append validated locations to a tool title for clients that show only the title. */
export function locatedTitle(
  title: string,
  locations?: readonly { path: string; line?: number }[],
) {
  return locations?.length
    ? `${title}: ${locations.map(({ path, line }) => `${JSON.stringify(path)}${line === undefined ? "" : `:${line}`}`).join(", ")}`
    : title;
}

function toolUpdate(
  event: HostToolNotification,
  terminals: readonly string[] = [],
  renderers: ReadonlyMap<string, AcpToolContent> = new Map(),
  reconstructed = false,
): SessionUpdate {
  if (event.sessionUpdate === "tool_call")
    return {
      sessionUpdate: "tool_call",
      toolCallId: event.toolCallId,
      title: event.title,
      name: event.name,
      kind: event.kind,
      status: event.status,
      rawInput: event.rawInput,
    };
  return {
    sessionUpdate: "tool_call_update",
    toolCallId: event.toolCallId,
    ...(event.status ? { status: event.status } : {}),
    ...(event.locations ? { locations: [...event.locations] } : {}),
    ...(event.rawOutput !== undefined
      ? {
          rawOutput: event.rawOutput,
          ...(reconstructed ? { _meta: { "labkit.dev/reconstructed": true } } : {}),
          content: [
            ...terminals.map((terminalId) => ({ type: "terminal" as const, terminalId })),
            ...renderToolContent(
              event.status === "completed" && event.name ? renderers.get(event.name) : undefined,
              event.rawOutput,
              {
                sessionId: event.sessionId,
                toolCallId: event.toolCallId,
                toolName: event.name,
                turnId: event.turnId,
                batchId: event.batchId,
                callId: event.callId,
                reconstructed,
              },
            ),
            ...(event.name && renderers.has(event.name)
              ? []
              : (event.parts ?? []).flatMap((part) =>
                  part.type === "blob"
                    ? [
                        {
                          type: "content" as const,
                          content: {
                            type: "resource_link" as const,
                            uri: blobUri(part.ref),
                            name: part.ref.name ?? part.ref.media,
                            mimeType: part.ref.media,
                            size: part.ref.bytes,
                          },
                        },
                      ]
                    : [],
                )),
          ],
        }
      : {}),
  };
}

/**
 * The `session/update` for one tool notification, as a client is sent it: the card keeps the title
 * the call was announced with, located once locations arrive, and its last status. Forgets the card
 * once the call settles.
 */
function showTool(
  cards: Session["toolCards"],
  terminals: Session["terminals"],
  event: HostToolNotification,
  renderers: ReadonlyMap<string, AcpToolContent>,
  reconstructed = false,
): SessionUpdate {
  if (event.sessionUpdate === "tool_call")
    cards.set(event.toolCallId, {
      baseTitle: event.title,
      title: event.title,
      status: event.status,
    });
  const card = cards.get(event.toolCallId);
  if (card && event.sessionUpdate === "tool_call_update") {
    if (event.locations) card.title = locatedTitle(card.baseTitle, event.locations);
    if (event.status) card.status = event.status;
  }
  const update = {
    ...toolUpdate(event, terminals.get(event.toolCallId), renderers, reconstructed),
    ...(card ? { title: card.title, status: card.status } : {}),
  };
  if (event.status === "completed" || event.status === "failed") {
    terminals.delete(event.toolCallId);
    cards.delete(event.toolCallId);
  }
  return update;
}

function observeSafely<T>(
  callback: ((value: T) => unknown) | undefined,
  value: T,
  fields: Record<string, unknown>,
) {
  const failed = (error: unknown) =>
    diagnostic("acp", "warning", "acp.subscriber.failed", {
      ...fields,
      error: diagnosticError(error),
    });
  try {
    void Promise.resolve(callback?.(value)).catch(failed);
  } catch (error) {
    failed(error);
  }
}

type ToolRecord = Extract<JournalBody, { kind: "tool" }>;

/**
 * What the journal records about the turns a session's own journal holds, keyed by history message
 * (`<sessionId>/history/<turn>/<message>`): the completion each assistant message came from, and the
 * raw `tool` record of each of its calls (`<message key>/<call id>`). The conversation fold's log gives
 * the order of messages; these give the IDs and outcomes a live client saw. Turns a fork inherited, and
 * a compaction's context, have no records here.
 */
export type ReplayFacts = Readonly<{
  completions: ReadonlyMap<string, string>;
  tools: ReadonlyMap<string, ToolRecord>;
}>;

export function replayFacts(state: JournalState): ReplayFacts {
  const completions = new Map<string, string>();
  const tools = new Map<string, ToolRecord>();
  const owned = new Map<string, ToolRecord>();
  const owners = new Map<string, string[]>();
  const created = state.records[0]?.body;
  let historyIndex = created?.kind === "created" ? created.seed.log.length : 0;
  let active: { owner: string; turnId: string } | undefined;
  for (const { body } of state.records) {
    if (body.kind === "event" && body.event.type === "child") {
      const event = body.event.event;
      if (event.type === "model_settled" && event.result.kind === "succeeded") {
        const previous = owners.get(body.event.turnId) ?? [];
        previous.push(event.child.id);
        owners.set(body.event.turnId, previous);
        if (event.result.value.kind === "tools")
          active = { owner: event.child.id, turnId: body.event.turnId };
      }
    }
    if (body.kind === "tool" && active?.turnId === body.turnId)
      owned.set(`${active.owner}/${body.callId}`, body);
    if (body.kind === "terminal") {
      const completed = owners.get(body.turnId) ?? [];
      let assistant = 0;
      // The fold appends exactly one log entry per terminal record, in the same order this loop
      // sees them, so `historyIndex` names the entry this record produced. Terminal records carry
      // only turnId, agent and outcome; the turn's messages come from the fold's log entry.
      state.conversation.log[historyIndex]?.messages.forEach((message, index) => {
        if (message.role !== "assistant") return;
        const owner = completed[assistant++];
        if (owner === undefined) return;
        const key = `${state.conversation.sessionId}/history/${historyIndex}/${index}`;
        completions.set(key, owner);
        for (const call of message.calls ?? []) {
          const record = owned.get(`${owner}/${call.id}`);
          if (record) tools.set(`${key}/${call.id}`, record);
        }
      });
      historyIndex++;
    }
  }
  return { completions, tools };
}

/** Builds the session/update projection for one connection. */
export function sessionUpdates(
  core: AdapterCore,
  current: (sessionId: string) => Session | undefined,
  sessionInfo: AcpOptions["sessionInfo"],
  project: ConfigProjection["project"],
): SessionUpdates {
  const { connectionId } = core;
  const text = (
    client: AgentContext,
    id: string,
    value: string,
    messageId: string,
    thought = false,
  ) => {
    if (value)
      core.send(client, id, {
        sessionUpdate: thought ? "agent_thought_chunk" : "agent_message_chunk",
        messageId,
        content: { type: "text", text: value },
      });
  };

  const refreshInfo = (entry: Session, client: AgentContext) => {
    if (!sessionInfo || !entry.acceptingUpdates || core.isClosing()) return;
    const sessionId = entry.runtime.snapshot.durable.conversation.sessionId;
    const revision = entry.runtime.snapshot.durable.revision;
    const epoch = ++entry.infoEpoch;
    try {
      const result = sessionInfo({ sessionId, cwd: entry.cwd }, core.signal());
      void Promise.resolve(result)
        .then((value) => {
          if (
            core.isClosing() ||
            current(sessionId) !== entry ||
            !entry.acceptingUpdates ||
            epoch !== entry.infoEpoch ||
            entry.runtime.snapshot.durable.revision !== revision
          )
            return;
          const info = parseSessionInfo(value);
          if (!info) return;
          const signature = JSON.stringify(info);
          if (signature === entry.infoSignature) return;
          entry.infoSignature = signature;
          core.send(client, sessionId, { sessionUpdate: "session_info_update", ...info });
        })
        .catch((error) =>
          diagnostic("acp", "warning", "acp.session.metadata.failed", {
            connectionId,
            sessionId,
            revision,
            error: diagnosticError(error),
          }),
        );
    } catch (error) {
      diagnostic("acp", "warning", "acp.session.metadata.failed", {
        connectionId,
        sessionId,
        revision,
        error: diagnosticError(error),
      });
    }
  };

  const observe = (
    entry: Omit<Session, "runtime"> & { runtime?: SessionRuntime },
    client: AgentContext,
    snapshot: SessionState,
  ) => {
    if (!entry.acceptingUpdates) return;
    entry.usage?.refresh();
    const id = snapshot.durable.conversation.sessionId;
    // Clients see the selected configuration: a selection made mid-turn, or a pending registry
    // adoption's reconciled policy, before the journal records it.
    const policy = entry.runtime ? entry.runtime.selectedPolicy : snapshot.durable.policy;
    project(entry, client, id, policy, snapshot.durable.revision);
    for (const record of snapshot.durable.records.slice(entry.revision)) {
      entry.revision = record.revision;
      const body = record.body;
      if (body.kind !== "event" || body.event.type !== "child") continue;
      const event = body.event.event;
      if (event.type !== "model_settled" || event.result.kind !== "succeeded") continue;
      const finalText = event.result.value.text;
      const prefix = entry.streamed.get(event.child.id) ?? "";
      // A decoder may normalize text. Never duplicate already displayed stream output.
      if (finalText.startsWith(prefix))
        text(client, id, finalText.slice(prefix.length), event.child.id);
      entry.streamed.delete(event.child.id);
    }
  };

  /** The notifications a live client was sent for one recorded call, from its tool and raw outcome. */
  const recordedCall = async (
    identity: ToolIdentity,
    call: ViewToolCall,
    tool: Tool | undefined,
  ): Promise<HostToolNotification[]> => {
    const { name: _name, ...ids } = identity;
    const trace = { connectionId, ...ids };
    if (!tool) {
      diagnostic("acp", "info", "acp.replay.tool_unregistered", {
        ...trace,
        toolName: call.name,
        consequence: "shown with kind other and no locations",
      });
      return [toolAnnouncement(identity, call, undefined)];
    }
    const announced = toolAnnouncement(identity, call, tool);
    if (!tool.locations) return [announced];
    try {
      const locations = toolLocations(tool, await tool.parseInput(call.args));
      return locations
        ? [announced, { ...identity, sessionUpdate: "tool_call_update", locations }]
        : [announced];
    } catch (error) {
      diagnostic("acp", "warning", "acp.replay.locations_failed", {
        ...trace,
        toolName: call.name,
        error: diagnosticError(error),
      });
      return [announced];
    }
  };

  const replay = async (
    client: AgentContext,
    id: string,
    messages: readonly MessageView[],
    prefix: string,
    facts: ReplayFacts,
    tools: ReadonlyMap<string, Tool>,
    renderers: ReadonlyMap<string, AcpToolContent>,
  ) => {
    const cards: Session["toolCards"] = new Map();
    const terminals: Session["terminals"] = new Map();
    // Calls announced and not yet settled: recorded ones by their journal identity, and calls with no
    // journal record (a fork's inherited turns, a compaction's context) by the ids replay makes up.
    const recorded = new Map<string, { identity: ToolIdentity; record: ToolRecord }>();
    const settle = ({ identity, record }: { identity: ToolIdentity; record: ToolRecord }) =>
      core.send(
        client,
        id,
        showTool(cards, terminals, settledTool(identity, record.result), renderers, true),
      );
    const unrecorded = new Map<string, { toolCallId: string; toolName: string }>();
    for (const [index, message] of messages.entries()) {
      const key = `${prefix}/${index}`;
      const messageId =
        facts.completions.get(key) ??
        (message.role === "assistant" && message.owner
          ? `${message.owner.turnId}/${message.owner.generation}`
          : key);
      if (message.role === "user" || message.role === "assistant") {
        if (message.text)
          core.send(client, id, {
            sessionUpdate: message.role === "user" ? "user_message_chunk" : "agent_message_chunk",
            messageId,
            content: { type: "text", text: message.text },
          });
        for (const blob of message.blobs)
          core.send(client, id, {
            sessionUpdate: message.role === "user" ? "user_message_chunk" : "agent_message_chunk",
            messageId,
            content: {
              type: "resource_link",
              uri: blob.uri,
              name: blob.name ?? blob.id,
              mimeType: blob.media,
              size: blob.bytes,
            },
          });
      }
      if (message.role === "assistant")
        for (const call of message.calls ?? []) {
          const record = facts.tools.get(`${key}/${call.id}`);
          if (record) {
            const identity: ToolIdentity = {
              sessionId: id,
              turnId: record.turnId,
              batchId: record.batchId,
              callId: record.callId,
              toolCallId: toolCallIdOf(record.batchId, record.callId),
              name: call.name,
            };
            recorded.set(call.id, { identity, record });
            for (const event of await recordedCall(identity, call, tools.get(call.name)))
              core.send(client, id, showTool(cards, terminals, event, renderers, true));
            continue;
          }
          const toolCallId = `${messageId}/tool/${call.id}`;
          unrecorded.set(call.id, { toolCallId, toolName: call.name });
          core.send(client, id, {
            sessionUpdate: "tool_call",
            toolCallId,
            title: call.name,
            name: call.name,
            rawInput: call.args,
            kind: tools.get(call.name)?.kind ?? "other",
          });
        }
      if (message.role === "tool") {
        const settled = recorded.get(message.callId);
        if (settled) {
          settle(settled);
          recorded.delete(message.callId);
          continue;
        }
        const call = unrecorded.get(message.callId);
        if (call) {
          const { toolCallId, toolName } = call;
          core.send(client, id, {
            sessionUpdate: "tool_call_update",
            toolCallId,
            rawOutput: message.text,
            _meta: { "labkit.dev/reconstructed": true },
            content: [
              ...renderToolContent(undefined, message.text, {
                sessionId: id,
                toolCallId,
                toolName,
                reconstructed: true,
              }),
              ...(renderers.has(toolName)
                ? []
                : message.blobs.map((blob) => ({
                    type: "content" as const,
                    content: {
                      type: "resource_link" as const,
                      uri: blob.uri,
                      name: blob.name ?? blob.media,
                      mimeType: blob.media,
                      size: blob.bytes,
                    },
                  }))),
            ],
          });
          unrecorded.delete(message.callId);
        }
      }
    }
    // A recorded call the log has no tool message for still has its raw outcome; an unrecorded one
    // has nothing to show, so it is failed rather than left pending forever.
    for (const settled of recorded.values()) settle(settled);
    for (const { toolCallId } of unrecorded.values())
      core.send(client, id, { sessionUpdate: "tool_call_update", toolCallId, status: "failed" });
  };

  return {
    refreshInfo,
    observe,
    replay,
    bindings: (entry, client, renderers, subscribers, boundSessionId) => ({
      observe: (snapshot) => {
        const bound = boundSessionId();
        if (!bound || snapshot.durable.conversation.sessionId === bound)
          observe(entry, client, snapshot);
        observeSafely(subscribers.observe, snapshot, {
          connectionId,
          sessionId: snapshot.durable.conversation.sessionId,
          operation: "observe",
        });
      },
      toolUpdate: (event) => {
        const update = showTool(entry.toolCards, entry.terminals, event, renderers);
        if (entry.acceptingUpdates && event.sessionId) core.send(client, event.sessionId, update);
        observeSafely(subscribers.toolUpdate, event, {
          connectionId,
          sessionId: event.sessionId,
          toolCallId: event.toolCallId,
          operation: "toolUpdate",
        });
      },
      streamUpdate: (event) => {
        if (entry.acceptingUpdates && event.sessionId) {
          if (event.text) {
            entry.streamed.set(
              event.completionId,
              (entry.streamed.get(event.completionId) ?? "") + event.text,
            );
            text(client, event.sessionId, event.text, event.completionId);
          }
          if (event.thinking)
            text(client, event.sessionId, event.thinking, `${event.completionId}/thought`, true);
          if (event.status === "failed") entry.streamed.delete(event.completionId);
        }
        observeSafely(subscribers.streamUpdate, event, {
          connectionId,
          sessionId: event.sessionId,
          childId: event.completionId,
          operation: "streamUpdate",
        });
      },
    }),
    terminalAttached: (client, sessionIdentity) => (toolCallId, terminalId) => {
      const sessionId = sessionIdentity();
      const active = current(sessionId);
      if (!active?.acceptingUpdates) return;
      const ids = active.terminals.get(toolCallId) ?? [];
      if (!ids.includes(terminalId)) ids.push(terminalId);
      active.terminals.set(toolCallId, ids);
      core.send(client, sessionId, {
        sessionUpdate: "tool_call_update",
        toolCallId,
        content: ids.map((terminalId) => ({ type: "terminal", terminalId })),
      });
    },
    resetTurn: (entry) => {
      entry.streamed.clear();
      entry.terminals.clear();
      entry.toolCards.clear();
    },
  };
}
