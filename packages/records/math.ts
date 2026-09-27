/**
 * Math in prose, such as `z_o = mean_{i in o}`. A missed span is preferred to a false one.
 *  - A handle (`Q_1`, `NOTE_20`) is never an atom.
 *  - A snake_case word ending in a whole English word (`window_size`) is prose; a digit, one or two
 *    letters, or a spelled-out Greek letter as the suffix is kept.
 *  - `-` and `+` do not join atoms, so `cos(phase_o - phase_o')` is not found whole. A single space
 *    with no operator does join.
 */

const MATH_ATOM =
  /[a-zA-Z]+_\{[^{}]{1,20}\}|[a-zA-Z]+_[a-zA-Z0-9]+'?|[a-zA-Z]{1,10}\([^()]{0,40}\)|\|[a-zA-Z0-9_.*+\-\s()',]{1,30}\|/g;
const MATH_GLUE = /\s*[=*^]\s*|\s*\/\s*/y;
const HANDLE_SHAPE = /^[A-Z]{1,6}_\d+'?$/;
const GREEK = new Set([
  "alpha",
  "beta",
  "gamma",
  "delta",
  "omega",
  "sigma",
  "theta",
  "lambda",
  "phi",
  "mu",
]);

function looksEnglish(atom: string): boolean {
  const m = /^([a-zA-Z]+)_([a-zA-Z0-9]+)'?$/.exec(atom);
  if (!m) return false;
  const [, head, tail] = m as unknown as [string, string, string];
  if (/^\d+$/.test(tail) || tail.length <= 2) return false;
  return !(GREEK.has(tail) || GREEK.has(head));
}

function isMathAtom(atom: string): boolean {
  if (HANDLE_SHAPE.test(atom)) return false;
  if (atom.startsWith("|") || atom.includes("(")) return true;
  return !looksEnglish(atom);
}

/** Non-overlapping `[start, end)` ranges of math notation in `text`, earliest first. */
export function findMathSpans(text: string): [start: number, end: number][] {
  const atomAt = (i: number): RegExpExecArray | null => {
    MATH_ATOM.lastIndex = i;
    const m = MATH_ATOM.exec(text);
    return m && m.index === i && isMathAtom(m[0]) ? m : null;
  };

  const spans: [number, number][] = [];
  let i = 0;
  while (i < text.length) {
    const first = atomAt(i);
    if (!first) {
      i++;
      continue;
    }
    let end = first.index + first[0].length;
    let count = 1;
    for (;;) {
      MATH_GLUE.lastIndex = end;
      const glue = MATH_GLUE.exec(text);
      const next = atomAt(glue ? glue.index + glue[0].length : end);
      if (next) {
        end = next.index + next[0].length;
        count++;
        continue;
      }
      const spaced = !glue && text[end] === " " ? atomAt(end + 1) : null;
      if (spaced) {
        end = spaced.index + spaced[0].length;
        count++;
        continue;
      }
      break;
    }
    if (count >= 2) spans.push([first.index, end]);
    i = Math.max(end, i + 1);
  }
  return spans;
}
