import type {
  ContentBlock,
  PromptResponse,
  RequestPermissionOutcome,
  SessionUpdate,
  StopReason,
  ToolCallUpdate,
} from "@agentclientprotocol/sdk";
import { mergeToolCall } from "./merge-tool-call";
import {
  type Block,
  initialState,
  type PermissionRequest,
  type Plan,
  type TranscriptState,
} from "./state";

/**
 * What can happen to a session's view. Agent updates arrive as they were sent; the rest are the
 * client's own acts, which the protocol does not echo back.
 */
export type ViewEvent =
  | { readonly type: "update"; readonly update: SessionUpdate }
  | { readonly type: "prompt_started"; readonly content: readonly ContentBlock[] }
  | {
      readonly type: "prompt_ended";
      readonly stopReason: StopReason;
      /** Why the turn stopped short, in the agent's words, when it said. */
      readonly reason?: string;
    }
  | {
      readonly type: "permission_requested";
      readonly requestId: string;
      readonly request: PermissionRequest;
    }
  | {
      readonly type: "permission_answered";
      readonly requestId: string;
      readonly outcome: RequestPermissionOutcome;
    }
  /** The client could not reach the agent or the agent's reply was an error. */
  | { readonly type: "failed"; readonly message: string };

/** Text chunks of one message join into one text block; anything else is kept as its own block. */
function joinContent(
  content: readonly ContentBlock[],
  chunk: ContentBlock,
): readonly ContentBlock[] {
  const last = content.at(-1);
  if (last?.type === "text" && chunk.type === "text") {
    return [...content.slice(0, -1), { ...last, text: last.text + chunk.text }];
  }
  return [...content, chunk];
}

type MessageKind = "user" | "assistant" | "thought";

/**
 * A chunk continues the block before it when that is the same kind of message and the ids do not
 * say otherwise. An id that changes starts a new message; chunks with no id continue.
 */
function appendChunk(
  state: TranscriptState,
  kind: MessageKind,
  chunk: ContentBlock,
  messageId: string | null | undefined,
): TranscriptState {
  const last = state.blocks.at(-1);
  if (last?.kind === kind && (messageId == null || last.id === messageId)) {
    const grown: Block = { ...last, content: joinContent(last.content, chunk) };
    return { ...state, blocks: [...state.blocks.slice(0, -1), grown] };
  }
  const block: Block = {
    kind,
    id: messageId ?? `${kind}:${state.blocks.length}`,
    content: [chunk],
  };
  return { ...state, blocks: [...state.blocks, block] };
}

function upsertToolCall(state: TranscriptState, incoming: ToolCallUpdate): TranscriptState {
  const previous = state.toolCalls[incoming.toolCallId];
  const toolCalls = {
    ...state.toolCalls,
    [incoming.toolCallId]: mergeToolCall(previous, incoming),
  };
  if (previous !== undefined) return { ...state, toolCalls };
  const block: Block = { kind: "tool", toolCallId: incoming.toolCallId };
  return { ...state, toolCalls, blocks: [...state.blocks, block] };
}

function setPlan(state: TranscriptState, planId: string, plan: Plan): TranscriptState {
  const known = state.plans[planId] !== undefined;
  const plans = { ...state.plans, [planId]: plan };
  if (known) return { ...state, plans };
  return { ...state, plans, blocks: [...state.blocks, { kind: "plan", planId }] };
}

function removePlan(state: TranscriptState, planId: string): TranscriptState {
  const { [planId]: _removed, ...plans } = state.plans;
  const blocks = state.blocks.filter((b) => !(b.kind === "plan" && b.planId === planId));
  return { ...state, plans, blocks };
}

function upsertCompaction(
  state: TranscriptState,
  compactionId: string,
  change: (previous: Extract<Block, { kind: "compaction" }> | undefined) => Block,
): TranscriptState {
  const at = state.blocks.findIndex(
    (b) => b.kind === "compaction" && b.compactionId === compactionId,
  );
  const previous = at < 0 ? undefined : state.blocks[at];
  const next = change(previous?.kind === "compaction" ? previous : undefined);
  if (at < 0) return { ...state, blocks: [...state.blocks, next] };
  return { ...state, blocks: state.blocks.map((b, i) => (i === at ? next : b)) };
}

