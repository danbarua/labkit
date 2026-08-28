/**
 * Which directory holds the record, and the two ways of getting it wrong.
 *
 * `resolveProjectRoot()` (`src/db/connect.ts`) is the whole of that decision,
 * pure and parameterised so these cases cost no database. The last `describe`
 * is the exception and says why: it is about *when* the question is asked
 * rather than how it is answered, which only `connectDb` can show. Both behaviours it
 * asserts were defects, and they failed in opposite directions: a mistyped
 * `LABKIT_HOME` used to be *created*, and a working directory below a project
 * root used to be taken at face value. Each produced a fresh empty record that
 * a reader cannot tell from a project nobody has worked on yet.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { connectDb, dotGitProjectRoot, resolveProjectRoot } from "../src/db/connect";

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

/**
 * The filesystem answer, tested directly — it is the case the walk cannot solve
 * and the environment `bun run build` ships into: a compiled binary on a host
 * without git. Found in review; the fallback could not fix the bug it was the
 * fallback for, because a sibling worktree walks up and misses the repository
 * exactly as before.
 *
 * **Tested directly rather than through `resolveProjectRoot`, and the reason is
 * measured.** Under bun 1.3.14 `spawnSync` finds `git` with `PATH` set to the
 * empty string, unset, or pointing at an empty directory — all three checked —
 * so the subprocess cannot be made to fail in-process and the fallback cannot
 * be reached that way. The first version of this block tried, and its own
 * control caught it: four tests were passing through the subprocess and
 * asserting nothing about the code they named. The composition is a single
 * `??`; the logic is what these cover.
 */
describe("dotGitProjectRoot — the answer with no git to ask", () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

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

  test("a sibling worktree names its repository", () => {
    const { root, worktree } = repoWithWorktree();
    expect(dotGitProjectRoot(worktree)).toBe(root);
  });

  test("and so does a subdirectory of one", () => {
    const { root, worktree } = repoWithWorktree();
    const nested = join(worktree, "packages", "foo");
    mkdirSync(nested, { recursive: true });
    expect(dotGitProjectRoot(nested)).toBe(root);
  });

  test("it agrees with git, which is the whole claim", () => {
    const { worktree } = repoWithWorktree();
    const viaGit = git(worktree, "rev-parse", "--path-format=absolute", "--git-common-dir").trim();
    expect(dotGitProjectRoot(worktree)).toBe(dirname(realpathSync(viaGit)));
  });

  test("a normal checkout, where .git is a directory", () => {
    const { root } = repoWithWorktree();
    expect(dotGitProjectRoot(root)).toBe(root);
  });

  test("`--separate-git-dir` is declined rather than guessed at", () => {
    const base = realpathSync(scratch());
    const tree = join(base, "tree");
    mkdirSync(tree);
    git(base, "init", "-q", "--separate-git-dir", join(base, "elsewhere.git"), tree);
    // Names a directory with no `worktrees/` component and no reliable path
    // back to a working tree. Refused, so the caller falls through to the walk.
    expect(dotGitProjectRoot(tree)).toBeUndefined();
  });

  test("outside a repository there is nothing to read", () => {
    expect(dotGitProjectRoot(realpathSync(scratch()))).toBeUndefined();
  });
});

describe("connectDb asks for a project root only when it needs one", () => {
  /**
   * `LABKIT_DB_URL` is checked before the root is resolved.
   *
   * This was a default parameter until 2026-08-28 —
   * `connectDb(projectRoot = resolveProjectRoot())` — and JavaScript evaluates
   * a default on entry, before the body reads the environment. The doc comment
   * claiming `LABKIT_DB_URL` "wins over both" was true of the outcome and false
   * of the order.
   *
   * **Asserted on which error, not on success**, because a connection to a
   * closed port must still fail. A `LABKIT_HOME` error means the root was
   * resolved; anything else means it was not, which is the whole claim. Seen
   * red before it was written: with the default parameter in place this threw
   * `LABKIT_HOME names a directory that does not exist` and never reached the
   * connection string.
   */
  test("a missing LABKIT_HOME does not stop a URL-backed connection", async () => {
    const missing = join(scratch(), "not-here");
    const url = process.env.LABKIT_DB_URL;
    const home = process.env.LABKIT_HOME;
    // Port 1 is refused immediately rather than timing out, so this costs no
    // wall time and needs nothing listening.
    process.env.LABKIT_DB_URL = "postgres://nobody@127.0.0.1:1/none";
    process.env.LABKIT_HOME = missing;
    try {
      let message = "";
      try {
        await connectDb();
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).not.toBe("");
      expect(message).not.toContain("LABKIT_HOME");
      expect(message).not.toContain(missing);
    } finally {
      if (url === undefined) delete process.env.LABKIT_DB_URL;
      else process.env.LABKIT_DB_URL = url;
      if (home === undefined) delete process.env.LABKIT_HOME;
      else process.env.LABKIT_HOME = home;
    }
  });
});
