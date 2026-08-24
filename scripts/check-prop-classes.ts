#!/usr/bin/env bun
/**
 * Holds `INDEXED_PROPS` to the string taxonomy it is supposed to mirror.
 *
 * `src/db/domain.ts` says what LabKit does with each stored string by annotating
 * it `IndexedString`, `Timestamp`, `IdentityString`, `ReadOnlyString` or
 * `Prose`. TypeScript erases all five, so `provisionTenantGraph()` cannot read
 * them and loops `INDEXED_PROPS` instead. That is one fact in two places, which
 * CLAUDE.md is right to distrust — `check:ledger` was deleted rather than kept
 * for exactly this shape.
 *
 * It is kept here for one reason the ledger case did not have: **the two copies
 * fail differently and silently.** A property annotated `IndexedString` and
 * missing from the table gets no index and stays a sequential scan, which is
 * invisible until someone profiles. A table entry with no matching annotation
 * builds an index nothing reads, which is invisible forever. Neither shows up
 * in a test, because both spellings return the same rows.
 *
 * The honest end state is to **generate** the table from the annotations — the
 * `docs/mcp-tools.md` pattern, where the generated file is checked in because
 * its diff is the useful part and freshness rides on a test already running.
 * When that happens this script deletes itself.
 *
 * It reads the **written type node**, not the resolved type. All five aliases
 * resolve to `string`, so a checker asking the type checker what these are
 * would learn nothing.
 */

import ts from "typescript";
import { readFileSync } from "node:fs";

const DOMAIN = "src/db/domain.ts";
/** Annotations whose properties must be indexed. The other three must not be. */
const INDEXED_TYPES = new Set(["IndexedString", "Timestamp"]);

const source = ts.createSourceFile(
  DOMAIN,
  readFileSync(DOMAIN, "utf8"),
  ts.ScriptTarget.Latest,
  true,
);

/** `QuestionProps` -> `Question`; anything else is not a node's property shape. */
function labelOf(interfaceName: string): string | undefined {
  return interfaceName.endsWith("Props") ? interfaceName.slice(0, -"Props".length) : undefined;
}

/**
 * The alias a property is written as.
 *
 * `ReadOnlyString<EvidenceUnitRole>` is a type reference whose name is
 * `ReadOnlyString`, so taking `typeName` covers the generic form without a
 * special case. `Prose[]` is an array whose element is a reference, hence the
 * unwrap.
 */
function writtenTypeName(node: ts.TypeNode | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isArrayTypeNode(node)) return writtenTypeName(node.elementType);
  if (ts.isTypeReferenceNode(node)) return node.typeName.getText(source);
  return undefined;
}

/** What the annotations say should be indexed: label -> property names. */
const annotated = new Map<string, string[]>();

source.forEachChild((node) => {
  if (!ts.isInterfaceDeclaration(node)) return;
  const label = labelOf(node.name.text);
  if (!label) return;
  for (const member of node.members) {
    if (!ts.isPropertySignature(member) || !member.name) continue;
    const written = writtenTypeName(member.type);
    if (written && INDEXED_TYPES.has(written)) {
      const list = annotated.get(label) ?? [];
      list.push(member.name.getText(source));
      annotated.set(label, list);
    }
  }
});

const { INDEXED_PROPS } = await import("../src/db/domain");

const problems: string[] = [];
const labels = new Set([...annotated.keys(), ...Object.keys(INDEXED_PROPS)]);
for (const label of [...labels].sort()) {
  const want = new Set(annotated.get(label) ?? []);
  const have = new Set(INDEXED_PROPS[label as keyof typeof INDEXED_PROPS] ?? []);
  for (const p of [...want].sort())
    if (!have.has(p))
      problems.push(`${label}.${p} is IndexedString/Timestamp but missing from INDEXED_PROPS — it gets no index, silently`);
  for (const p of [...have].sort())
    if (!want.has(p))
      problems.push(`INDEXED_PROPS lists ${label}.${p}, which is not annotated IndexedString or Timestamp — an index nothing reads`);
}

if (problems.length > 0) {
  console.error("❌ check-prop-classes: INDEXED_PROPS and the string taxonomy disagree\n");
  for (const p of problems) console.error(`   ${p}`);
  process.exit(1);
}

const total = [...annotated.values()].reduce((n, ps) => n + ps.length, 0);
console.log(`✅ check-prop-classes OK: ${total} indexed properties, and INDEXED_PROPS names exactly those.`);
