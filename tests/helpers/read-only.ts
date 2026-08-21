/**
 * What "this adapter cannot write" is actually worth, made explicit.
 *
 * Both the CLI and the MCP server claimed to be read-only *structurally* —
 * they construct a `ReadSurface`, never a `ResearchSession`, so no write verb
 * is in scope. The PJ-028 sweep found the hole, and it is one the original
 * check could not see by construction: both adapters hold a `TenantGraph`,
 * whose `createNode`, `createEdge` and `closeDecision` are writes and are not
 * `WriteSurface` verbs, so a list derived from `WriteSurface.prototype` can
 * never contain them.
 *
 * Both lists are derived rather than typed out, for the reason the original
 * one was: a verb added later is covered without anyone remembering. The
 * `TenantGraph` side derives by **exclusion** — every method except the ones
 * named read-only below — so a new mutating verb is caught by default and only
 * a deliberate addition to the allowlist can weaken it.
 */

import { TenantGraph } from "../../src/db/graph";
import { WriteSurface } from "../../src/domain";

/**
 * `TenantGraph` methods that do not themselves write.
 *
 * `inTransaction` is here because it writes nothing on its own — it is a
 * boundary around whatever runs inside it, and what runs inside is covered by
 * the rest of this list.
 *
 * **`query` is here and the honesty of the whole check turns on it.** It takes
 * arbitrary Cypher, and `SET` is Cypher: `write.ts` uses `query()` for exactly
 * that in two places. So what these lists prove is *"no write verb is called"*,
 * which is real and worth having, and **not** *"writing is impossible"*, which
 * would need a read-only connection or a Cypher-level restriction. Say the
 * smaller true thing rather than the larger comfortable one.
 */
const NON_MUTATING = new Set(["constructor", "query", "inTransaction"]);

/** Every name that would be a write if an adapter called it. */
export function writeVerbNames(): string[] {
  const domain = Object.getOwnPropertyNames(WriteSurface.prototype).filter(
    (n) => n !== "constructor" && !n.startsWith("_"),
  );
  const graph = Object.getOwnPropertyNames(TenantGraph.prototype).filter(
    (n) => !NON_MUTATING.has(n) && !n.startsWith("_"),
  );
  return [...domain, ...graph];
}

/** Source with comments stripped — naming a verb in prose is not calling it. */
export function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** The write verbs a body actually calls, by name followed by an open paren. */
export function writeVerbsCalledIn(code: string): string[] {
  return writeVerbNames().filter((v) => new RegExp(`\\b${v}\\s*\\(`).test(code));
}
