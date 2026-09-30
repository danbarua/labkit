import { phase, type TranscriptState } from "@labkit/view-model";
import { inputPreview } from "./value";

/** What the agent is doing now, for the indicator under the transcript. */
export type Activity =
  | { readonly kind: "tool"; readonly label: string }
  | { readonly kind: "thinking" }
  | { readonly kind: "working" };

/**
 * What a running turn is doing: the tool call it is waiting on (the latest one in this turn not
 * yet settled), else thinking while a thought is the last block, else working. Nothing when the
 * turn is idle, when it is waiting on the person (the question says so), or while answer text is
 * arriving (the text says so).
 */
export function currentActivity(state: TranscriptState): Activity | undefined {
  if (phase(state) !== "running") return undefined;
  const last = state.blocks.at(-1);
  if (last?.kind === "assistant") return undefined;
  // Only this turn's calls: one left unsettled in an earlier turn is not what is happening now.
  for (const block of [...state.blocks].reverse()) {
    if (block.kind === "user") break;
    if (block.kind !== "tool") continue;
    const call = state.toolCalls[block.toolCallId];
    if (call === undefined || (call.status !== "pending" && call.status !== "in_progress"))
      continue;
    const name = call.name ?? call.title;
    const preview = call.rawInput === undefined ? undefined : inputPreview(call.rawInput);
    return { kind: "tool", label: preview === undefined ? name : `${name} ${preview}` };
  }
  return last?.kind === "thought" ? { kind: "thinking" } : { kind: "working" };
}

/** The indicator's words for an activity. */
export function activityLabel(activity: Activity): string {
  return activity.kind === "tool"
    ? activity.label
    : activity.kind === "thinking"
      ? "Thinking"
      : "Working";
}
