import type { Block, TranscriptState } from "@labkit/view-model";
import { pendingPermissions } from "@labkit/view-model";

type ToolBlock = Extract<Block, { kind: "tool" }>;

/**
 * One item the conversation draws: a block on its own, or a run of tool calls drawn as one row.
 * `key` is the identity of its first block, so it stays the same when a block before it is removed.
 */
export type Drawn =
  | { readonly kind: "block"; readonly block: Block; readonly key: string }
  | { readonly kind: "tools"; readonly blocks: readonly ToolBlock[]; readonly key: string };

/** The block's identity, which no other block in the transcript has. */
export function keyOf(block: Block): string {
  switch (block.kind) {
    case "user":
    case "assistant":
    case "thought":
    case "notice":
      return `${block.kind}/${block.id}`;
    case "tool":
      return `tool/${block.toolCallId}`;
    case "plan":
      return `plan/${block.planId}`;
    case "elicitation":
      return `elicitation/${block.requestId}`;
    case "compaction":
      return `compaction/${block.compactionId}`;
  }
}

/** Whether a block would draw as nothing: a message whose text is only whitespace. */
const isBlank = (block: Block): boolean =>
  (block.kind === "assistant" || block.kind === "user") &&
  block.content.every((part) => part.type === "text" && part.text.trim() === "");

/**
 * The conversation's blocks, less the ones that would draw as nothing, with every run of two or more consecutive tool calls folded into one
 * item. A call waiting on the person's answer is never folded in: it breaks the run and stands
 * alone, so the question is always in view.
 */
export function drawnBlocks(state: TranscriptState): Drawn[] {
  const waiting = new Set(pendingPermissions(state).map((p) => p.request.toolCall.toolCallId));
  const out: Drawn[] = [];
  let run: [ToolBlock, ...ToolBlock[]] | undefined;
  const flush = () => {
    if (run === undefined) return;
    const key = keyOf(run[0]);
    if (run.length === 1) out.push({ kind: "block", block: run[0], key });
    else out.push({ kind: "tools", blocks: run, key });
    run = undefined;
  };
  for (const block of state.blocks) {
    if (isBlank(block)) continue;
    if (block.kind === "tool" && !waiting.has(block.toolCallId)) {
      if (run === undefined) run = [block];
      else run.push(block);
      continue;
    }
    flush();
    out.push({ kind: "block", block, key: keyOf(block) });
  }
  flush();
  return out;
}

/** How many calls each tool made, in the order the tools first appear: `read_file ×8 · list_dir`. */
export function toolTally(names: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count === 1 ? name : `${name} ×${count}`)).join(" · ");
}
