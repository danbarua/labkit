/**
 * Is every domain verb reachable from an adapter?
 *
 * `tests/mcp.test.ts` asks it of the MCP tools and `tests/cli/coverage.test.ts`
 * of the CLI commands. It exists because the answer was silently no for six
 * reads: `originOf`, `contractFor`, `criteriaGoverning`, `gateStatus`,
 * `doTheseConflict` and `reproducibilityOf` were implemented, tested and
 * unreachable. An agent could declare a gate and then not ask what state it was
 * in.
 *
 * That is worse than a missing feature, because `labkit://docs/tools` renders
 * itself from the tool list: an unexposed read is absent from the generated
 * documentation too, so the one page that shows the domain in one place was
 * quietly showing the adapter's subset of it.
 *
 * **Read from the declaration, because that is the only place the distinction
 * survives.** TypeScript's `private` is compile-time only, so
 * `Object.getOwnPropertyNames` cannot tell a public verb from a helper — it
 * returns `outputArtefactOf` and `standingFindings` alongside `recordAnalysis`.
 *
 * **Read with the compiler, not with a regex**, and that part was learnt the
 * hard way. Both functions below matched source text until 2026-08-25, when
 * biome arrived and split `write.pursue({…})` onto two lines in five tools.
 * `\bwrite\.pursue\s*\(` stopped matching, `tests/mcp.test.ts` reported five
 * verbs unreachable that were reached fine, and the failing test named the
 * wrong thing entirely. A derivation over source text is a test of the
 * formatter's preferences unless it goes through a parser — which two `check:*`
 * scripts in this repo already knew (`check-no-stringly-typed.ts`,
 * `check-prop-classes.ts`) and this one did not.
 *
 * Two things that came free with the parser, both of which had been worked
 * around: callers no longer strip comments before matching (the AST does not
 * contain them, so naming a verb in prose was never going to look like calling
 * it), and a call chained off a newline is the same node as one that is not.
 *
 * The escape hatch is deliberate and narrow: a verb may be excluded, and the
 * exclusion must carry a reason. A list of names with no reasons would decay
 * into whatever happens to be unexposed today.
 */

import { readFileSync } from "node:fs";
import ts from "typescript";

/** Parses one file. `true` keeps parent pointers and node text available. */
function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

/**
 * Public methods of the classes a file declares, in declaration order.
 *
 * `private` and `protected` are read off the modifiers rather than guessed at,
 * and a leading underscore is still honoured as a convention. Constructors and
 * property declarations are not methods and do not appear.
 */
export function publicVerbsOf(sourcePath: string): string[] {
  const source = parse(sourcePath);
  const verbs: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && node.name) {
      const hidden = ts
        .getModifiers(node)
        ?.some(
          (m) =>
            m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword,
        );
      const name = node.name.getText(source);
      if (!hidden && !name.startsWith("_")) verbs.push(name);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return verbs;
}

/**
 * Every method name called on `receiver`, across the given files.
 *
 * Matches the call `receiver.someVerb(…)` as an AST node, so line breaks,
 * indentation and a chained `.then()` after it are all invisible. It does not
 * follow aliases — `const r = read; r.gateStatus()` is not seen — which is the
 * same limit the regex had and is fine for adapters that take the surface as a
 * parameter named for what it is.
 */
export function verbsCalledOn(paths: readonly string[], receiver: string): Set<string> {
  const called = new Set<string>();

  for (const path of paths) {
    const source = parse(path);
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === receiver
      ) {
        called.add(node.expression.name.text);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);
  }
  return called;
}

/**
 * Verbs deliberately not exposed, and why.
 *
 * Empty, and that is the current state rather than a claim that it must stay
 * empty. When something belongs here, the reason goes here with it.
 */
export const NOT_EXPOSED: Readonly<Record<string, string>> = {};
