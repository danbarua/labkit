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
import { mkdtempSync, mkdirSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
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

/**
 * A worktree is a **sibling** of the main checkout, not a descendant, so
 * walking up from one never passes through it. Every session in this project
 * runs in a worktree, and three `.labkit/` databases had accumulated for one
 * project before anyone looked — 41M, 60M and 41M, written on three different
 * days.
 *
 * These build real repositories and real worktrees rather than faking the
 * layout, because the bug *is* the layout: a test that only ever runs in a
 * normal checkout cannot fail either way, which is the shape that let this
 * ship.
 */
describe("a worktree resolves to the repository, not to itself", () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

  /**
   * A repository with one commit, and a worktree beside it.
   *
   * `realpathSync` because git reports resolved paths and macOS files temp
   * directories under `/var`, which is a symlink to `/private/var`. Without it
   * every assertion here fails on the prefix while naming the same directory —
   * a test artefact, not a defect, but one that would otherwise read as one.
   */
  function repoWithWorktree(): { root: string; worktree: string } {
    const base = realpathSync(scratch());
    const root = join(base, "project");
    mkdirSync(root);
    git(root, "init", "-q", "-b", "main");
    git(
      root,
      "-c",
      "user.email=t@t",
      "-c",
      "user.name=t",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "base",
    );
    const worktree = join(base, "project.worktrees", "feature");
    git(root, "worktree", "add", "-q", "-b", "feature", worktree);
    return { root, worktree };
  }

  test("from the worktree itself", () => {
    const { root, worktree } = repoWithWorktree();
    expect(resolveProjectRoot(worktree, undefined)).toBe(root);
  });

  test("from a subdirectory of the worktree", () => {
    const { root, worktree } = repoWithWorktree();
    const nested = join(worktree, "packages", "foo");
    mkdirSync(nested, { recursive: true });
    expect(resolveProjectRoot(nested, undefined)).toBe(root);
  });

  test("the main checkout resolves to itself, so there is no special case", () => {
    const { root } = repoWithWorktree();
    expect(resolveProjectRoot(root, undefined)).toBe(root);
  });

  test("an existing .labkit in the worktree does not win", () => {
    const { root, worktree } = repoWithWorktree();
    // This is the state the machine was already in: a record per worktree.
    // The repository is still the answer.
    mkdirSync(join(worktree, ".labkit"));
    expect(resolveProjectRoot(worktree, undefined)).toBe(root);
  });

  test("LABKIT_HOME still wins, so per-branch stays available", () => {
    const { worktree } = repoWithWorktree();
    expect(resolveProjectRoot(worktree, worktree)).toBe(worktree);
  });

  test("outside a repository it falls back to the walk", () => {
    const base = realpathSync(scratch());
    mkdirSync(join(base, ".labkit"));
    const nested = join(base, "a", "b");
    mkdirSync(nested, { recursive: true });
    // No git anywhere above: the walk is what answers.
    expect(resolveProjectRoot(nested, undefined)).toBe(base);
  });
});
