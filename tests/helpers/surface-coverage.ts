/**
 * Is every domain verb reachable from an adapter?
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
      // **A method and a function-typed property both declare a verb.** The facade idiom
      // `readonly x: Surface["x"] = (...a) => …` is a PropertyDeclaration, so counting methods
      // alone would report a delegating surface as having no verbs at all -- and every
      // assertion below would then pass over an empty list, which is the silent no this helper
      // exists to catch.
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
  // The two behind every kind `why` answers by walking the record rather than
  // from a report. Same shape as the four above: module-level `Explainer`
  // functions are their only callers, so they are public rather than
  // `private`. Neither is a question a researcher would ask — "list this
  // record's edges" is the storage shape, and `why` is the intent.
  neighboursOf: "reached only through `why`, as the walked kinds' body",
  // Composed by `now`, whose output carries the count, and `what_happened`'s
  // `reconstructed` filter is the list. A tool of its own would be a second
  // spelling of one question.
  howMuchWasTranscribed:
    "reached through `now`, which prints the count — a command of its own would be a second spelling of one question",
  proseFor: "reached only through `why`, as the walked kinds' body",
};
