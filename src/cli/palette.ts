/**
 * Colour, named for what it means rather than for what it looks like.
 */

import { createColors } from "picocolors";

/**
 * How a view marks what the record is telling you.
 */
export interface Palette {
  /** A section heading — `Established`, `Conditions`, `Supported by`. */
  heading(text: string): string;
  /** A handle: `Q_1`, `CLM_4`, `GATE_2`. What the next command takes. */
  handle(text: string): string;
  /** It holds: established, passed, supported, agrees. */
  settled(text: string): string;
  /** Evidence bears against it: failed, challenged, disagrees. */
  contested(text: string): string;
  /** Nothing has looked: untested, never-run, no-standing-verdict. */
  untested(text: string): string;
  /** Answered, but qualified: provisional, withdrawn, accepted-as-unresolved. */
  provisional(text: string): string;
  /** The caveat paragraphs — true, load-bearing, and not what you scan for. */
  quiet(text: string): string;
}

/** Every member the identity function. What `--no-ansi` and a pipe both get. */
export const PLAIN: Palette = {
  heading: (t) => t,
  handle: (t) => t,
  settled: (t) => t,
  contested: (t) => t,
  untested: (t) => t,
  provisional: (t) => t,
  quiet: (t) => t,
};

/**
 * A palette, coloured or not.
 */
export function palette(enabled: boolean): Palette {
  if (!enabled) return PLAIN;
  const c = createColors(true);
  return {
    heading: (t) => c.bold(t),
    handle: (t) => c.cyan(t),
    settled: (t) => c.green(t),
    contested: (t) => c.red(t),
    // Dim rather than a colour: "nothing has looked at this" is an absence, and
    // an absence should recede rather than compete with the findings above it.
    untested: (t) => c.dim(t),
    provisional: (t) => c.yellow(t),
    quiet: (t) => c.dim(t),
  };
}
