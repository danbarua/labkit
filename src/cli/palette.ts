/**
 * Colour, named for what it means rather than for what it looks like.
 *
 * A view says `p.contested(state)`, never `p.red(state)`. The mapping from a
 * research state to a colour is decided once, here, and the eighteen renderers
 * stay about the record. Renaming a colour is then a one-line change instead of
 * a search across `src/cli/views/`.
 *
 * **The names are the domain's distinctions, not a sentiment scale.** There was
 * a draft of this with `good` and `bad` on it, which is wrong twice over: a
 * failed check is not bad news, it is a finding, and an untested question is
 * not a lesser one. What the record actually keeps apart is whether something
 * holds, whether evidence bears against it, whether nothing has looked yet, and
 * whether it holds only provisionally — which is why `labkit known` has five
 * buckets and `labkit gate` four states.
 *
 * **Nothing here decides *whether* to colour.** `enabled` arrives from the
 * composition root, which is the only place that knows about `--no-ansi`, a
 * pipe, or `NO_COLOR`. A `Palette` is a value a view is handed, so
 * `tests/cli/views.test.ts` can render the same report both ways and assert on
 * both — which it must, or turning colour off in a non-TTY would quietly make
 * every fixture test check the uncoloured path only.
 *
 * picocolors was picked by measurement, not size — see PJ or the PR for the
 * table. Under Bun **1.3.14**, `node:util`'s `styleText` wrote escapes into a
 * pipe and ignored `NO_COLOR` entirely, and `ansis` wrote escapes into a pipe
 * with no environment variables set at all. Either would have broken
 * `$(labkit analyse …)`, which every write command's output is built around.
 *
 * **`styleText` no longer behaves that way.** Re-measured on bun 1.4.0,
 * 2026-08-28: it returns bare text into a pipe and under `NO_COLOR`. The choice
 * stands — picocolors works and nothing here needs changing — but the reason
 * above is now a dated record rather than a live fact, and a reader who tests
 * it on a current bun will find it false. `ansis` was not re-measured.
 */

import { createColors } from "picocolors";

/**
 * How a view marks what the record is telling you.
 *
 * Every member takes and returns a string, so a plain palette is the identity
 * function and colour is never a special case a view has to branch on.
 */
export interface Palette {
  /** A section heading — `Established`, `Conditions`, `Resting on`. */
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
 *
 * `createColors(false)` returns the same identity functions rather than a
 * second code path, so the only difference between a coloured run and a plain
 * one is the escape sequences — never which branch rendered the page.
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
