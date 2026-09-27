import { findMathSpans } from "./math";

/** A run of prose, cut into what the reader should see set apart. */
export type Segment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "math"; readonly text: string }
  | {
      readonly kind: "handle";
      readonly handle: string;
      /** What the prefix names, for example `Claim` for `CLM_3`. */
      readonly type: string;
    };

const HANDLE = /\b[A-Z]{1,6}_\d+\b/g;

/**
 * Cuts prose into text, math and handles. A handle counts only when its prefix is one the domain
 * names (`types` maps prefix to type), which leaves `K_1` or `A_2` in mathematical prose as text.
 * A handle inside a stretch of math is part of the math.
 */
export function segmentsOf(
  text: string,
  types: Readonly<Record<string, string>>,
): readonly Segment[] {
  const math = findMathSpans(text);
  const out: Segment[] = [];
  let last = 0;

  const say = (until: number) => {
    if (until > last) out.push({ kind: "text", text: text.slice(last, until) });
    last = Math.max(last, until);
  };

  const emitMathBefore = (position: number) => {
    while (math.length > 0 && (math[0] as [number, number])[1] <= position) {
      const [start, end] = math.shift() as [number, number];
      if (start < last) continue;
      say(start);
      out.push({ kind: "math", text: text.slice(start, end) });
      last = end;
    }
  };

  for (const match of text.matchAll(HANDLE)) {
    emitMathBefore(match.index);
    if (match.index < last) continue;
    const inside = math[0];
    if (inside !== undefined && inside[0] <= match.index) continue;
    const prefix = match[0].slice(0, match[0].indexOf("_"));
    const type = types[prefix];
    if (type === undefined) continue;
    say(match.index);
    out.push({ kind: "handle", handle: match[0], type });
    last = match.index + match[0].length;
  }
  emitMathBefore(Number.POSITIVE_INFINITY);
  say(text.length);
  return out;
}
