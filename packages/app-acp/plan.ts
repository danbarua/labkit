import { defineTool } from "@labkit/core-agent";
import { z } from "zod";

export const PlanEntriesSchema = z
  .array(
    z.strictObject({
      content: z.string().min(1).max(4096),
      priority: z.enum(["high", "medium", "low"]),
      status: z.enum(["pending", "in_progress", "completed"]),
    }),
  )
  .max(128)
  .refine(
    (entries) => Buffer.byteLength(JSON.stringify(entries)) <= 64 * 1024,
    "Plan exceeds 64 KiB",
  );
export type PlanEntries = z.infer<typeof PlanEntriesSchema>;
export type PlanSink = (entries: PlanEntries, signal: AbortSignal) => void | Promise<void>;

/** A saved result of a plan tool; the result is the published plan, so load replays it. */
export const PlanResultSchema = z.object({ entries: PlanEntriesSchema });

const planTools = new WeakSet<object>();

/** Whether a bound tool was made by `planTool`, whatever name the host bound it under. */
export function isPlanTool(tool: unknown) {
  return typeof tool === "object" && tool !== null && planTools.has(tool);
}

/** The entire plan is replaced on each call; status is explicit model data, not inferred execution. */
export function planTool(publish: PlanSink) {
  const tool = defineTool({
    description:
      "Publish the complete task plan and current progress. Send every entry on every update; omitted entries are removed. Use pending, in_progress, or completed and high, medium, or low priority. An empty list clears the plan. This display does not execute or authorize any step.",
    kind: "think",
    input: z.object({ entries: PlanEntriesSchema }),
    run: ({ entries }, signal) => {
      signal.throwIfAborted();
      try {
        void Promise.resolve(publish(structuredClone(entries), signal)).catch(() => {});
      } catch {
        /* Display callbacks cannot change the tool outcome. */
      }
      return { entries };
    },
  });
  planTools.add(tool);
  return tool;
}
