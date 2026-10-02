import type { ContentBlock, ToolCall } from "@agentclientprotocol/sdk";
import type { Block, PermissionEntry, TranscriptState } from "./state";

/** Requests the client has not yet answered. The agent's turn is blocked on each. */
export function pendingPermissions(state: TranscriptState): readonly PermissionEntry[] {
  return state.permissions.filter((p) => p.outcome === undefined);
}

/** The most recent permission request made for a tool call, whether or not it was answered. */
export function permissionFor(
  state: TranscriptState,
  toolCallId: string,
): PermissionEntry | undefined {
  return state.permissions.findLast((p) => p.request.toolCall.toolCallId === toolCallId);
}

export type Phase = "idle" | "running" | "awaiting_permission";

/** A turn that is waiting on the person is not the same as one that is working. */
export function phase(state: TranscriptState): Phase {
  if (pendingPermissions(state).length > 0) return "awaiting_permission";
  return state.running ? "running" : "idle";
}

export function toolCallOf(
  state: TranscriptState,
  block: Extract<Block, { kind: "tool" }>,
): ToolCall | undefined {
  return state.toolCalls[block.toolCallId];
}

/** The text of a message's content blocks, with any other block left out. */
export function textOf(content: readonly ContentBlock[]): string {
  return content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
}

/**
 * What the person sent in the last turn when that turn was cancelled, to edit and send again; else
 * nothing. A turn that finished, or one still running, has nothing to redo.
 */
export function cancelledPrompt(state: TranscriptState): string | undefined {
  if (state.running || state.stopReason !== "cancelled") return undefined;
  const prompt = state.blocks.findLast((block) => block.kind === "user");
  return prompt?.kind === "user" ? textOf(prompt.content) || undefined : undefined;
}
