/**
 * Which directory holds the record, and the two ways of getting it wrong.
 *
 * `resolveProjectRoot()` (`src/db/connect.ts`) is the whole of that decision,
 * pure and parameterised so these cases cost no database. Both behaviours it
 * asserts were defects, and they failed in opposite directions: a mistyped
 * `LABKIT_HOME` used to be *created*, and a working directory below a project
 * root used to be taken at face value. Each produced a fresh empty record that
 * a reader cannot tell from a project nobody has worked on yet.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProjectRoot } from "../src/db/connect";

const scratch = () => mkdtempSync(join(tmpdir(), "labkit-root-"));

describe("LABKIT_HOME", () => {
  test("a directory that exists is used as-is", () => {
    const dir = scratch();
    expect(resolveProjectRoot("/somewhere/else", dir)).toBe(dir);
  });

  test("a directory that does not exist is refused, and the message names it", () => {
    const missing = join(scratch(), "typo", "deeper");
    expect(() => resolveProjectRoot("/somewhere/else", missing)).toThrow(missing);
  });

  test("it is refused rather than created — the old behaviour built the path", () => {
    const missing = join(scratch(), "typo");
    expect(() => resolveProjectRoot("/somewhere/else", missing)).toThrow(/does not exist/);
    // The point of the refusal: nothing is left behind to be found next time.
    expect(() => resolveProjectRoot("/somewhere/else", missing)).toThrow();
  });

  test("it wins over an existing record above the working directory", () => {
    const root = scratch();
    mkdirSync(join(root, ".labkit"));
    const nested = join(root, "packages", "foo");
    mkdirSync(nested, { recursive: true });
    const other = scratch();
    expect(resolveProjectRoot(nested, other)).toBe(other);
  });
});

describe("with LABKIT_HOME unset", () => {
  test("an existing record above the working directory is found", () => {
    const root = scratch();
    mkdirSync(join(root, ".labkit"));
    const nested = join(root, "packages", "foo", "src");
    mkdirSync(nested, { recursive: true });
    expect(resolveProjectRoot(nested, undefined)).toBe(root);
  });

  test("the working directory wins when it holds the record itself", () => {
    const root = scratch();
    mkdirSync(join(root, ".labkit"));
    expect(resolveProjectRoot(root, undefined)).toBe(root);
  });

  test("no record anywhere above means create here, exactly as before", () => {
    const nested = join(scratch(), "a", "b");
    mkdirSync(nested, { recursive: true });
    // Not the filesystem root, and not a parent: the walk only ever *finds*.
    expect(resolveProjectRoot(nested, undefined)).toBe(nested);
  });

  test("the walk terminates at the filesystem root", () => {
    expect(resolveProjectRoot("/", undefined)).toBe("/");
  });
});
