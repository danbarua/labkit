import type { Cost, ToolCallStatus } from "@agentclientprotocol/sdk";

export type DiffLine = { readonly kind: "same" | "add" | "remove"; readonly text: string };

/** Beyond this many line pairs a diff is drawn as a plain removal and addition. */
const DIFF_CELL_LIMIT = 4_000_000;

const linesOf = (text: string): string[] => {
  if (text === "") return [];
  const lines = text.split("\n");
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
};

/** A diff as drawn: lines, with each long unchanged stretch folded away. */
export type DiffRow =
  | { readonly kind: "line"; readonly line: DiffLine; readonly at: number }
  | { readonly kind: "fold"; readonly from: number; readonly lines: readonly DiffLine[] };

/** Unchanged lines kept in view on each side of a change. */
export const DIFF_CONTEXT = 3;

/** A stretch shorter than this stays in view: a fold row would hide almost nothing. */
const FOLD_AT_LEAST = 4;

/**
 * A diff with each stretch of unchanged lines more than `context` away from any change folded
 * into one row, which keeps the lines it hides and where they start.
 */
export function foldUnchanged(lines: readonly DiffLine[], context = DIFF_CONTEXT): DiffRow[] {
  const near = lines.map(() => false);
  lines.forEach((line, i) => {
    if (line.kind === "same") return;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++)
      near[j] = true;
  });
  const rows: DiffRow[] = [];
  let i = 0;
  while (i < lines.length) {
    if (near[i] || lines[i]?.kind !== "same") {
      rows.push({ kind: "line", line: lines[i] as DiffLine, at: i });
      i++;
      continue;
    }
    let end = i;
    while (end < lines.length && !near[end]) end++;
    const hidden = lines.slice(i, end);
    if (hidden.length >= FOLD_AT_LEAST) rows.push({ kind: "fold", from: i, lines: hidden });
    else rows.push(...hidden.map((line, j): DiffRow => ({ kind: "line", line, at: i + j })));
    i = end;
  }
  return rows;
}

/** A line diff by longest common subsequence: what stayed, what went, what was added. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = linesOf(before);
  const b = linesOf(after);
  if (a.length * b.length > DIFF_CELL_LIMIT) {
    return [
      ...a.map((text): DiffLine => ({ kind: "remove", text })),
      ...b.map((text): DiffLine => ({ kind: "add", text })),
    ];
  }

  // lengths[i][j]: the common subsequence length of a[i..] and b[j..].
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lengths[i] as number[];
      const below = lengths[i + 1] as number[];
      row[j] =
        a[i] === b[j]
          ? (below[j + 1] as number) + 1
          : Math.max(below[j] as number, row[j + 1] as number);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] as string });
      i++;
      j++;
    } else if (
      ((lengths[i + 1] as number[])[j] as number) >= ((lengths[i] as number[])[j + 1] as number)
    ) {
      out.push({ kind: "remove", text: a[i] as string });
      i++;
    } else {
      out.push({ kind: "add", text: b[j] as string });
      j++;
    }
  }
  for (; i < a.length; i++) out.push({ kind: "remove", text: a[i] as string });
  for (; j < b.length; j++) out.push({ kind: "add", text: b[j] as string });
  return out;
}

export const STATUS_LABEL: Record<ToolCallStatus, string> = {
  pending: "Pending",
  in_progress: "Running",
  completed: "Done",
  failed: "Failed",
};

export function formatCost(cost: Cost): string {
  const symbol = cost.currency === "USD" ? "$" : `${cost.currency} `;
  return `${symbol}${cost.amount.toFixed(2)}`;
}

/** How full a context window is, as a whole percentage held between 0 and 100. */
export function fillPercent(used: number, size: number): number {
  if (size <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / size) * 100)));
}
