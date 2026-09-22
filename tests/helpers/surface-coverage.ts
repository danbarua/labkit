/**
 * Which domain verbs a set of source files calls.
 */

import { readFileSync } from "node:fs";
import ts from "typescript";

/** Parses one file. `true` keeps parent pointers and node text available. */
function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
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
