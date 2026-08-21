/**
 * The CLI is read-only, and the test that matters is the structural one.
 *
 * It constructs a `ReadSurface`, never a `ResearchSession`, so no write verb is
 * in scope to reach for. That is the property worth asserting: a convention
 * that the CLI "only reads" is worth nothing next to a surface that cannot
 * write.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ReadSurface, WriteSurface } from "../src/domain";

const source = readFileSync("src/cli.ts", "utf8");
/** Comments explain what the CLI deliberately does not do, and naming a thing
 *  in prose is not importing it. Strip them before checking. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the CLI imports the read half and not the write half", () => {
  expect(code).toContain("ReadSurface");
  expect(code).not.toContain("WriteSurface");
  expect(code).not.toContain("ResearchSession");
});

test("no write verb name appears in the CLI", () => {
  // Every method on WriteSurface, checked against the CLI's text. A new write
  // verb added later is covered automatically -- the list is derived, not typed
  // out, so this cannot go stale the way a hand-written list would.
  const writeVerbs = Object.getOwnPropertyNames(WriteSurface.prototype).filter(
    (n) => n !== "constructor" && !n.startsWith("_"),
  );
  expect(writeVerbs.length).toBeGreaterThan(10);
  const leaked = writeVerbs.filter((v) => new RegExp(`\\b${v}\\s*\\(`).test(code));
  expect(leaked).toEqual([]);
});

test("every command the usage text advertises is implemented", () => {
  const advertised = [...source.matchAll(/^ {2}labkit (\w+)/gm)].map((m) => m[1]);
  expect(advertised.length).toBeGreaterThan(0);
  const handled = [...source.matchAll(/^ {6}case "(\w+)":/gm)].map((m) => m[1]);
  for (const command of advertised) expect(handled).toContain(command);
});

test("the read surface exposes what the CLI calls", () => {
  for (const method of ["whatIsKnown", "whatWasKnown", "whySupported", "whatDependsOn", "enquiryStatus"]) {
    expect(typeof (ReadSurface.prototype as unknown as Record<string, unknown>)[method]).toBe("function");
  }
});
