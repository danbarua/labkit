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
export function questionLines(questions: QuestionStanding[], p: Palette): string[] {
  return questions.map((q) => `${q.asks}  ${p.handle(`(${q.question})`)}`);
}

export function partLine(a: IdentifiedArtefact, p: Palette): string {
  // `invalidated` is contested rather than quiet: the record has actively
  // withdrawn this part, which is a finding and not an absence.
  const flag = a.invalidated ? `  ${p.contested("invalidated")}` : "";
  return `${a.name}  ${p.handle(`(${a.part})`)}${flag}`;
}
