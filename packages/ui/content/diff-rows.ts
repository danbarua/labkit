export type DiffLine = { readonly kind: "same" | "add" | "remove"; readonly text: string };

/** Beyond this many line pairs a diff is drawn as a plain removal and addition. */
const DIFF_CELL_LIMIT = 4_000_000;

const linesOf = (text: string): string[] => {
  if (text === "") return [];
  const lines = text.split("\n");
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
};

/**
 * A diff as drawn: lines, with each long unchanged stretch folded away. A diff read from a patch
 * also has its hunks' headers, and notes such as "Binary files differ" in place of lines.
 */
export type DiffRow =
  | { readonly kind: "line"; readonly line: DiffLine; readonly at: number }
  | { readonly kind: "fold"; readonly from: number; readonly lines: readonly DiffLine[] }
  | { readonly kind: "hunk" | "note"; readonly text: string; readonly at: number };

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

/** A patch's header lines before its first hunk, which name the file rather than change it. */
const PATCH_HEADER =
  /^(diff --git |index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity index|rename from|rename to)/;

/**
 * One file's unified diff, as `git diff` prints it, as rows: each hunk's header, then its lines.
 * The header lines that name the file are left out. Any other line outside a hunk, and the
 * "\\ No newline at end of file" marker, is a note.
 */
export function rowsOfPatch(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let inHunk = false;
  linesOf(patch).forEach((text, at) => {
    if (text.startsWith("@@")) {
      inHunk = true;
      rows.push({ kind: "hunk", text, at });
    } else if (!inHunk) {
      if (!PATCH_HEADER.test(text)) rows.push({ kind: "note", text, at });
    } else if (text.startsWith("\\")) rows.push({ kind: "note", text, at });
    else {
      const kind = text.startsWith("+") ? "add" : text.startsWith("-") ? "remove" : "same";
      rows.push({ kind: "line", line: { kind, text: text.slice(1) }, at });
    }
  });
  return rows;
}

/**
 * A multi-file unified diff split at each `diff --git a/<old> b/<new>` line, with the file each
 * part changes: its new path, or its old one when it was deleted.
 */
export function filesOfPatch(patch: string): { path: string; patch: string }[] {
  const files: { path: string; patch: string }[] = [];
  for (const part of patch.split(/^(?=diff --git )/m)) {
    if (part.trim() === "") continue;
    const head = /^diff --git a\/(.*) b\/(.*)$/m.exec(part);
    const deleted = /^\+\+\+ \/dev\/null$/m.test(part);
    const path = head === null ? "" : deleted ? (head[1] ?? "") : (head[2] ?? "");
    files.push({ path, patch: part });
  }
  return files;
}
