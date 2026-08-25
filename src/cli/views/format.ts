/**
 * The shared shapes every view is built out of.
 *
 * Small on purpose. A view module owns how one report reads; this owns the
 * conventions that make eighteen of them look like one program — a bullet
 * list, an id shown only where it disambiguates, an input line that says
 * whether the record has since invalidated it.
 */

import type { IdentifiedArtefact, QuestionStanding } from "../../domain";

export function bullets(items: string[], empty: string): string {
  return items.length === 0 ? `  ${empty}` : items.map((i) => `  - ${i}`).join("\n");
}

/**
 * Questions, with their id shown **only when wording alone cannot tell two
 * apart**.
 *
 * LabKit deliberately allows two distinct questions to carry identical words
 * (S-1), so a survey printed as bare sentences can show two bullets a reader
 * cannot distinguish. Showing every id all the time would put a `Q_41` on
 * every line of the common case, where nothing is ambiguous; showing it on
 * collision puts it exactly where it carries information.
 */
export function questionLines(questions: QuestionStanding[], all: QuestionStanding[]): string[] {
  const counts = new Map<string, number>();
  for (const q of all) counts.set(q.asks, (counts.get(q.asks) ?? 0) + 1);
  return questions.map((q) => (counts.get(q.asks)! > 1 ? `${q.asks}  [${q.question}]` : q.asks));
}

export function allOf(survey: { [k: string]: unknown }): QuestionStanding[] {
  return Object.values(survey)
    .filter((v): v is QuestionStanding[] => Array.isArray(v))
    .flat();
}

export function partLine(a: IdentifiedArtefact): string {
  return `${a.name}  (${a.part})${a.invalidated ? "  invalidated" : ""}`;
}
