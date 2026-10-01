import type { AgentContext, ContentBlock, SessionUpdate } from "@agentclientprotocol/sdk";
import { blobUri, projectBlob, projectMessage } from "@labkit/core-agent";
import type {
  JournalBody,
  JournalState,
  MessageView,
  SessionBindings,
  SessionRuntime,
  SessionState,
  ViewBlob,
  WireEvent,
} from "@labkit/core-agent";
import type { BlobRef } from "@labkit/core-agent/content";
import {
  settledTool,
  toolAnnouncement,
  toolCallIdOf,
  type HostToolNotification,
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
type Settled = Extract<Extract<WireEvent, { type: "child" }>["event"], { type: "model_settled" }>;

/**
 * The `session/update`s that draw a saved session, read from its journal records in order: each
 * prompt; each step's recorded thinking, answer text and tool calls; each call's recorded outcome
 * and how its card was shown; and what the stream showed of a step that did not finish. Messages a
 * fork or compaction started from are in the `created` record and are drawn first. `renderers`
 * format a tool's recorded output as it was formatted live.
 */
export function transcriptUpdates(
  state: JournalState,
  renderers: ReadonlyMap<string, AcpToolContent>,
): SessionUpdate[] {
  const out: SessionUpdate[] = [];
  const cards: Session["toolCards"] = new Map();
  const terminals: Session["terminals"] = new Map();
  const sessionId = state.conversation.sessionId;
  const chunk = (
    sessionUpdate: "user_message_chunk" | "agent_message_chunk" | "agent_thought_chunk",
    content: ContentBlock,
    messageId?: string,
  ) => out.push({ sessionUpdate, ...(messageId ? { messageId } : {}), content } as SessionUpdate);
  const card = (event: HostToolNotification) =>
    out.push(showTool(cards, terminals, event, renderers, true));
  const announced = new Map<string, ToolIdentity>();

  const created = state.records[0]?.body;
  if (created?.kind === "created") {
    const seeded = [...created.seed.context, ...created.seed.log.flatMap((turn) => turn.messages)];
    seededUpdates(out, sessionId, seeded.map(projectMessage), renderers);
  }

  const bodies = state.records.map(({ body }) => body);
  const toolOf = new Map<string, ToolRecord>();
  for (const body of bodies)
    if (body.kind === "tool") toolOf.set(`${body.turnId} ${body.batchId} ${body.callId}`, body);
  // The batch a step's calls ran in: the first batch of the same turn recorded after the step.
  const batchAfter = (from: number, turnId: string): string | undefined => {
    for (const body of bodies.slice(from + 1)) {
      if (body.kind === "tool" && body.turnId === turnId) return body.batchId;
      if (body.kind !== "event" || body.event.type !== "child" || body.event.turnId !== turnId)
        continue;
      const event = body.event.event;
      if (event.type === "model_settled") return undefined;
      if (event.type === "batch_settled") return event.child.id;
      if (event.type === "failed" && event.child.kind === "batch") return event.child.id;
    }
    return undefined;
  };

  for (const [index, body] of bodies.entries()) {
    if (body.kind === "queued") prompt(body.text, body.attachments);
    if (body.kind === "event" && body.event.type === "user")
      prompt(body.event.text, body.event.attachments);
    if (
      body.kind === "event" &&
      body.event.type === "child" &&
      body.event.event.type === "model_settled"
    )
      step(index, body.event.turnId, body.event.event);
    if (body.kind === "tool") {
      const identity = announced.get(toolCallIdOf(body.batchId, body.callId));
      if (identity) card(settledTool(identity, body.result));
    }
  }
  return out;

  function prompt(text: string, attachments: readonly BlobRef[] | undefined) {
    // A prompt is identified by its place in the transcript, as the client numbers the one it sent.
    if (text) chunk("user_message_chunk", { type: "text", text });
    for (const blob of attachments ?? [])
      chunk("user_message_chunk", resourceLink(projectBlob(blob)));
  }

  function step(index: number, turnId: ToolIdentity["turnId"], event: Settled) {
    const completionId = event.child.id;
    if (event.shown?.thinking)
      chunk(
        "agent_thought_chunk",
        { type: "text", text: event.shown.thinking },
        `${completionId}/thought`,
      );
    if (event.result.kind !== "succeeded") {
      if (event.shown?.text)
        chunk("agent_message_chunk", { type: "text", text: event.shown.text }, completionId);
      return;
    }
    const completion = event.result.value;
    if (completion.text)
      chunk("agent_message_chunk", { type: "text", text: completion.text }, completionId);
    if (completion.kind !== "tools") return;
    const batchId = batchAfter(index, turnId);
    for (const call of completion.calls) {
      const record = batchId ? toolOf.get(`${turnId} ${batchId} ${call.id}`) : undefined;
      const identity: ToolIdentity = {
        sessionId,
        turnId,
        batchId: (batchId ?? completionId) as ToolIdentity["batchId"],
        callId: call.id,
        // A call whose batch never started has no recorded ID; it is drawn under its step's.
        toolCallId: batchId
          ? toolCallIdOf(batchId, call.id)
          : (`${completionId}/tool/${call.id}` as ToolIdentity["toolCallId"]),
        name: call.name,
      };
      announced.set(identity.toolCallId, identity);
      card(toolAnnouncement(identity, call, record?.shown));
      if (record?.shown?.locations)
        card({ ...identity, sessionUpdate: "tool_call_update", locations: record.shown.locations });
    }
  }
}

function resourceLink(blob: ViewBlob): ContentBlock {
  return {
    type: "resource_link",
    uri: blob.uri,
    name: blob.name ?? blob.id,
    mimeType: blob.media,
    size: blob.bytes,
  };
}

/**
 * Messages a fork or compaction started from, as its `created` record holds them: text, blobs and
 * tool calls with the results the parent's history gave the model. Their cards carry IDs made from
 * the message's place, since the parent's call IDs are not part of this record.
 */
function seededUpdates(
  out: SessionUpdate[],
  sessionId: string,
  messages: readonly MessageView[],
  renderers: ReadonlyMap<string, AcpToolContent>,
) {
  const calls = new Map<string, { toolCallId: string; toolName: string }>();
  for (const [index, message] of messages.entries()) {
    const messageId = `${sessionId}/context/${index}`;
    if (message.role === "user" || message.role === "assistant") {
      const sessionUpdate = message.role === "user" ? "user_message_chunk" : "agent_message_chunk";
      const named = message.role === "assistant" ? { messageId } : {};
      if (message.text)
        out.push({ sessionUpdate, ...named, content: { type: "text", text: message.text } });
      for (const blob of message.blobs)
        out.push({ sessionUpdate, ...named, content: resourceLink(blob) });
    }
    if (message.role === "assistant")
      for (const call of message.calls ?? []) {
        const toolCallId = `${messageId}/tool/${call.id}`;
        calls.set(call.id, { toolCallId, toolName: call.name });
        out.push({
          sessionUpdate: "tool_call",
          toolCallId,
          title: call.name,
          name: call.name,
          rawInput: call.args,
        });
      }
    if (message.role === "tool") {
      const call = calls.get(message.callId);
      if (!call) continue;
      out.push({
        sessionUpdate: "tool_call_update",
        toolCallId: call.toolCallId,
        rawOutput: message.text,
        _meta: { "labkit.dev/reconstructed": true },
        content: [
          ...renderToolContent(undefined, message.text, {
            sessionId,
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            reconstructed: true,
          }),
          ...(renderers.has(call.toolName)
            ? []
            : message.blobs.map((blob) => ({
                type: "content" as const,
                content: resourceLink(blob),
              }))),
        ],
      });
      calls.delete(message.callId);
    }
  }
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

  return {
    refreshInfo,
    observe,
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
