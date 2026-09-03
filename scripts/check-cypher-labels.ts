#!/usr/bin/env bun
/**
 * Every node and edge label written in a Cypher string is one the schema declares.
 *
 * A label that does not exist is **silent**. `MATCH (g)-[:BLOCKS]->(w)` where
 * `BLOCKS` is not a label is not a syntax error: the pattern binds nothing, the
 * column comes back null for every row, and a decoder reads that as "nothing
 * matched". An `OPTIONAL MATCH` is worse again — the surrounding rows still
 * return, so the answer is a complete-looking report with one list wrongly
 * empty, which reads as a fact about the record rather than a typo.
 *
 * The type system cannot see it: a label inside a template literal is a
 * string, and the schema's labels are compile-time facts about a different
 * expression, so the two never meet without something like this.
 *
 * **It reads template literals from the AST, not the file text**, and that is
 * the difference between this and its first version. `(w: Task)` in a Cypher
 * string and `(w: Task)` in a TypeScript signature are the same characters;
 * only the parser knows which one is inside a string. Text-scanning with a
 * "does MATCH appear nearby" heuristic reported sixteen findings, every one of
 * them a function parameter.
 *
 * **An over-narrow node label is silent too and is not checked here.**
 * `-[:GATES]->(w:Task)` drops a gated `Computation` and returns the rest,
 * which reads as a shorter answer rather than a wrong one. This asks whether
 * a name exists; whether it is the right one of several is a reader's job.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { EDGE_LABELS, NODE_LABELS } from "../src/db/domain";

const ROOT = "src";

/** Every `.ts` under `src/` — the whole of where this repo writes Cypher. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}

/**
 * Relationship patterns: `[:LABEL]`, `[e:LABEL]`, `[:LABEL*1..5]`.
 *
 * A `|` inside the brackets is split and both names checked. AGE has no edge
 * alternation, so such a query fails outright rather than silently — but
 * checking both halves costs nothing and says something useful if one is also
 * misspelt.
 */
const EDGE = /\[\s*(?:[A-Za-z_][A-Za-z0-9_]*)?\s*:\s*([A-Z_][A-Z_|]*)\s*(?:\*[0-9.]*)?\s*\]/g;

/** Node patterns: `(n:Label)`, `(:Label)`, `(n:Label {natural_id: $id})`. */
const NODE = /\(\s*(?:[A-Za-z_][A-Za-z0-9_]*)?\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/g;

const edges = new Set<string>(EDGE_LABELS);
const nodes = new Set<string>(NODE_LABELS);

const problems: string[] = [];
let edgeUses = 0;
let nodeUses = 0;
const filesWithCypher = new Set<string>();

for (const file of sources(ROOT)) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

  /** The text of every template literal in the file, with where it starts. */
  const literals: { text: string; start: number }[] = [];
  const walk = (node: ts.Node) => {
    if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))
      literals.push({ text: node.getText(source), start: node.getStart(source) });
    else ts.forEachChild(node, walk);
  };
  ts.forEachChild(source, walk);

  for (const literal of literals) {
    // Only a literal that opens a Cypher clause. `${}` interpolations are part
    // of the text here, which is what makes a composed query readable to this.
    if (!/\b(MATCH|MERGE|CREATE|DELETE|SET)\b/.test(literal.text)) continue;
    filesWithCypher.add(file);
    const lineOf = (offset: number) =>
      source.getLineAndCharacterOfPosition(literal.start + offset).line + 1;

    for (const m of literal.text.matchAll(EDGE))
      for (const name of (m[1] ?? "").split("|").filter(Boolean)) {
        edgeUses++;
        if (!edges.has(name))
          problems.push(`${file}:${lineOf(m.index)} — [:${name}] is not in EDGE_LABELS`);
      }

    for (const m of literal.text.matchAll(NODE)) {
      const name = m[1] ?? "";
      nodeUses++;
      if (!nodes.has(name))
        problems.push(`${file}:${lineOf(m.index)} — (:${name}) is not in NODE_LABELS`);
    }
  }
}

// A check that examined nothing is not a check: these patterns are the only
// thing standing between a renamed label and a silently empty answer, so the
// population is asserted rather than assumed.
if (edgeUses === 0 || nodeUses === 0) {
  console.error(
    `FAILED: found ${edgeUses} edge and ${nodeUses} node label uses under ${ROOT}/ — ` +
      `a check that examined nothing is not a check. The patterns have stopped matching.`,
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error("FAILED: a Cypher string names a label the schema does not declare\n");
  for (const p of problems) console.error(`   ${p}`);
  console.error(
    "\n   A label that does not exist binds nothing and raises nothing: the query runs\n" +
      "   and the answer is silently empty. Check the spelling against src/db/domain.ts.",
  );
  process.exit(1);
}

console.log(
  `OK: ${edgeUses} edge and ${nodeUses} node label uses across ${filesWithCypher.size} files, ` +
    `every one declared in src/db/domain.ts.`,
);
