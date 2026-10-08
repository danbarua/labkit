import type { ToolCall, ToolCallUpdate } from "@agentclientprotocol/sdk";

/**
 * Applies a tool call update. ACP has an update carry only the fields that changed, and says that
 * omission and `null` leave `name`, `rawInput` and `rawOutput` unchanged. ACP does not say what
 * `null` means for the other fields; this merge keeps their previous values too.
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
