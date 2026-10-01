/**
 * `--no-ansi`, `NO_COLOR` and `FORCE_COLOR=0` turn colour off on stdout and stderr alike, through
 * the real CLI. `FORCE_COLOR=1` is the control: without it a piped run is uncoloured anyway, and
 * a case passing without colour would show nothing.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "..", "packages", "app-cli", "cli.ts");
const ESC = "\u001b[";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "labkit-colour-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * A read whose heading is coloured, and two reads that fail, under one environment. A failure's
 * line goes to stderr and nothing goes to stdout.
 */
function both(flags: string[], colour: Record<string, string>) {
  const {
    LABKIT_DB_URL: _url,
    LABKIT_HOME: _home,
    NO_COLOR: _no,
    FORCE_COLOR: _force,
    CI: _ci,
    ...env
  } = process.env;
  const run = (args: string[]) =>
    Bun.spawnSync([process.execPath, CLI, "--db", dir, ...flags, ...args], {
      cwd: dir,
      env: { ...env, ...colour },
    });
  const listed = run(["claims"]);
  expect(listed.exitCode).toBe(0);
  const refusals = [run(["why", "CLM_999999"]), run(["get", "NOPE_1"])];
  for (const refused of refusals) {
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout.toString()).toBe("");
    expect(refused.stderr.toString()).toContain("labkit: ");
  }
  return {
    stdout: listed.stdout.toString(),
    stderr: refusals.map((r) => r.stderr.toString()).join(""),
  };
}

test("FORCE_COLOR=1 colours stdout and stderr", () => {
  const { stdout, stderr } = both([], { FORCE_COLOR: "1" });
  expect(stdout).toContain(ESC);
  expect(stderr).toContain(ESC);
});

test("an empty NO_COLOR is not set", () => {
  const { stdout, stderr } = both([], { FORCE_COLOR: "1", NO_COLOR: "" });
  expect(stdout).toContain(ESC);
  expect(stderr).toContain(ESC);
});

test.each([
  ["--no-ansi", ["--no-ansi"], { FORCE_COLOR: "1" }],
  ["NO_COLOR=1", [], { FORCE_COLOR: "1", NO_COLOR: "1" }],
  ["FORCE_COLOR=0", [], { FORCE_COLOR: "0" }],
] as const)("%s leaves stdout and stderr uncoloured", (_name, flags, colour) => {
  const { stdout, stderr } = both([...flags], { ...colour });
  expect(stdout).not.toContain(ESC);
  expect(stderr).not.toContain(ESC);
});
