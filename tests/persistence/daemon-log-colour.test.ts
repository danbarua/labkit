/**
 * The record daemon's stderr lines take the CLI's colour decision. `FORCE_COLOR=1` is the
 * control: a piped run is uncoloured without it, and a case passing without colour would show
 * nothing.
 */

import { expect, test } from "bun:test";
import { join } from "node:path";

const DAEMON = join(import.meta.dir, "..", "..", "packages", "core-db", "daemon-main.ts");
const ESC = "\u001b[";

/** The daemon entry run with no data directory: it prints its usage line and exits 2. */
function usageLine(colour: Record<string, string>): string {
  const { NO_COLOR: _no, FORCE_COLOR: _force, CI: _ci, TERM: _term, ...env } = process.env;
  const run = Bun.spawnSync([process.execPath, DAEMON], { env: { ...env, ...colour } });
  expect(run.exitCode).toBe(2);
  const stderr = run.stderr.toString();
  expect(stderr).toContain("usage: daemon-main.ts <datadir>");
  return stderr;
}

test("FORCE_COLOR=1 colours the daemon's stderr", () => {
  expect(usageLine({ FORCE_COLOR: "1" })).toContain(ESC);
});

test("NO_COLOR keeps the daemon's stderr plain, even beside FORCE_COLOR", () => {
  // Bun's `console.error` colours this case; the daemon's lines no longer go through it.
  expect(usageLine({ FORCE_COLOR: "3", NO_COLOR: "1" })).not.toContain(ESC);
});

test("FORCE_COLOR=0 keeps the daemon's stderr plain", () => {
  expect(usageLine({ FORCE_COLOR: "0" })).not.toContain(ESC);
});
