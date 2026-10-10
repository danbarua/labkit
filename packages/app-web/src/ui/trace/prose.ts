/**
 * Prose in a property value, split into what is drawn differently: handles (`Q_1`, `CLM_23`) that
 * become chips, and runs of mathematical notation.
 */

import { type HeldIndex, shortId } from "./hal";

// A run of math notation: |z_o|, cos(x), z_o = mean_{i in o}, d(loss)/d(K_2), and the like,
// glued by `= * ^ /`. The rules favour precision over recall:
//  - a labkit handle (Q_1, NOTE_20) is never a math atom, though it is shaped like one;
//  - a snake_case word whose suffix is a whole English word (window_size, manual_seed) is prose;
//    a suffix that is a digit, one or two letters, or a spelled-out Greek letter is kept;
//  - `-` and `+` are not glue, since a regex cannot tell them from a hyphen, a dash or "->".
//    Bare adjacency (one space, no operator) glues once, which catches `z_o conj(z_o')`.
const MATH_ATOM =
  /[a-zA-Z]+_\{[^{}]{1,20}\}|[a-zA-Z]+_[a-zA-Z0-9]+'?|[a-zA-Z]{1,10}\([^()]{0,40}\)|\|[a-zA-Z0-9_.*+\-\s()',]{1,30}\|/g;
const MATH_GLUE = /\s*[=*^]\s*|\s*\/\s*/y;
const HANDLE_SHAPE = /^[A-Z]{1,6}_\d+'?$/;
const HANDLE = /\b[A-Z]{1,6}_\d+\b/g;
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
  const head = m[1] ?? "";
  const tail = m[2] ?? "";
  if (/^\d+$/.test(tail) || tail.length <= 2) return false;
  return !(GREEK.has(tail) || GREEK.has(head));
}

function isMathAtom(atom: string): boolean {
  if (HANDLE_SHAPE.test(atom)) return false;
  if (atom.startsWith("|") || atom.includes("(")) return true;
  return !looksEnglish(atom);
}

/** Non-overlapping [start, end) ranges of math notation in `text`, earliest first. */
export function findMathSpans(text: string): [number, number][] {
  const atomAt = (i: number) => {
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

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "math"; text: string }
  /** A handle that names a resource the page holds, under `key`. */
  | { kind: "mention"; text: string; key: string; type: string | undefined }
  /** A handle shaped like one the page holds, that names nothing the page holds. */
  | { kind: "unknown"; text: string };

/**
 * `text` as segments. A handle-shaped word counts as a handle only when its prefix starts the
 * handle of some resource the page holds, which leaves K_1 or A_2 in mathematical prose alone. A
 * handle names the resource held under one of `bases`, the directories it may sit in, tried in order.
 */
export function proseSegments(text: string, held: HeldIndex, bases: string[]): Segment[] {
  const prefixes = new Set<string>();
  for (const key of held.keys()) prefixes.add(shortId(key).split("_")[0] ?? "");
  const math = findMathSpans(text);
  const out: Segment[] = [];
  let last = 0;
  let mathIdx = 0;
  const plain = (to: number) => {
    if (to > last) out.push({ kind: "text", text: text.slice(last, to) });
  };
  const mathBefore = (limit: number) => {
    while (mathIdx < math.length && (math[mathIdx]?.[1] ?? 0) <= limit) {
      const [s, e] = math[mathIdx] ?? [0, 0];
      if (s >= last) {
        plain(s);
        out.push({ kind: "math", text: text.slice(s, e) });
        last = e;
      }
      mathIdx++;
    }
  };
  for (const m of text.matchAll(HANDLE)) {
    mathBefore(m.index);
    if (m.index < last) continue;
    const handle = m[0];
    plain(m.index);
    last = m.index + handle.length;
    if (!prefixes.has(handle.split("_")[0] ?? "")) {
      out.push({ kind: "text", text: handle });
      continue;
    }
    const key = bases.map((base) => base + handle).find((k) => held.has(k));
    out.push(
      key === undefined
        ? { kind: "unknown", text: handle }
        : { kind: "mention", text: handle, key, type: held.get(key)?.type },
    );
  }
  mathBefore(Number.POSITIVE_INFINITY);
  plain(text.length);
  return out;
}
