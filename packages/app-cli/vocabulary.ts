/**
 * How each word in the record's closed vocabulary reads.
 *
 * `VOCABULARY` is collected from the schemas, so the list of words cannot
 * drift. What a word *means* to a reader is a judgement and lives here; the
 * test in `tests/cli/vocabulary.test.ts` fails when a new value arrives
 * without one.
 */

import { VOCABULARY } from "@labkit/core-domain/reports";
import type { Palette } from "./palette";

/** Which of the palette's four readings a word takes. */
export type Reading = "settled" | "contested" | "untested" | "provisional";

export const READING: Readonly<Record<string, Reading>> = {
  // It holds.
  passed: "settled",
  pass: "settled",
  satisfied: "settled",
  established: "settled",
  answered: "settled",
  supported: "settled",
  supports: "settled",
  agrees: "settled",
  corroboration: "settled",
  confirmatory: "settled",
  "carried-out": "settled",
  observed: "settled",

  // Evidence bears against it.
  failed: "contested",
  fail: "contested",
  blocked: "contested",
  challenged: "contested",
  challenges: "contested",
  disagrees: "contested",
  contradiction: "contested",
  "standard-unmet": "contested",

  // Nothing has looked.
  "never-run": "untested",
  "never-evaluated": "untested",
  "no-standing-verdict": "untested",
  untested: "untested",
  unexamined: "untested",
  unresolved: "untested",
  undecided: "untested",
  unattributed: "untested",
  incomplete: "untested",
  planned: "untested",
  waiting: "untested",
  "unrecorded-in-the-original": "untested",
  "not-used-by-the-re-run": "untested",

  // Answered, but qualified.
  provisional: "provisional",
  accepted: "provisional",
  abandoned: "provisional",
  withdrawn: "provisional",
  closed: "provisional",
  exploratory: "provisional",
  "drawn-across": "provisional",
  claimed: "provisional",
  changed: "provisional",
  sharpened: "provisional",
  noted: "provisional",
  mechanical: "provisional",
  scientific: "provisional",
  prespecification: "provisional",
  dissociation: "provisional",
  raises: "provisional",
  lowers: "provisional",
};

/**
 * The words safe to colour wherever they appear.
 *
 * The rest have a reading but are left alone: `no`, `pass`, `changed`,
 * `supports` and their like turn up in ordinary sentences, and painting one
 * red told the reader a gate's description was a verdict.
 */
const IN_RUNNING_TEXT = new Set([
  "passed",
  "failed",
  "blocked",
  "satisfied",
  "never-run",
  "never-evaluated",
  "no-standing-verdict",
  "established",
  "provisional",
  "unresolved",
  "untested",
  "unexamined",
  "abandoned",
  "withdrawn",
  "challenged",
  "undecided",
  "closed",
  "carried-out",
  "incomplete",
  "exploratory",
  "confirmatory",
  "drawn-across",
  "standard-unmet",
  "unattributed",
]);

const WORDS = [...IN_RUNNING_TEXT]
  .sort((a, b) => b.length - a.length)
  .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const SPOKEN = new RegExp(`(?<![A-Za-z-])(${WORDS})(?![A-Za-z-])`, "g");

/**
 * Colours the record's own words in a rendered report.
 *
 * Once here rather than in each view: `work` coloured none of its twelve and
 * `gates` one of six. Applied to the text, never to a value — a view still
 * switches on `verdict`, and painting the value broke the lookup.
 */
export function colourVocabulary(text: string, p: Palette): string {
  const parts = text.split(new RegExp(`(${String.fromCharCode(27)}\\[[0-9;]*m)`));
  // A word inside a run the view already coloured is left alone. Painting it
  // nests a reset in the middle, and the rest of that phrase loses its colour.
  let inside = false;
  return parts
    .map((part, i) => {
      if (i % 2 === 1) {
        inside = !RESET.test(part);
        return part;
      }
      return inside ? part : part.replace(SPOKEN, (word) => p[READING[word] as Reading](word));
    })
    .join("");
}

/** The sequences that end a run rather than start one. */
const RESET = new RegExp(`^${String.fromCharCode(27)}\\[(?:0|22|23|24|27|28|29|39|49)m$`);
