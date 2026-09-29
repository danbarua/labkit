#!/usr/bin/env bun
/**
 * The types in `packages/app-vscode/webview` agree, under its own compiler options.
 *
 * The webview is a browser bundle (DOM, JSX) inside a package whose extension-host code is
 * plain Bun/Node; the root `tsconfig.json` excludes it for the same reason it excludes
 * `packages/app-web`, and this is what stops that exclusion being a hole.
 *
 * retire-when: the sweep runs each workspace's own `typecheck` without being told which ones
 * exist.
 *
 * Usage: bun run vscode:check-types
 * Exit:  0 when the types agree, 1 otherwise.
 */

const proc = Bun.spawn(
  ["bunx", "--bun", "tsc", "--noEmit", "-p", "packages/app-vscode/tsconfig.json"],
  {
    stdout: "inherit",
    stderr: "inherit",
  },
);
const code = await proc.exited;
if (code !== 0) {
  console.log("FAILED: packages/app-vscode/webview does not typecheck.");
  process.exit(1);
}
console.log("OK: packages/app-vscode/webview typechecks under its own tsconfig.");
