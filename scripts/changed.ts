#!/usr/bin/env bun
/**
 * Which packages a change reaches, and the tests that cover them.
 *
 * Everything here is derived. The package graph comes from the `@labkit`
 * entries in each package manifest, and a test belongs to a package
 * because it imports `@labkit/<that one>` — so a package added or a dependency
 * declared is picked up without editing this file.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/** Each package, and the sibling packages it declares a dependency on. */
export function packageGraph(): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const pkg of readdirSync("packages")) {
    const manifest = join("packages", pkg, "package.json");
    if (!existsSync(manifest)) continue;
    const declared = JSON.parse(readFileSync(manifest, "utf8")).dependencies ?? {};
    graph.set(
      pkg,
      new Set(
        Object.keys(declared)
          .filter((d) => d.startsWith("@labkit/"))
          .map((d) => d.slice("@labkit/".length)),
      ),
    );
  }
  return graph;
}

/**
 * The changed packages, plus everything that depends on them.
 *
 * A change to `core-db` reaches `core-domain` and both apps, so their tests run
 * too. Walked to a fixed point rather than one level, because the graph is
 * declared and may grow deeper.
 */
export function reached(changed: Set<string>, graph: Map<string, Set<string>>): Set<string> {
  const out = new Set(changed);
  for (;;) {
    const before = out.size;
    for (const [pkg, on] of graph) {
      if (!out.has(pkg) && [...on].some((d) => out.has(d))) out.add(pkg);
    }
    if (out.size === before) return out;
  }
}

/** Every `.ts` under a directory. */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (path.endsWith(".ts")) found.push(path);
  }
  return found;
}

/**
 * The test files that exercise any of `packages`.
 *
 * Attributed by the specifier a test imports, which is only readable because
 * nothing crosses a package edge by relative path any more. A test importing
 * no labkit package at all belongs to every run: it tests the harness or the
 * tree, and there is nothing to scope it by.
 */
export function testsFor(packages: Set<string>): string[] {
  return walk("tests").filter((file) => {
    const used = [...readFileSync(file, "utf8").matchAll(/from\s+"@labkit\/([a-z-]+)/g)].map(
      (m) => m[1] as string,
    );
    return used.length === 0 || used.some((u) => packages.has(u));
  });
}

/** Paths whose change cannot be scoped to one package. */
const TREE_WIDE = [
  "package.json",
  "bun.lock",
  "tsconfig.json",
  "biome.jsonc",
  ".dependency-cruiser.cjs",
  "scripts/",
  "drizzle/",
];

/**
 * What a diff against `base` touches: the packages, or `null` for everything.
 *
 * `null` rather than "all packages", because a change to `scripts/` or the
 * lockfile is not a change to a package and the honest answer is that nothing
 * is scoped out.
 */
export function changedPackages(base: string): Set<string> | null {
  // Two dots, against the working tree: locally the change is usually not
  // committed yet, and in CI the working tree is the pull request's head.
  const proc = Bun.spawnSync(["git", "diff", "--name-only", base]);
  if (proc.exitCode !== 0) return null;
  const files = new TextDecoder().decode(proc.stdout).trim().split("\n").filter(Boolean);
  // An empty diff is not "nothing to test". It is also what a base that does
  // not resolve, or a checkout that is not what it was thought to be, looks
  // like — and those must run everything rather than the five files that
  // import no package.
  if (files.length === 0) return null;
  const packages = new Set<string>();
  for (const file of files) {
    if (TREE_WIDE.some((p) => file === p || file.startsWith(p))) return null;
    const m = /^packages\/([a-z-]+)\//.exec(file);
    if (m) packages.add(m[1] as string);
    else if (file.startsWith("web/")) packages.add("web");
    else if (file.startsWith("tests/")) continue;
    else return null;
  }
  return packages;
}

if (import.meta.main) {
  const base = process.argv[2] ?? "origin/main";
  const changed = changedPackages(base);
  if (changed === null) {
    console.log("everything — the change is not scoped to a package");
  } else {
    const all = reached(changed, packageGraph());
    console.log(`changed:  ${[...changed].sort().join(", ") || "(nothing)"}`);
    console.log(`reached:  ${[...all].sort().join(", ") || "(nothing)"}`);
    console.log(`tests:    ${testsFor(all).length} files`);
  }
}
