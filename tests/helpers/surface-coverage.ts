/**
 * Is every domain verb reachable over MCP?
 *
 * `tests/helpers/read-only.ts` asks the opposite question — which verbs an
 * adapter must *not* call. This asks which it must, and it exists because the
 * answer was silently no for six reads: `originOf`, `contractFor`,
 * `criteriaGoverning`, `gateStatus`, `doTheseConflict` and `reproducibilityOf`
 * were implemented, tested and unreachable. An agent could declare a gate and
 * then not ask what state it was in.
 *
 * That is worse than a missing feature, because `labkit://docs/tools` renders
 * itself from the tool list: an unexposed read is absent from the generated
 * documentation too, so the one page that shows the domain in one place was
 * quietly showing the adapter's subset of it.
 *
 * **Derived from source, not from the prototype.** TypeScript's `private` is
 * compile-time only, so `Object.getOwnPropertyNames` cannot tell a public verb
 * from a helper — it returns `outputArtefactOf` and `standingFindings`
 * alongside `recordAnalysis`. The declaration is the only place the
 * distinction survives, so this reads it.
 *
 * The escape hatch is deliberate and narrow: a verb may be excluded, and the
 * exclusion must carry a reason. A list of names with no reasons would decay
 * into whatever happens to be unexposed today.
 */

import { readFileSync } from "node:fs";

/** Public `async` methods of a surface class, in declaration order. */
export function publicVerbsOf(sourcePath: string): string[] {
  const source = readFileSync(sourcePath, "utf8");
  return [...source.matchAll(/^ {2}async ([a-zA-Z]+)\(/gm)].map((m) => m[1]!);
}

/**
 * Verbs deliberately not exposed, and why.
 *
 * Empty, and that is the current state rather than a claim that it must stay
 * empty. When something belongs here, the reason goes here with it.
 */
export const NOT_EXPOSED: Readonly<Record<string, string>> = {};

/**
 * Verbs a body calls as `surface.verb(`.
 *
 * **Whitespace-tolerant, and that is not defensive programming.** The pattern
 * was `\bwrite\.pursue\s*\(` until a formatter arrived and split five calls
 * onto their own lines — `write\n  .pursue({…})` — at which point this reported
 * five verbs unreachable that were reached fine. A derivation that reads source
 * text has to survive the source text being re-wrapped, or it is a test of the
 * formatter's preferences.
 */
export function verbsReachedIn(code: string, receiver: string, verbs: string[]): string[] {
  return verbs.filter((v) => new RegExp(`\\b${receiver}\\s*\\.\\s*${v}\\s*\\(`).test(code));
}
