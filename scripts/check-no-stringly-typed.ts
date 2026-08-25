#!/usr/bin/env bun
/**
 * No bare `string` in a signature in the domain service layer.
 *
 * A `string` parameter says nothing about what it holds. `gates: string[]` was
 * GATE_ ids, `proposition: string` was claim wording, `at: string` was an ISO
 * instant, and telling them apart meant reading the body and then a call site
 * or two. That is a demand on every future reader, made once per signature.
 *
 * Two vocabularies remove it. A **handle** — `GateRef`, `ClaimRef`, … — is what
 * a parameter takes when it names a record. A **taxonomy alias** from
 * `src/db/domain.ts` — `IndexedString`, `Timestamp`, `IdentityString`,
 * `ReadOnlyString`, `Prose` — is what it takes when it carries a value. The
 * taxonomy is what makes this rule satisfiable at all: without somewhere to put
 * `pose(question: …)`, "no bare strings" would have no answer.
 *
 * **It reads the written type node, not the resolved type.** Every alias
 * resolves to `string`, so asking the type checker would report every one of
 * them as a violation and the rule would be unimplementable.
 *
 * **What it cannot see, which is worth knowing before trusting it.** Cypher
 * parameters are bound as `Record<string, unknown>`, so nothing — this script
 * or `tsc` — catches `{ id: gate }` where `{ id: gate.id }` was meant. Three of
 * those shipped during the refactor this script was written for and were found
 * by the test suite, not by a type. Same for `===` between two handles under
 * that shape: reference equality compiled and was always false. S-5 caught that
 * one. A signature rule buys signatures; the bodies still need tests.
 *
 * **It scans class members only**, which is a scope rather than an oversight. A
 * local arrow function inside a method body is an implementation detail, not a
 * surface a caller reads — so `bySubject: Map<string, IdentifiedArtefact>` on
 * one of those was out of reach here and was fixed by hand. What *is* in scope
 * is a `Map` or `Set` in a real signature; the wrapper list below was widened
 * after that case showed the walker stopping at `Promise` and `Array`.
 */

import ts from "typescript";
import { readFileSync } from "node:fs";

const FILES = ["src/domain/core.ts", "src/domain/read.ts", "src/domain/write.ts"];

/** The taxonomy aliases. Anything else non-`string` is a handle or a DTO and is fine. */
const VALUE_TYPES = new Set([
  "IndexedString",
  "IdentityString",
  "Timestamp",
  "ReadOnlyString",
  "Prose",
]);

/**
 * Signatures that legitimately traffic in bare `string`, each with the reason.
 *
 * Kept deliberately short. An allowlist that grows is the rule being abandoned
 * one entry at a time, so anything added here needs a sentence saying why the
 * value is genuinely not a handle and not a classified value.
 */
const ALLOWED = new Map<string, string>([
  // Builds a Cypher clause. Its return is query text, not data.
  ["withinScope", "returns a Cypher fragment, not a value"],
  // Binds Cypher params, which are `Record<string, unknown>` by construction.
  ["scopeParams", "returns Cypher parameter bindings"],
  // The event stream's own vocabulary. Typing `subject` reaches into the
  // persisted event row, and that is decided with the event store.
  ["emit", "operation and subject belong to the event shape"],
  // Takes decoded `graph.query` rows. A `natural_id` there is the raw string a
  // decoder produced -- this is where a handle is *made*, not somewhere one is
  // passed, and typing the row shape would be typing the database's answer.
  ["checksFrom", "takes decoded query rows, not handles"],
]);

type Finding = { file: string; line: number; member: string; what: string; type: string };
const findings: Finding[] = [];

/** `string`, `string[]`, `string | undefined`, and objects containing them. */
function bareStringIn(node: ts.TypeNode | undefined, source: ts.SourceFile): string | undefined {
  if (!node) return undefined;
  if (node.kind === ts.SyntaxKind.StringKeyword) return "string";
  if (ts.isArrayTypeNode(node)) {
    const inner = bareStringIn(node.elementType, source);
    return inner ? `${inner}[]` : undefined;
  }
  if (ts.isUnionTypeNode(node)) {
    for (const t of node.types) {
      // A union of string literals is a closed vocabulary, not a bare string.
      if (ts.isLiteralTypeNode(t)) return undefined;
    }
    for (const t of node.types) {
      const inner = bareStringIn(t, source);
      if (inner) return inner;
    }
    return undefined;
  }
  if (ts.isTypeLiteralNode(node)) {
    for (const m of node.members) {
      if (!ts.isPropertySignature(m)) continue;
      const inner = bareStringIn(m.type, source);
      if (inner) return `{ ${m.name?.getText(source)}: ${inner} }`;
    }
    return undefined;
  }
  if (ts.isTypeReferenceNode(node) && node.typeArguments) {
    const name = node.typeName.getText(source);
    // Wrappers to look through. `Map`/`Set` are here because a collection keyed
    // by a bare `string` is the same defect one level in: `bySubject:
    // Map<string, IdentifiedArtefact>` sat in a return type and this script
    // walked straight past it, because the first version looked only through
    // `Promise` and `Array`.
    if (["Promise", "Array", "ReadonlyArray", "Map", "Set", "ReadonlyMap", "ReadonlySet"].includes(name)) {
      for (const a of node.typeArguments) {
        const inner = bareStringIn(a, source);
        if (inner) return `${name}<… ${inner} …>`;
      }
    }
    if (VALUE_TYPES.has(name)) return undefined;
  }
  return undefined;
}

for (const file of FILES) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const at = (n: ts.Node) => source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1;

  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && node.name) {
      const member = node.name.getText(source);
      if (!ALLOWED.has(member)) {
        for (const p of node.parameters) {
          const found = bareStringIn(p.type, source);
          if (found)
            findings.push({ file, line: at(p), member, what: `parameter \`${p.name.getText(source)}\``, type: found });
        }
        const ret = bareStringIn(node.type, source);
        if (ret) findings.push({ file, line: at(node), member, what: "return type", type: ret });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
}

if (findings.length > 0) {
  console.error(`❌ check-no-stringly-typed: ${findings.length} bare \`string\` position(s) in the domain service layer\n`);
  for (const f of findings)
    console.error(`   ${f.file}:${f.line} — ${f.member}: ${f.what} is \`${f.type}\``);
  console.error("\n   A handle (GateRef, ClaimRef, …) if it names a record; a taxonomy alias");
  console.error("   (IndexedString, Timestamp, IdentityString, ReadOnlyString, Prose) if it carries a value.");
  process.exit(1);
}

console.log("✅ check-no-stringly-typed OK: every parameter and return in core/read/write names a handle or a classified value.");