function applyUpdate(state: TranscriptState, update: SessionUpdate): TranscriptState {
  switch (update.sessionUpdate) {
    case "user_message_chunk":
      return appendChunk(state, "user", update.content, update.messageId);
    case "agent_message_chunk":
      return appendChunk(state, "assistant", update.content, update.messageId);
    case "agent_thought_chunk":
      return appendChunk(state, "thought", update.content, update.messageId);
    case "tool_call":
    case "tool_call_update":
      return upsertToolCall(state, update);
    // A plan of no entries is the protocol's way to clear the plan: it goes, heading and all.
    case "plan":
      return update.entries.length === 0
        ? removePlan(state, "plan")
        : setPlan(state, "plan", { kind: "items", entries: update.entries });
    case "plan_update": {
      const { plan } = update;
      switch (plan.type) {
        case "items":
          return plan.entries.length === 0
            ? removePlan(state, plan.planId)
            : setPlan(state, plan.planId, { kind: "items", entries: plan.entries });
        case "file":
          return setPlan(state, plan.planId, { kind: "file", uri: plan.uri });
        case "markdown":
          return setPlan(state, plan.planId, { kind: "markdown", content: plan.content });
        default: {
          const unhandled: never = plan;
          void unhandled;
          return state;
        }
      }
    }
    case "plan_removed":
      return removePlan(state, update.planId);
    case "available_commands_update":
      return { ...state, commands: update.availableCommands };
    case "current_mode_update":
      return { ...state, modeId: update.currentModeId };
    case "config_option_update":
      return { ...state, configOptions: update.configOptions };
    case "session_info_update": {
      if (update.title === undefined) return state;
      return { ...state, title: update.title ?? undefined };
    }
    case "usage_update":
      return {
        ...state,
        usage: {
          used: update.used,
          size: update.size,
          ...(update.cost ? { cost: update.cost } : {}),
        },
      };
    case "notice": {
      const block: Block = {
        kind: "notice",
        id: `notice:${state.blocks.length}`,
        severity: update.severity,
        title: update.title,
        ...(update.description ? { description: update.description } : {}),
      };
      return { ...state, blocks: [...state.blocks, block] };
    }
    case "compaction_update":
      return upsertCompaction(state, update.compactionId, (previous) => ({
        kind: "compaction",
        compactionId: update.compactionId,
        status: update.status,
        summary: update.summary ?? previous?.summary ?? [],
        ...(update.error ? { error: update.error } : {}),
      }));
    case "compaction_summary_chunk":
      return upsertCompaction(state, update.compactionId, (previous) => ({
        kind: "compaction",
        compactionId: update.compactionId,
        status: previous?.status ?? "in_progress",
        summary: joinContent(previous?.summary ?? [], update.content),
        ...(previous?.error ? { error: previous.error } : {}),
      }));
    default: {
      // A new ACP update type is a compile error here. At run time an unknown one changes nothing.
      const unhandled: never = update;
      void unhandled;
      return state;
    }
  }
}

/**
 * The event for an answer to `session/prompt`: its stop reason, and the reason labkit's agent
 * gives for a refusal or a token limit, the `message` of the failure in `_meta`, written for
 * people.
 */
export function promptEnded(response: PromptResponse): ViewEvent {
  const failure = response._meta?.["labkit.dev/failure"];
  const message =
    typeof failure === "object" && failure !== null
      ? (failure as Record<string, unknown>).message
      : undefined;
  return typeof message === "string" && message !== ""
    ? { type: "prompt_ended", stopReason: response.stopReason, reason: message }
    : { type: "prompt_ended", stopReason: response.stopReason };
}

/**
 * What a turn that did not finish its work says about how it stopped: a title, a description
 * when the agent gave no reason of its own, and how much it needs the person. A turn that ended
 * with `end_turn` says nothing.
 */
const STOPPED: Partial<
  Record<StopReason, { title: string; description?: string; severity: "warning" | "info" }>
> = {
  max_tokens: {
    title: "The answer was cut short",
    description: "The model reached its limit on tokens for one reply.",
    severity: "warning",
  },
  refusal: { title: "The model refused to continue", severity: "warning" },
  max_turn_requests: {
    title: "The turn stopped at its step limit",
    description: "It made as many model requests as one turn may.",
    severity: "warning",
  },
  cancelled: {
    title: "Cancelled",
    description: "The turn was stopped before it finished.",
    severity: "info",
  },
};

/** The next view of a session after one event. Pure: the same events give the same view. */
export function reduce(state: TranscriptState, event: ViewEvent): TranscriptState {
  switch (event.type) {
    case "update":
      return applyUpdate(state, event.update);
    case "prompt_started": {
      const block: Block = {
        kind: "user",
        id: `user:${state.blocks.length}`,
        content: event.content,
      };
      const { stopReason: _cleared, ...rest } = state;
      return { ...rest, running: true, blocks: [...state.blocks, block] };
    }
    case "prompt_ended": {
      const ended = { ...state, running: false, stopReason: event.stopReason };
      const stopped = STOPPED[event.stopReason];
      if (stopped === undefined) return ended;
      const description = event.reason ?? stopped.description;
      const block: Block = {
        kind: "notice",
        id: `notice:${state.blocks.length}`,
        severity: stopped.severity,
        title: stopped.title,
        ...(description === undefined ? {} : { description }),
      };
      return { ...ended, blocks: [...state.blocks, block] };
    }
    case "failed": {
      const block: Block = {
        kind: "notice",
        id: `notice:${state.blocks.length}`,
        severity: "error",
        title: "The request failed",
        description: event.message,
      };
      return { ...state, running: false, blocks: [...state.blocks, block] };
    }
    case "permission_requested": {
      const withCall = upsertToolCall(state, event.request.toolCall);
      const entry = { requestId: event.requestId, request: event.request };
      return { ...withCall, permissions: [...withCall.permissions, entry] };
    }
    case "permission_answered":
      return {
        ...state,
        permissions: state.permissions.map((p) =>
          p.requestId === event.requestId ? { ...p, outcome: event.outcome } : p,
        ),
      };
  }
}

/** A session's view after a whole sequence of events: a live one, or a reopened one's replay. */
export function replay(
  events: Iterable<ViewEvent>,
  from: TranscriptState = initialState,
): TranscriptState {
  let state = from;
  for (const event of events) state = reduce(state, event);
  return state;
}
