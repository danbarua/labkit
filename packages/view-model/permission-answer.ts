import type { PermissionOption, PermissionOptionKind, ToolCall } from "@agentclientprotocol/sdk";

/**
 * The `_meta` key of a `tool_call_update` under which labkit's agent sends the option a call's
 * permission answer picked. ACP has no field for it, and a loaded session asks no question.
 */
export const PERMISSION_ANSWER_KEY = "labkit.dev/permission";

/** The option an answer picked, as the agent names it. */
export type AnsweredOption = Pick<PermissionOption, "optionId" | "name" | "kind">;

/** Every kind of option ACP defines; a kind that ACP adds is a compile error here. */
const OPTION_KINDS = {
  allow_once: true,
  allow_always: true,
  reject_once: true,
  reject_always: true,
} satisfies Record<PermissionOptionKind, true>;

const isOptionKind = (kind: unknown): kind is PermissionOptionKind =>
  typeof kind === "string" && Object.hasOwn(OPTION_KINDS, kind);

/** The `_meta` objects already reported, so that a card drawn again does not warn again. */
const reported = new WeakSet<object>();

/**
 * Returns the option that a call's permission answer picked, as the agent recorded it in the call's
 * `_meta` (`PERMISSION_ANSWER_KEY`), sent live and when the session is loaded alike. Returns
 * `undefined` when the call carries no answer. A value that is not `{ optionId, name, kind }` with a
 * kind ACP defines is logged as a warning, once per `_meta`, and `undefined` is returned.
 */
export function recordedAnswer(call: ToolCall): AnsweredOption | undefined {
  const meta = call._meta;
  if (meta === undefined || meta === null || !Object.hasOwn(meta, PERMISSION_ANSWER_KEY))
    return undefined;
  const value = meta[PERMISSION_ANSWER_KEY];
  if (typeof value === "object" && value !== null) {
    const { optionId, name, kind } = value as Record<string, unknown>;
    if (typeof optionId === "string" && typeof name === "string" && isOptionKind(kind))
      return { optionId, name, kind };
  }
  if (!reported.has(meta)) {
    reported.add(meta);
    console.warn(
      `tool call ${call.toolCallId}: _meta["${PERMISSION_ANSWER_KEY}"] is not { optionId, name, kind }; the call is drawn with no recorded answer`,
      { toolCallId: call.toolCallId, value },
    );
  }
  return undefined;
}
