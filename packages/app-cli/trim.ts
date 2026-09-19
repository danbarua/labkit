/**
 * Trimming prose for a summary view.
 *
 * `Prose` is a string at runtime, so a view cannot tell a note's 2,000 words
 * from a gate's state. The schemas mark which fields are prose; this walks a
 * report and cuts the marked ones to their first paragraph, naming the command
 * that reads the whole of it.
 */

import { IDENTITY_FIELDS, PROSE_FIELDS } from "../core-domain/reports";
import type { Palette } from "./palette";

/** How much prose a summary keeps before it starts costing the reader. */
const BUDGET = 240;

const HANDLE = /^[A-Z]+_\d+$/;

/** The handle a trimmed field belongs to, from whatever sits beside it. */
function handleBeside(record: Record<string, unknown>): string | undefined {
  for (const value of Object.values(record))
    if (typeof value === "string" && HANDLE.test(value)) return value;
  return undefined;
}

function cut(text: string, handle: string | undefined): string {
  const paragraph = text.split(/\n\s*\n/)[0]?.trim() ?? text;
  const keep = paragraph.length <= BUDGET ? paragraph : sentenceOrWord(paragraph);
  if (keep.length >= text.trim().length) return text;
  const dropped = text.trim().slice(keep.length).split(/\s+/).filter(Boolean).length;
  const where = handle ? `\`labkit why ${handle}\` reads it` : "`--json` has the whole";
  return `${keep} (${dropped} more words — ${where})`;
}

function sentenceOrWord(text: string): string {
  const stop = text.slice(0, BUDGET).search(/[.!?](\s|$)/);
  if (stop > 60) return text.slice(0, stop + 1);
  const head = text.slice(0, BUDGET);
  const space = head.lastIndexOf(" ");
  return (space > 60 ? head.slice(0, space) : head).trimEnd();
}

/**
 * A copy of `report` ready for a person to read.
 *
 * Prose is cut to its first paragraph. An instant and an outside identity are
 * both context rather than the finding, so they recede: the schemas say which
 * fields are which, and no view has to know.
 */
export function forReading<T>(report: T, p: Palette): T {
  if (Array.isArray(report)) return report.map((item) => forReading(item, p)) as unknown as T;
  if (report === null || typeof report !== "object") return report;
  const record = report as Record<string, unknown>;
  const handle = handleBeside(record);
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(record)) {
    if (typeof value !== "string") out[name] = forReading(value, p);
    else if (PROSE_FIELDS.has(name)) out[name] = cut(value, handle);
    else if (IDENTITY_FIELDS.has(name)) out[name] = p.quiet(value);
    else out[name] = value;
  }
  return out as T;
}
