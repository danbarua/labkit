import { z } from "zod";

import { toolOperationId, type ToolRunResult } from "../agent/tool-batch.ts";
import { ref, type ActorId, type Result, type ToolCall } from "../agent/types.ts";
import type { HostToolNotification } from "./host.ts";
import { ToolLocationSchema, type Tool, type ToolKind, type ToolLocation } from "./ports.ts";

/** The ID a client knows call `callId` of tool batch `batchId` by: its `tool` operation's ID. */
export const toolCallIdOf = (batchId: string, callId: string): ActorId =>
  ref("tool", toolOperationId(batchId, callId)).id;

/**
 * The fields every {@link HostToolNotification} about one call carries. `toolCallId` is the tool
 * operation's ID, `<batch id>/<call id>`.
 */
export type ToolIdentity = Readonly<{
  sessionId?: string;
  turnId: ActorId;
  batchId: ActorId;
  callId: ToolCall["id"];
  toolCallId: ActorId;
  name: string;
}>;

/**
 * The `tool_call` that announces a call, with the kind it is shown as: the tool's when announced
 * live, the recorded one when a journal is drawn. Without one it is `other`, the protocol's default.
 */
export function toolAnnouncement(
  identity: ToolIdentity,
  call: Readonly<{ name: string; args: unknown }>,
  shown: Readonly<{ kind?: ToolKind }> | undefined,
): HostToolNotification {
  return {
    ...identity,
    sessionUpdate: "tool_call",
    title: call.name,
    name: call.name,
    kind: shown?.kind ?? "other",
    status: "pending",
    rawInput: call.args,
  };
}

/**
 * The call's display locations from its tool's `locations` over the parsed input, or undefined when
 * the tool declares none.
 *
 * @throws When `locations` throws or returns an invalid location.
 */
export function toolLocations(
  tool: Pick<Tool, "locations">,
  input: unknown,
): readonly ToolLocation[] | undefined {
  if (!tool.locations) return undefined;
  return z.array(ToolLocationSchema).parse(tool.locations(structuredClone(input)));
}

/**
 * The last `tool_call_update` of a settled call, from its raw outcome: the output text and blob
 * parts on success; `{ refused, reason }` for a refused permission; `{ error }` for any other
 * failure; `{ error: "Tool cancelled" }` on cancellation.
 */
export function settledTool(
  identity: ToolIdentity,
  result: Result<ToolRunResult>,
): HostToolNotification {
  const settled = { ...identity, sessionUpdate: "tool_call_update" as const };
  if (result.kind === "succeeded")
    return {
      ...settled,
      status: "completed",
      rawOutput: result.value.text,
      ...(result.value.parts ? { parts: result.value.parts } : {}),
    };
  if (result.kind === "cancelled")
    return { ...settled, status: "failed", rawOutput: { error: "Tool cancelled" } };
  if (result.error.classification === "permission_refused")
    return {
      ...settled,
      status: "failed",
      rawOutput: { refused: true, reason: result.error.message },
    };
  return { ...settled, status: "failed", rawOutput: { error: result.error.message } };
}
