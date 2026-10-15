import { useMemo, useState } from "react";
import { type DiffLine, type DiffRow, diffLines, foldUnchanged } from "./diff-rows";

/**
 * A diff of one file: its lines, marked added or removed, with each long unchanged stretch folded
 * into a row that opens it, and a patch's hunk headers and notes where it has them. With
 * `preview`, only its first `preview` rows show until the rest is asked for.
 */
export function DiffView({
  path,
  title,
  rows,
  caption = true,
  preview,
}: {
  path: string;
  /** The hover text of the path: the file's full path, when `path` is a shorter name for it. */
  title?: string;
  rows: readonly DiffRow[];
  /** Whether the path is shown above the lines, as when no card around the diff names it. */
  caption?: boolean;
  preview?: number;
}) {
  // Folds the reader has opened, by where their hidden lines start.
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set());
  const [whole, setWhole] = useState(false);
  const marker = { same: "  ", add: "+ ", remove: "- " } as const;
  const line = (l: DiffLine, key: string) => (
    <code key={key} className={`lk-diff-line ${l.kind}`}>
      {marker[l.kind] + l.text}
    </code>
  );
  // A diff has no ids: the same text can appear on many lines, so lines are keyed by where they
  // stand in it.
  const drawn = rows.flatMap((row) => {
    switch (row.kind) {
      case "line":
        return [line(row.line, String(row.at))];
      case "hunk":
        return [
          <code key={String(row.at)} className="lk-diff-hunk">
            {row.text}
          </code>,
        ];
      case "note":
        return [
          <div key={String(row.at)} className="lk-diff-note">
            {row.text}
          </div>,
        ];
      case "fold":
        return opened.has(row.from)
          ? row.lines.map((l, j) => line(l, String(row.from + j)))
          : [
              <button
                key={`fold:${row.from}`}
                type="button"
                className="lk-diff-fold"
                onClick={() => setOpened(new Set([...opened, row.from]))}
              >
                ⋯ {row.lines.length} unchanged lines
              </button>,
            ];
      default: {
        const unhandled: never = row;
        return unhandled;
      }
    }
  });
  const cut = preview === undefined || whole ? drawn : drawn.slice(0, preview);
  return (
    <div className="lk-diff">
      {caption ? (
        <div className="lk-diff-path" {...(title === undefined ? {} : { title })}>
          {path}
        </div>
      ) : null}
      {cut.length < drawn.length ? (
        <>
          {cut}
          <button type="button" className="lk-code-more" onClick={() => setWhole(true)}>
            Show {drawn.length - cut.length} more{" "}
            {drawn.length - cut.length === 1 ? "line" : "lines"}
          </button>
        </>
      ) : (
        drawn
      )}
    </div>
  );
}

/** The diff from `before` to `after`, the text of one file at two times. */
export function TextDiff({
  path,
  title,
  before,
  after,
}: {
  path: string;
  title?: string;
  before?: string | null;
  after: string;
}) {
  const rows = useMemo(() => foldUnchanged(diffLines(before ?? "", after)), [before, after]);
  return <DiffView path={path} {...(title === undefined ? {} : { title })} rows={rows} />;
}
