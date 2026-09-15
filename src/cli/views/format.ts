/**
 * The shared shapes every view is built out of.
 */

import type { IdentifiedArtefact, QuestionStanding } from "../../domain";
import type { Palette } from "../palette";

export function bullets(items: string[], empty: string): string {
  return items.length === 0 ? `  ${empty}` : items.map((i) => `  - ${i}`).join("\n");
}

/**
 * Questions, each with its handle.
 */
export function questionLines(questions: QuestionStanding[]): string[] {
  return questions.map((q) => `${q.asks}  ${`(${q.question})`}`);
}

export function partLine(a: IdentifiedArtefact, p: Palette): string {
  // `invalidated` is contested rather than quiet: the record has actively
  // withdrawn this part, which is a finding and not an absence.
  const flag = a.invalidated ? `  ${p.contested("invalidated")}` : "";
  return `${a.name}  ${`(${a.part})`}${flag}`;
}

/** Terminal width to lay a report out in, clamped so it stays readable. */
export function width(): number {
  const columns = process.stdout.columns ?? 0;
  if (columns === 0) return 100;
  return Math.max(60, Math.min(columns, 120));
}

/**
 * "3 hours ago", "6 days ago" — how long since an ISO instant, against wall-clock now.
 *
 * A blocked gate's own detail already prints the date next to each condition; this is what a
 * summary list needed instead, so a reader can tell a gate nothing has touched in a week from
 * one a check ran against yesterday, without doing the subtraction themselves.
 */
export function relativeAge(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const ms = now.getTime() - then;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** Visible length, ignoring the colour a palette already applied. */
const bare = (text: string): string => text.replace(ANSI, "");

/**
 * One long field, cut to its first sentence and a budget.
 *
 * A summary view names a record and says where it stands. A reason running to
 * 1,300 characters buries every other line in the report; `why <handle>`
 * carries the whole of it.
 */
export function gist(text: string, budget = 180): string {
  const trimmed = text.trim();
  if (trimmed.length <= budget) return trimmed;
  const stop = trimmed.slice(0, budget).search(/[.!?](\s|$)/);
  if (stop > 40) return trimmed.slice(0, stop + 1);
  // No sentence ends inside the budget, so cut at the last whole word.
  const head = trimmed.slice(0, budget);
  const space = head.lastIndexOf(" ");
  return `${(space > 40 ? head.slice(0, space) : head).trimEnd()}...`;
}

/**
 * Wraps to the terminal, keeping a wrapped line under its own first indent.
 *
 * Splits on the bare text so a colour escape is never counted as a column and
 * never cut in half.
 */
export function wrap(text: string, columns = width()): string {
  return text
    .split("\n")
    .flatMap((line) => {
      if (bare(line).length <= columns) return [line];
      // Broken at a space rather than rebuilt from words, so the runs of
      // spaces the list views align their columns with survive. The remainder
      // sits two inside the line's own indent, so a bullet's continuation
      // cannot read as a sibling bullet.
      const lead = bare(line).match(/^\s*(?:- )?/)?.[0] ?? "";
      const indent = " ".repeat(hangAt(bare(line), lead));
      const out: string[] = [];
      let rest = line;
      while (bare(rest).length > columns) {
        const at = lastSpaceWithin(rest, columns);
        if (at <= lead.length) break;
        out.push(rest.slice(0, at));
        rest = indent + rest.slice(at + 1).replace(/^ +/, "");
      }
      out.push(rest);
      return out;
    })
    .join("\n");
}

/**
 * The column a wrapped remainder starts at, so it reads as the same row.
 *
 * Under the text of a list row (`blocked  GATE_2  the prose`), under the value
 * of a labelled line (`accepted because: the reason`), and otherwise under the
 * line's own first character.
 */
function hangAt(line: string, lead: string): number {
  const columns = line.match(/^\s*(?:- )?(?:\S+ {2,})+/)?.[0];
  if (columns) return columns.length;
  // A short leading label only. Prose that happens to contain a colon is not
  // a label, and hanging the remainder under it reads as a column that is not
  // there.
  const label = line.match(/^\s*(?:- )?[A-Za-z][A-Za-z ]{0,22}: /)?.[0];
  if (label) return label.length;
  return lead.length;
}

/** Index of the last space inside the first `columns` VISIBLE characters. */
function lastSpaceWithin(line: string, columns: number): number {
  let visible = 0;
  let space = -1;
  for (let i = 0; i < line.length; i += 1) {
    const skip = new RegExp(`^${String.fromCharCode(27)}\\[[0-9;]*m`).exec(line.slice(i));
    if (skip) {
      i += skip[0].length - 1;
      continue;
    }
    if (visible >= columns) break;
    if (line[i] === " ") space = i;
    visible += 1;
  }
  return space;
}

/** `Q_1`, `CLM_4`, `GATE_2` — what the next command takes. */
const HANDLE = /\b[A-Z][A-Z]*_\d+\b/g;

/** Output that is only handles, one per line: what `$(labkit pose ...)` reads. */
const ONLY_HANDLES = /^(?:[A-Z][A-Z]*_\d+\n?)+$/;

/**
 * Colours every handle in a rendered report.
 *
 * Once here rather than in each view, because a view that forgot left the
 * handle plain and no two reports agreed. Skipped when the whole output is
 * bare handles, which is what a write command answers with and what command
 * substitution reads.
 */
export function colourHandles(text: string, paint: (t: string) => string): string {
  if (ONLY_HANDLES.test(text)) return text;
  // Between the escapes, never across one. A colour sequence ends in `m`, a
  // word character, so a `\b` right after it does not match and the handle
  // beside an already-coloured word was left plain.
  return text
    .split(new RegExp(`(${String.fromCharCode(27)}\\[[0-9;]*m)`))
    .map((part, i) => (i % 2 === 1 ? part : part.replace(HANDLE, (handle) => paint(handle))))
    .join("");
}
