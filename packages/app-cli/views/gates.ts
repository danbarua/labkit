/**
 * Gates, the conditions bound to them, and the work they protect.
 */

import type { ListedGate, ListedWork } from "@labkit/core-domain";
import type { Palette } from "../palette";
import { relativeAge, rows } from "./format";

/**
 * Every gate, one per line, with its state.
 */
export function renderGateList(gates: ListedGate[], p: Palette, heading = false): string {
  const title = heading ? p.heading(`Gates — ${gates.length}`) : "";
  if (gates.length === 0) return title ? `${title}\nnothing` : "nothing";
  // One pair of columns for every row, the nested work included: a gate and
  // the work under it put their handles at the same indent, so a reader scans
  // the handle column rather than hunting it inside each line.
  // A gate and the work under it are rows of the same table, so their handles
  // land in one column and a reader scans it rather than hunting each line.
  const cells = gates.flatMap((g) => [
    // Absent for a gate no evaluation has ever reached — nothing to date.
    [
      g.state,
      g.gate,
      `${g.consequence}${g.lastTouched ? `  ${p.quiet(`(${relativeAge(g.lastTouched)})`)}` : ""}`,
    ],
    ...g.gating.map((w) => [p.quiet("holding up"), w.work, w.objective]),
  ]);
  const body = rows(cells).join("\n");
  return title ? `${title}\n${body}` : body;
}

/**
 * Every planned piece of work, one per line, with its state.
 */
export function renderWorkList(work: ListedWork[], p: Palette, heading = false): string {
  const title = heading ? p.heading(`Work — ${work.length}`) : "";
  if (work.length === 0) return title ? `${title}\nnothing` : "nothing";
  // Coloured centrally by `colourVocabulary`; `rows` does the alignment.
  const body = rows(work.map((w) => [w.state, w.work, w.objective])).join("\n");
  return title ? `${title}\n${body}` : body;
}
