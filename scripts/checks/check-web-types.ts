#!/usr/bin/env bun
/**
 * The types in `packages/app-web` agree, under its own compiler options.
 *
 * `packages/app-web` is a separate project: it needs the DOM lib and JSX, which the CLI's
 * `tsconfig.json` does not have. The root `tsconfig.json` excludes it for that
 * reason, and this is what stops the exclusion being a hole — the sweep still
 * typechecks every file, each under the options it was written for.
 *
 * retire-when: the sweep runs each workspace's
 * own `typecheck` without being told which ones exist.
 *
 * Usage: bun run check:web-types
 * Exit:  0 when the types agree, 1 otherwise.
 */

const proc = Bun.spawn(["bun", "run", "typecheck"], {
  cwd: "packages/app-web",
  stdout: "inherit",
  stderr: "inherit",
});
const code = await proc.exited;
if (code !== 0) {
  console.log("FAILED: packages/app-web does not typecheck.");
  process.exit(1);
}
console.log("OK: packages/app-web typechecks under its own tsconfig.");
