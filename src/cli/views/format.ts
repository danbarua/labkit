/**
 * The shared shapes every view is built out of.
 *
 * Small on purpose. A view module owns how one report reads; this owns the
 * conventions that make eighteen of them look like one program — a bullet
 * list, an id shown only where it disambiguates, an input line that says
 * whether the record has since invalidated it.
 */

import type { IdentifiedArtefact, QuestionStanding } from "../../domain";
import type { Palette } from "../palette";

export function bullets(items: string[], empty: string): string {
  return items.length === 0 ? `  ${empty}` : items.map((i) => `  - ${i}`).join("\n");
}

/**
 * Questions, each with its handle.
 *
 * **The handle prints on every row, not only on a wording collision.**
 * Printing it only when two questions are worded alike reasons from
 * *ambiguity*, and that is not what a handle is for. A handle is what the
 * **next command takes** — `labkit why`, `labkit pursuits`, `labkit enquiry` all
 * require one, and `labkit known` was the only way to reach a question at all.
 * A row a reader cannot act on is not less noisy for being shorter; it is
 * useless, and the fix was to re-run the command as `--json` to recover what
 * the prose view had dropped.
 *
 * Every other view in `src/cli/views/` prints handles unconditionally. This one
 * was the outlier, and the collision case is still served — two identical
 * sentences now differ by the handle beside each.
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
