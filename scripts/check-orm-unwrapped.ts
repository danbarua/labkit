#!/usr/bin/env bun
/**
 * Every use of a drizzle ORM handle sits inside an `unwrapped()` callback.
 *
 * A `DrizzleQueryError`'s message is `Failed query: <sql>\nparams: <values>`,
 * and the values are the ones that were bound. LabKit binds propositions,
 * findings, verdicts and event payloads. `src/mcp/server.ts` deliberately does
 * not catch, so that message reaches the calling agent verbatim as
 * `isError: true` — `src/db/trace.ts` already refuses to log parameters for
 * this reason, and moving the relational half onto an ORM must not quietly
 * undo it. `unwrapped()` (`src/db/orm.ts`) rethrows the driver's own error,
 * SQLSTATE intact, from the `cause`.
 *
 * Drizzle offers no hook for this, so it is applied per operation by the
 * caller — which means a new call site can forget, and nothing would say so
 * until a bound value turned up in someone's terminal. This is what says so.
 *
 * **The rule is deliberately about the handle, not about awaits.** A drizzle
 * builder is thenable and single-use, and the awaits are spread across
 * branches, `$dynamic()` chains and `.limit()` continuations — matching those
 * would be matching a shape. Every one of them starts at the value `ormOver()`
 * returned, so that is what gets tracked: each reference to it must have an
 * `unwrapped(` call somewhere above it in the tree.
 */

import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src"];
const WRAPPER = "unwrapped";
const FACTORY = "ormOver";

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}

/** Walks up to the source file, asking whether any ancestor is `unwrapped(…)`. */
function insideWrapper(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === WRAPPER) {
      // Argument position only, so the identifier `unwrapped` itself is never
      // counted as being inside its own call. It is *not* a guard against
      // `unwrapped(orm.select()…)` — that eager form would leak, and this
      // check passes it. The type system refuses it first: the parameter is
      // `() => Promise<T>`, so a builder there is a compile error and needed an
      // `as never` to construct at all. Recorded because trying it is what
      // showed the comment here previously claimed a guard it does not have.
      if (n.arguments.some((a) => a.pos <= node.pos && node.end <= a.end)) return true;
    }
  }
  return false;
}

const failures: string[] = [];

for (const file of ROOTS.flatMap((r) => sources(r))) {
  const text = readFileSync(file, "utf8");
  if (!text.includes(`${FACTORY}(`)) continue;

  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const at = (n: ts.Node) => source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1;

  // The names bound to an `ormOver(...)` result in this file.
  const handles = new Set<string>();
  const findHandles = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      ts.isIdentifier(n.initializer.expression) &&
      n.initializer.expression.text === FACTORY
    ) {
      handles.add(n.name.text);
    }
    ts.forEachChild(n, findHandles);
  };
  findHandles(source);
  if (handles.size === 0) continue;

  const check = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && handles.has(n.text)) {
      const declaring = ts.isVariableDeclaration(n.parent) && n.parent.name === n;
      if (!declaring && !insideWrapper(n)) {
        failures.push(`${file}:${at(n)} — \`${n.text}\` used outside \`${WRAPPER}()\``);
      }
    }
    ts.forEachChild(n, check);
  };
  check(source);
}

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} ORM use(s) outside \`${WRAPPER}()\`:`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("");
  console.error(`  A drizzle error prints the parameters it bound. Wrap the operation:`);
  console.error(`    const rows = await ${WRAPPER}(async () => orm.select()…);`);
  process.exit(1);
}

console.log(`OK: every ORM handle is used only inside ${WRAPPER}().`);
