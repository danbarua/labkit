#!/usr/bin/env bun
/**
 * Every `bunx` of a node-shebanged binary passes `--bun`, so no step runs under ambient node.
 *
 * `depcruise`, `depcruise-fmt` and `tsc` all carry `#!/usr/bin/env node`, so a
 * plain `bunx` hands them to whatever `node` happens to be first on the
 * caller's PATH — not to bun, and not to the node bun ships. The result of a
 * step then depends on the shell it was typed in rather than on the checkout.
 *
 * Measured 2026-09-07 on two machines at the same commit: `bun run check`'s
 * depcruise step reported `Your node version (20.17.0) is not supported`
 * (dependency-cruiser wants `^22||^24||>=26`) on one and passed on the other,
 * whose ambient node was 26.7.0. Every other step was green, so the failure
 * read as "the layering rules broke" until someone opened the log.
 *
 * `--bun` is also not slower: depcruise over `src tests` is 0.45s under bun
 * against 0.53s under node 26.7.0, two runs each, same day.
 *
 * **Scoped to the binaries that actually have a node shebang.** A `bunx` of
 * something bun-native is unaffected, and forcing `--bun` on a package that
 * needs node would trade one broken step for another.
 *
 * Usage: bun run check:bunx-bun
 * Exit:  0 when every such call passes `--bun`, 1 otherwise.
 *
 * retire-when: bunx passes --bun by default, or these binaries drop their node shebang.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** The binaries this repo runs through `bunx` that start with `#!/usr/bin/env node`. */
const NODE_SHEBANGED = ["depcruise", "depcruise-fmt", "tsc"];

const SELF = "check-bunx-bun.ts";

/**
 * The scripts, and `package.json` where the `typecheck` command lives.
 *
 * **Counted separately, because `package.json` is always there.** Including it
 * in one total let the first version of this report `OK: 1 files` over a tree
 * with no scripts in it at all — which `check:empty-population` caught, being
 * the exact shape it exists for.
 */
const SCRIPTS = readdirSync("scripts")
  .sort()
  .filter((f) => f !== SELF && (f.endsWith(".ts") || f.endsWith(".sh")))
  .map((f) => join("scripts", f));
const FILES = [...(existsSync("package.json") ? ["package.json"] : []), ...SCRIPTS];

/**
 * `bunx` reaching one of those binaries without `--bun` in between.
 *
 * Both spellings, because this repo writes each: a shell command
 * (`bunx depcruise …`) and an argv array (`["bunx", "depcruise", …]`). The
 * array form is the one that broke the sweep, and a check that missed it would
 * not have caught the defect it exists for.
 */
const CALLS = NODE_SHEBANGED.flatMap((bin) => [
  new RegExp(String.raw`\bbunx\s+(?!--bun\b)[\w@/.-]*\s*\b${bin}\b`),
  new RegExp(String.raw`["']bunx["']\s*,\s*(?!["']--bun["'])["']${bin}["']`),
]);

/** Prose naming these commands is all over this repo and is not a call. */
function code(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed.startsWith("*")) return "";
  return line.split("//")[0] ?? "";
}

const offenders: string[] = [];
let scanned = 0;
for (const path of FILES) {
  scanned++;
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const source = code(line);
      if (CALLS.some((rx) => rx.test(source))) offenders.push(`${path}:${i + 1}: ${source.trim()}`);
    });
}

if (offenders.length > 0) {
  console.error("FAILED: `bunx` without `--bun` runs a node-shebanged binary under whatever");
  console.error("        node is on PATH, so the step's result depends on the shell, not the");
  console.error("        checkout — and dependency-cruiser refuses to start below node 22.");
  console.error("");
  for (const o of offenders) console.error(`  ${o}`);
  console.error("");
  console.error("Pass `--bun`: `bunx --bun depcruise …`. See this script's header.");
  process.exit(1);
}

// A check that examined nothing reports the same OK: as one that examined
// everything and found it good -- `check:empty-population` holds every check
// here to failing instead.
if (SCRIPTS.length === 0) {
  console.error("FAILED: no scripts under scripts/ — this check examined nothing.");
  process.exit(1);
}
console.log(
  `OK: ${scanned} files (${SCRIPTS.length} scripts), every bunx of a node-shebanged binary passes --bun.`,
);
