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
 * **Read with the compiler, not with a regex.** A derivation over source
 * text is a test of the formatter's preferences unless it goes through a
 * parser: a line break inserted by a reflow, or a verb merely named in a
 * comment, would otherwise change what a text match reports without
 * changing what the code does.
 *
 * Two things that come free with the parser: callers need not strip
 * comments before matching (the AST does not contain them, so naming a
 * verb in prose was never going to look like calling it), and a call
 * chained off a newline is the same node as one that is not.
 *
 * The escape hatch is deliberate and narrow: a verb may be excluded, and the
 * exclusion must carry a reason. A list of names with no reasons would decay
 * into whatever happens to be unexposed today.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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
/**
 * Where each surface lives — a file today, a directory when it outgrows one.
 *
 * Named here rather than at four call sites so a split moves one line.
 */
export const READ_SURFACE = existsSync("src/domain/read")
  ? "src/domain/read"
  : "src/domain/read.ts";
export const WRITE_SURFACE = existsSync("src/domain/write")
  ? "src/domain/write"
  : "src/domain/write.ts";

/**
 * Every source under a path: the file itself, or every `.ts` in a directory.
 *
 * A surface is one file today and a directory when it outgrows one. Naming the
 * directory means the answer does not change on the day it is split.
 */
function sourcesUnder(path: string): string[] {
  if (!existsSync(path)) throw new Error(`no surface at ${path}: nothing to derive verbs from`);
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(path, f))
    .sort();
}

export function publicVerbsOf(surfacePath: string): string[] {
  const verbs: string[] = [];

  for (const sourcePath of sourcesUnder(surfacePath)) {
    const source = parse(sourcePath);

    const visit = (node: ts.Node): void => {
      // **A method and a function-typed property both declare a verb.** The
      // facade idiom `readonly x: Surface["x"] = (...a) => …` is a
      // PropertyDeclaration, so counting methods alone would report a
      // delegating surface as having no verbs at all -- and every assertion
      // below would then pass over an empty list, which is the silent no this
      // helper exists to catch.
      const declaresVerb =
        (ts.isMethodDeclaration(node) ||
          (ts.isPropertyDeclaration(node) &&
            (node.initializer !== undefined
              ? ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)
              : node.type !== undefined && ts.isFunctionTypeNode(node.type)))) &&
        node.name !== undefined;
      if (declaresVerb) {
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
  }

  // A surface with no verbs is a wrong path, not a small surface. Without this
  // every coverage assertion downstream iterates nothing and passes.
  if (verbs.length === 0) throw new Error(`no public verbs found under ${surfacePath}`);
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
 * When something belongs here, the reason goes here with it.
 */
export const NOT_EXPOSED: Readonly<Record<string, string>> = {
  // `explainEnquiry` in src/domain/read.ts is its one caller, and it is a
  // module-level function rather than a class member (see `Explainer`), so
  // this stays public rather than `private`.
  enquiryInContext: "reached only through `why`, as the LineOfEnquiry case's body",
  // Same shape, for the Computation case. It answers what an analysis revised
  // and which findings moved, which is what `why <analysis>` renders; a second
  // reader would make it worth a tool of its own.
  analysisRevision: "reached only through `why`, as the Computation case's body",
  // Same shape again, for the Criterion case. It is the detail `gate_status`
  // stopped carrying (#241), and `why <criterion>` is the question a
  // researcher asks for it — a tool of its own would be a second spelling of
  // one intent, which is what #182's closing rule refuses.
  criterionStanding: "reached only through `why`, as the Criterion case's body",
  stoppedWork: "reached only through `why`, as the Task case's abandoned branch",
};
