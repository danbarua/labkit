#!/usr/bin/env bun
/**
 * The three rules a fact has to follow, each learned by breaking it.
 *
 * `src/domain/facts.ts`'s header states them in prose; this makes two of them
 * fail loudly and explains why the third cannot be checked here. All three were
 * live defects during the port, and none of them errored at the time — that is
 * the point. A fact that gets one wrong returns a plausible answer.
 */

import ts from "typescript";
import { readFileSync } from "node:fs";
import { Glob } from "bun";

const failures: string[] = [];
const files = [...new Glob("src/domain/*facts.ts").scanSync(".")].sort();

/** A `key: value` from an object literal, if it is there. */
function prop(node: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const m of node.properties) {
    if (ts.isPropertyAssignment(m) && ts.isIdentifier(m.name) && m.name.text === name) {
      return m.initializer;
    }
  }
  return undefined;
}

/** Variables a Cypher fragment binds — `(x:Label)` and `[r:TYPE]` forms. */
function binds(clause: string): Set<string> {
  const out = new Set<string>();
  for (const m of clause.matchAll(/\(\s*([a-zA-Z][a-zA-Z0-9_]*)\s*:/g)) out.add(m[1]!);
  return out;
}

/** Variables it reads without binding — `(x)` with no label. */
function reads(clause: string): Set<string> {
  const out = new Set<string>();
  for (const m of clause.matchAll(/\(\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\)/g)) out.add(m[1]!);
  return out;
}

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const at = (n: ts.Node) => source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1;

  /**
   * Every object literal that looks like a fact, keyed by the **declaration**
   * that produces it — the `export const` or the `export function` returning
   * it. That is what a `needs` entry names, so it is what the check has to
   * resolve; the fact's own `name` field is not unique, since a parameterised
   * factory yields one name for several bearings.
   */
  const facts = new Map<string, { node: ts.ObjectLiteralExpression; line: number }>();
  const walk = (n: ts.Node, declaredAs?: string): void => {
    if (ts.isFunctionDeclaration(n) && n.name) declaredAs = n.name.text;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) declaredAs = n.name.text;
    if (ts.isObjectLiteralExpression(n) && declaredAs) {
      if (prop(n, "clause") || prop(n, "needs")) facts.set(declaredAs, { node: n, line: at(n) });
    }
    ts.forEachChild(n, (c) => walk(c, declaredAs));
  };
  walk(source);

  /** What each declaration's clause binds. A variable may be bound by several. */
  const boundBy = new Map<string, Set<string>>();
  for (const [decl, { node }] of facts) {
    const clause = prop(node, "clause");
    if (clause === undefined) continue;
    for (const v of binds(clause.getText(source))) {
      boundBy.set(v, (boundBy.get(v) ?? new Set()).add(decl));
    }
  }

  for (const [decl, { node, line }] of facts) {
    const where = `${file}:${line} — ${decl}`;

    // RULE 1. Grains are shared named constants, never written at the use site.
    // `per()` compares them by reference, so an inline arrow is semantically
    // identical, compares unequal, and silently fans a same-grain dependency
    // into a Map where the consumer expects one value. The type system cannot
    // carry this; nothing fails at runtime either.
    const grain = prop(node, "grain");
    if (grain && !ts.isIdentifier(grain)) {
      failures.push(`${where}: \`grain\` must be a named constant, not written inline`);
    }

    // RULE 2. A leaf declares the facts whose clauses bind variables it reads.
    // Without it `compose()` omits a clause whose variable another references —
    // no error, a column never returned, and a fact folding to null for every
    // subject. Only intra-file bindings are checked: a variable nothing here
    // binds comes from the caller's anchor, which this cannot see.
    const clause = prop(node, "clause");
    if (clause) {
      const own = binds(clause.getText(source));
      // A `needs` entry is either the declaration itself or a call to it, so
      // the identifier at its head is what names the dependency.
      const declared = new Set<string>();
      const needs = prop(node, "needs");
      if (needs && ts.isArrayLiteralExpression(needs)) {
        for (const dep of needs.elements) {
          const head = ts.isCallExpression(dep) ? dep.expression : dep;
          if (ts.isIdentifier(head)) declared.add(head.text);
        }
      }
      for (const v of reads(clause.getText(source))) {
        if (own.has(v)) continue;
        const binders = boundBy.get(v);
        // Nothing in this file binds it, so it comes from the caller's anchor,
        // which this check cannot see. Not an error.
        if (binders === undefined) continue;
        if (binders.has(decl)) continue;
        if ([...binders].some((b) => declared.has(b))) continue;
        failures.push(
          `${where}: reads \`${v}\`, bound by ${[...binders].map((b) => `\`${b}\``).join(" or ")}, but declares neither in \`needs\``,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} fact declaration(s) break a rule:`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("");
  console.error("  See src/domain/facts.ts's header for why each rule exists.");
  process.exit(1);
}

console.log(
  `OK: ${files.length} fact module(s), every grain named and every clause dependency declared.`,
);
