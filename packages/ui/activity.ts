import { phase, type TranscriptState } from "@labkit/view-model";
import type { LoaderMood } from "./loader";
import { inputPreview } from "./value";

/** What the agent is doing now, for the indicator under the transcript. */
export type Activity =
  | { readonly kind: "waiting" }
  | { readonly kind: "tool"; readonly label: string }
  | { readonly kind: "thinking" }
  | { readonly kind: "working" }
  | { readonly kind: "speaking" };

/**
 * What a running turn is doing: waiting for the first word after the person's prompt, speaking
 * while answer text is the last block, the tool call it is waiting on (the latest one in this turn
 * not yet settled), thinking while a thought is the last block, else working. Nothing when the
 * turn is idle or waiting on the person (the question says so).
 */
export function currentActivity(state: TranscriptState): Activity | undefined {
  if (phase(state) !== "running") return undefined;
  const last = state.blocks.at(-1);
  if (last?.kind === "user") return { kind: "waiting" };
  if (last?.kind === "assistant") return { kind: "speaking" };
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

/** How long the stream may stay quiet before the indicator says it is waiting again. */
export const PAUSE_MS = 1500;

/**
 * An activity seen after the stream has gone quiet. Thinking or speaking that has paused is waiting
 * on the model's provider again, until more arrives. A running tool, or work between steps, is
 * left as it is: no stream is expected while a tool runs.
 */
export const afterPause = (activity: Activity | undefined, quiet: boolean): Activity | undefined =>
  quiet && (activity?.kind === "thinking" || activity?.kind === "speaking")
    ? { kind: "waiting" }
    : activity;

/** The indicator's words for an activity. While the agent speaks, its words say so. */
export function activityLabel(activity: Activity): string | undefined {
  switch (activity.kind) {
    case "waiting":
      return "Waiting for a reply";
    case "tool":
      return activity.label;
    case "thinking":
      return "Thinking";
    case "working":
      return "Working";
    case "speaking":
      return undefined;
  }
}

/** The loader's mood for an activity. */
export const activityMood = (activity: Activity): LoaderMood =>
  activity.kind === "waiting" ? "waiting" : activity.kind === "speaking" ? "speaking" : "working";
