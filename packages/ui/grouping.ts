import type { Block, TranscriptState } from "@labkit/view-model";
import { pendingPermissions } from "@labkit/view-model";

type ToolBlock = Extract<Block, { kind: "tool" }>;

/** One item the conversation draws: a block on its own, or a run of tool calls drawn as one row. */
export type Drawn =
  | { readonly kind: "block"; readonly block: Block; readonly index: number }
  | { readonly kind: "tools"; readonly blocks: readonly ToolBlock[]; readonly index: number };

/**
 * The conversation's blocks with every run of two or more consecutive tool calls folded into one
 * item. A call waiting on the person's answer is never folded in: it breaks the run and stands
 * alone, so the question is always in view.
 */
export function drawnBlocks(state: TranscriptState): Drawn[] {
  const waiting = new Set(pendingPermissions(state).map((p) => p.request.toolCall.toolCallId));
  const out: Drawn[] = [];
  let run: { blocks: ToolBlock[]; index: number } | undefined;
  const flush = () => {
    if (run === undefined) return;
    if (run.blocks.length === 1)
      out.push({ kind: "block", block: run.blocks[0] as ToolBlock, index: run.index });
    else out.push({ kind: "tools", blocks: run.blocks, index: run.index });
    run = undefined;
  };
  state.blocks.forEach((block, index) => {
    if (block.kind === "tool" && !waiting.has(block.toolCallId)) {
      if (run === undefined) run = { blocks: [], index };
      run.blocks.push(block);
      return;
    }
    flush();
    out.push({ kind: "block", block, index });
  });
  flush();
  return out;
}

/** How many calls each tool made, in the order the tools first appear: `read_file ×8 · list_dir`. */
export function toolTally(names: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count === 1 ? name : `${name} ×${count}`)).join(" · ");
}
