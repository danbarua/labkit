#!/usr/bin/env bun
/**
 * Holds `INDEXED_PROPS` and `SEARCHABLE_PROSE`(`_ARRAYS`) to the string taxonomy they mirror.
 *
 * `src/db/domain.ts` says what LabKit does with each stored string by annotating
 * it `IndexedString`, `Timestamp`, `IdentityString`, `ReadOnlyString` or
 * `Prose`. TypeScript erases all five, so `provisionTenantGraph()` cannot read
 * them and loops `INDEXED_PROPS` instead, and `search()` cannot read them
 * either and loops `SEARCHABLE_PROSE`/`SEARCHABLE_PROSE_ARRAYS`. That is one
 * fact in two places twice over, which CLAUDE.md is right to distrust —
 * `check:ledger` was deleted rather than kept for exactly this shape.
 *
 * It is kept here for one reason the ledger case did not have: **the two
 * copies of each pair fail differently and silently.** A property annotated
 * `IndexedString` and missing from `INDEXED_PROPS` gets no index and stays a
 * sequential scan, invisible until someone profiles. A property annotated
 * `Prose` and missing from `SEARCHABLE_PROSE` is worse — `search()` returns
 * an empty result for a real match, which reads as "nothing on the record
 * says that" rather than as the tool's own gap. Neither shows up in a test,
 * because both spellings return the same rows on the fixtures that exist.
 *
 * The honest end state is to **generate** these tables from the annotations,
 * at which point this script deletes itself. Note what that does *not* mean:
 * this repo tried checking a generated file in beside the code it describes,
 * with a test holding the two equal, and retired it on 2026-08-26 — see
 * `src/mcp/docs.ts`. Generate it into the running program, not into the tree.
 *
 * It reads the **written type node**, not the resolved type. All five
 * aliases resolve to `string`, so a checker asking the type checker what
 * these are would learn nothing.
 */

import ts from "typescript";
import { readFileSync } from "node:fs";

const DOMAIN = "src/db/domain.ts";
/** Annotations whose properties must be indexed. The other three must not be. */
const INDEXED_TYPES = new Set(["IndexedString", "Timestamp"]);
/** The one annotation `search()` scans — everything else is exact-match territory or not text at all. */
const SEARCHABLE_TYPE = "Prose";

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
 * The alias a property is written as, and whether it was an array of it.
 *
 * `ReadOnlyString<EvidenceUnitRole>` is a type reference whose name is
 * `ReadOnlyString`, so taking `typeName` covers the generic form without a
 * special case. `Prose[]` is an array whose element is a reference, hence the
 * `array` flag — `INDEXED_PROPS` never had to care about this distinction,
 * but `search()` builds a different Cypher shape for each (see
 * `SEARCHABLE_PROSE_ARRAYS`'s own doc comment).
 */
function writtenType(
  node: ts.TypeNode | undefined,
  array = false,
): { name: string; array: boolean } | undefined {
  if (!node) return undefined;
  if (ts.isArrayTypeNode(node)) return writtenType(node.elementType, true);
  if (ts.isTypeReferenceNode(node)) return { name: node.typeName.getText(source), array };
  return undefined;
}

/** label -> property names, for one annotation. */
type PropMap = Map<string, string[]>;

const indexedAnnotated: PropMap = new Map();
const searchableAnnotated: PropMap = new Map();
const searchableArrayAnnotated: PropMap = new Map();

function record(map: PropMap, label: string, prop: string) {
  const list = map.get(label) ?? [];
  list.push(prop);
  map.set(label, list);
}

source.forEachChild((node) => {
  if (!ts.isInterfaceDeclaration(node)) return;
  const label = labelOf(node.name.text);
  if (!label) return;
  for (const member of node.members) {
    if (!ts.isPropertySignature(member) || !member.name) continue;
    const written = writtenType(member.type);
    if (!written) continue;
    const prop = member.name.getText(source);
    if (INDEXED_TYPES.has(written.name)) record(indexedAnnotated, label, prop);
    if (written.name === SEARCHABLE_TYPE) {
      record(written.array ? searchableArrayAnnotated : searchableAnnotated, label, prop);
    }
  }
});

const { INDEXED_PROPS, SEARCHABLE_PROSE, SEARCHABLE_PROSE_ARRAYS } = await import(
  "../src/db/domain"
);

const problems: string[] = [];

/** Compares one annotation's derived map against its hand-written table, both ways. */
function reconcile(
  tableName: string,
  annotated: PropMap,
  table: { readonly [label: string]: readonly string[] | undefined },
  annotationLabel: string,
) {
  const labels = new Set([...annotated.keys(), ...Object.keys(table)]);
  for (const label of [...labels].sort()) {
    const want = new Set(annotated.get(label) ?? []);
    const have = new Set(table[label] ?? []);
    for (const p of [...want].sort())
      if (!have.has(p))
        problems.push(`${label}.${p} is ${annotationLabel} but missing from ${tableName}`);
    for (const p of [...have].sort())
      if (!want.has(p))
        problems.push(
          `${tableName} lists ${label}.${p}, which is not annotated ${annotationLabel}`,
        );
  }
}

reconcile("INDEXED_PROPS", indexedAnnotated, INDEXED_PROPS, "IndexedString/Timestamp");
reconcile("SEARCHABLE_PROSE", searchableAnnotated, SEARCHABLE_PROSE, "Prose");
reconcile("SEARCHABLE_PROSE_ARRAYS", searchableArrayAnnotated, SEARCHABLE_PROSE_ARRAYS, "Prose[]");

if (problems.length > 0) {
  console.error("FAILED: a table and the string taxonomy disagree\n");
  for (const p of problems) console.error(`   ${p}`);
  process.exit(1);
}

const indexedTotal = [...indexedAnnotated.values()].reduce((n, ps) => n + ps.length, 0);
const searchableTotal = [...searchableAnnotated.values()].reduce((n, ps) => n + ps.length, 0);
const searchableArrayTotal = [...searchableArrayAnnotated.values()].reduce(
  (n, ps) => n + ps.length,
  0,
);
console.log(
  `OK: ${indexedTotal} indexed properties, ${searchableTotal} searchable scalar properties, ` +
    `${searchableArrayTotal} searchable array properties, each table naming exactly those.`,
);
