import type { ToolCall, ToolCallUpdate } from "@agentclientprotocol/sdk";

/**
 * Applies a tool call update to what is known of the call. A field the update supplies replaces
 * the old one; a field it leaves out, or sets to null, keeps the old one, so an update can never
 * erase content.
 */
export function mergeToolCall(previous: ToolCall | undefined, update: ToolCallUpdate): ToolCall {
  return {
    toolCallId: update.toolCallId,
    title: update.title ?? previous?.title ?? `Tool ${update.toolCallId}`,
    name: update.name ?? previous?.name,
    kind: update.kind ?? previous?.kind ?? "other",
    status: update.status ?? previous?.status ?? "pending",
    content: update.content ?? previous?.content ?? [],
    locations: update.locations ?? previous?.locations ?? [],
    rawInput: update.rawInput ?? previous?.rawInput,
    rawOutput: update.rawOutput ?? previous?.rawOutput,
    _meta: update._meta ?? previous?._meta,
  };
}
