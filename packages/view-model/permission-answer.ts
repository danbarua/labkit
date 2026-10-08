import type { PermissionOptionKind, ToolCall } from "@agentclientprotocol/sdk";

/**
 * The `_meta` key of a `tool_call_update` under which labkit's agent sends the outcome of a call's
 * permission request. ACP has no field for it, and a loaded session asks no question.
 */
export const PERMISSION_ANSWER_KEY = "labkit.dev/permission";

/**
 * A permission request's outcome as ACP's `RequestPermissionOutcome` gives it. A `selected` outcome
 * also carries the option's `name` and `kind` when the question offered that option, since a
 * replayed call has no question to look the option up in.
 */
export type RecordedOutcome =
  | { readonly outcome: "cancelled" }
  | {
      readonly outcome: "selected";
      readonly optionId: string;
      readonly name?: string;
      readonly kind?: PermissionOptionKind;
    };

/** Every kind of option ACP defines; a kind that ACP adds is a compile error here. */
const OPTION_KINDS = {
  allow_once: true,
  allow_always: true,
  reject_once: true,
  reject_always: true,
} satisfies Record<PermissionOptionKind, true>;

const isOptionKind = (kind: unknown): kind is PermissionOptionKind =>
  typeof kind === "string" && Object.hasOwn(OPTION_KINDS, kind);

const outcomeIn = (value: unknown): RecordedOutcome | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const { outcome, optionId, name, kind } = value as Record<string, unknown>;
  if (outcome === "cancelled") return { outcome };
  if (outcome !== "selected" || typeof optionId !== "string") return undefined;
  if (name !== undefined && typeof name !== "string") return undefined;
  if (kind !== undefined && !isOptionKind(kind)) return undefined;
  return {
    outcome,
    optionId,
    ...(name === undefined ? {} : { name }),
    ...(kind === undefined ? {} : { kind }),
  };
};

/** The `_meta` objects already reported, so that a card drawn again does not warn again. */
const reported = new WeakSet<object>();

/**
 * Returns the outcome of a call's permission request, as the agent recorded it in the call's
 * `_meta` (`PERMISSION_ANSWER_KEY`), sent live and when the session is loaded alike. Returns
 * `undefined` when the call carries no outcome. A value that is not a `RecordedOutcome` is logged
 * as a warning, once per `_meta`, and `undefined` is returned.
 */
export function recordedAnswer(call: ToolCall): RecordedOutcome | undefined {
  const meta = call._meta;
  if (meta === undefined || meta === null || !Object.hasOwn(meta, PERMISSION_ANSWER_KEY))
    return undefined;
  const value = meta[PERMISSION_ANSWER_KEY];
  const outcome = outcomeIn(value);
  if (outcome !== undefined) return outcome;
  if (!reported.has(meta)) {
    reported.add(meta);
    console.warn(
      `tool call ${call.toolCallId}: _meta["${PERMISSION_ANSWER_KEY}"] is not ACP's RequestPermissionOutcome; the call is drawn with no recorded outcome`,
      { toolCallId: call.toolCallId, value },
    );
  }
  return undefined;
}
