/**
 * The API's routes for a workspace's git history, through `handle()`, against the fixture's
 * workspaces with a temporary repository mapped to `alpha` and none to `beta`.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: response bodies are read loosely; each test asserts only the part of the shape it is about

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DIFF_LIMIT, FILE_LIMIT } from "../src/server/git-handler";
import { handle } from "../src/server/handler";
import { createRuntime, type Runtime } from "../src/server/runtime";
import { createFixture, type Fixture } from "./support/fixture";
import { BIG_TEXT, createGitFixture, type GitFixture } from "./support/git-fixture";

const ORIGIN = "http://127.0.0.1:8899";

let runtime: Runtime;
let fixture: Fixture;
let git: GitFixture;

beforeAll(async () => {
  fixture = await createFixture("pglite");
  git = await createGitFixture();
  runtime = createRuntime(fixture.connections, new Map([["alpha", git.repo]]));
}, 60_000);

afterAll(async () => {
  await fixture?.close();
  await git?.close();
});

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await handle(new Request(ORIGIN + path), runtime);
  return { status: res.status, body: await res.json() };
}

const commitHref = (id: string) => `${ORIGIN}/workspace/alpha/commit/${id}`;

describe("a workspace's index", () => {
  test("lists the files and history of a workspace with a repository, after its records", async () => {
    const { body } = await get("/workspace/alpha");
    const listed = body._embedded.collection.map((c: any) => [c.slug, c.type]);
    expect(listed.slice(-3)).toEqual([
      ["act", "Act"],
      ["file", "File"],
      ["commit", "Commit"],
    ]);
    expect(body._embedded.collection.at(-1)._links.self.href).toBe(
      `${ORIGIN}/workspace/alpha/commit`,
    );
  });

  test("lists no files or history for a workspace without one", async () => {
    const { body } = await get("/workspace/beta");
    const slugs = body._embedded.collection.map((c: any) => c.slug);
    expect(slugs.at(-1)).toBe("act");
    expect(slugs).not.toContain("file");
    expect(slugs).not.toContain("commit");
  });
});

const fileHref = (path: string) => `${ORIGIN}/workspace/alpha/file/${path}`;

describe("a workspace's files", () => {
  test("the top directory at HEAD lists its directories, then its files, by name, case aside", async () => {
    const { status, body } = await get("/workspace/alpha/file");
    expect(status).toBe(200);
    expect(body.type).toBeUndefined();
    expect(body.path).toBe("");
    expect(body._links.index.href).toBe(`${ORIGIN}/workspace/alpha`);
    expect(body._embedded.file.map((e: any) => [e.type, e.name])).toEqual([
      ["Directory", "notes"],
      ["Directory", "src"],
      ["File", "big.txt"],
      // "readme-" before "README.": case aside, and a hyphen before a full stop.
      ["File", "readme-link"],
      ["File", "README.md"],
    ]);
    expect(body._embedded.file[1]._links.self).toEqual({
      href: fileHref("src"),
      type: "Directory",
    });
  });

  test("a directory pages its entries and links up to the directory it is in", async () => {
    const { body } = await get("/workspace/alpha/file/notes?limit=1");
    expect(body.path).toBe("notes");
    expect(body.total).toBe(2);
    expect(body._embedded.file.map((e: any) => e.path)).toEqual(["notes/latin1.txt"]);
    expect(body._links.index.href).toBe(fileHref("").slice(0, -1));
    expect(body._links.next.href).toBe(`${fileHref("notes")}?limit=1&offset=1`);
  });

  test("a file at HEAD has its text, the commit it was read at, and its directory", async () => {
    const third = git.commits[2]!;
    const { status, body } = await get("/workspace/alpha/file/src/a.ts");
    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: "src/a.ts",
      type: "File",
      name: "a.ts",
      path: "src/a.ts",
      mode: "file",
      size: 20,
      binary: false,
      content: "export const a = 2;\n",
      content_truncated: false,
      commit: third,
      _links: {
        self: { href: fileHref("src/a.ts"), type: "File" },
        index: { href: fileHref("src") },
        commit: { href: commitHref(third), type: "Commit" },
      },
    });
  });

  test("a file at an earlier commit has its text as it was then", async () => {
    const first = git.commits[0]!;
    const { body } = await get(`/workspace/alpha/commit/${first}/file/src/a.ts`);
    expect(body.content).toBe("export const a = 1;\n");
    expect(body.commit).toBe(first);
    expect(body._links.index.href).toBe(`${commitHref(first)}/file/src`);
  });

  test("a binary file has its size and no text", async () => {
    const { body } = await get(`/workspace/alpha/commit/${git.commits[0]}/file/data/blob.bin`);
    expect(body).toMatchObject({ binary: true, size: 6 });
    expect(body.content).toBeUndefined();
  });

  test("text that is not UTF-8 is served without its content, and says so", async () => {
    const { body } = await get("/workspace/alpha/file/notes/latin1.txt");
    expect(body).toMatchObject({ binary: false, utf8: false, size: 5 });
    expect(body.content).toBeUndefined();
  });

  test("a symbolic link's content is the path it points to, which is not followed", async () => {
    const { body } = await get("/workspace/alpha/file/readme-link");
    expect(body).toMatchObject({ mode: "symlink", content: "README.md" });
  });

  test("text longer than the limit is cut there and flagged", async () => {
    const { body } = await get("/workspace/alpha/file/big.txt");
    expect(body.size).toBe(BIG_TEXT.length);
    expect(body.content).toHaveLength(FILE_LIMIT);
    expect(body.content_truncated).toBe(true);
  });

  test("a path git does not hold is not found, including one that climbs out of the tree", async () => {
    for (const path of [
      "missing.txt",
      "data/blob.bin",
      "..%2F..%2Fetc%2Fpasswd",
      "src%2F..%2F..%2F.git%2Fconfig",
    ]) {
      const { status } = await get(`/workspace/alpha/file/${path}`);
      expect([path, status]).toEqual([path, 404]);
    }
  });

  test("a workspace with no repository mapped serves no files", async () => {
    const { status, body } = await get("/workspace/beta/file");
    expect(status).toBe(404);
    expect(body.detail).toBe("beta has no git repository mapped to it");
  });
});

describe("a workspace's history", () => {
  test("lists the commits from HEAD, newest first, by page", async () => {
    const [first, second, third] = git.commits;
    const page = await get("/workspace/alpha/commit?limit=2");
    expect(page.status).toBe(200);
    expect(page.body.count).toBe(2);
    expect(page.body._embedded.commit.map((c: any) => [c.id, c.type, c.name])).toEqual([
      [third, "Commit", "Drop the blob, add a big file"],
      [second, "Commit", "Change a, plan the work"],
    ]);
    expect(page.body._embedded.commit[0]).toMatchObject({
      author: "Ada Tester",
      at: "2026-09-21T14:15:20.000Z",
      _links: { self: { href: commitHref(third!), type: "Commit" } },
    });
    expect(page.body._links.next.href).toBe(`${ORIGIN}/workspace/alpha/commit?limit=2&offset=2`);
    const last = await get("/workspace/alpha/commit?limit=2&offset=2");
    expect(last.body._embedded.commit.map((c: any) => c.id)).toEqual([first]);
    expect(last.body._links.next).toBeUndefined();
  });

  test("serves a commit with its message, parents, changed files and diff from its first parent", async () => {
    const [first, second] = git.commits;
    const { status, body } = await get(`/workspace/alpha/commit/${second}`);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: second,
      type: "Commit",
      name: "Change a, plan the work",
      message: "Change a, plan the work",
      files_changed: 4,
      // latin1.txt 1, plan.md 2, readme-link 1, a.ts 1.
      insertions: 5,
      deletions: 1,
      diff_truncated: false,
      changes: [
        { path: "notes/latin1.txt", status: "Added" },
        { path: "notes/plan.md", status: "Added" },
        { path: "readme-link", status: "Added" },
        { path: "src/a.ts", status: "Modified" },
      ],
      _links: {
        index: { href: `${ORIGIN}/workspace/alpha/commit` },
        parent: [{ href: commitHref(first!), type: "Commit" }],
      },
    });
    expect(body.diff).toContain("-export const a = 1;\n+export const a = 2;");
  });

  test("a root commit has no parents, and its diff adds every file", async () => {
    const { body } = await get(`/workspace/alpha/commit/${git.commits[0]}`);
    expect(body.message).toBe("Start the project\n\nThe first files.");
    expect(body._links.parent).toEqual([]);
    expect(body.changes.map((c: any) => [c.path, c.status])).toEqual([
      ["README.md", "Added"],
      ["data/blob.bin", "Added"],
      ["src/a.ts", "Added"],
    ]);
    expect(body.diff).toContain(
      "diff --git a/data/blob.bin b/data/blob.bin\nBinary files differ\n",
    );
    expect(body.diff).toContain(
      "--- /dev/null\n+++ b/src/a.ts\n@@ -0,0 +1,1 @@\n+export const a = 1;",
    );
  });

  test("links each changed file at the commit, and a deleted file at the first parent", async () => {
    const [, second, third] = git.commits;
    const { body } = await get(`/workspace/alpha/commit/${third}`);
    expect(body._links.tree.href).toBe(`${commitHref(third!)}/file`);
    expect(body._links.changed).toEqual([
      { href: `${commitHref(third!)}/file/big.txt`, type: "File", title: "Added" },
      { href: `${commitHref(second!)}/file/data/blob.bin`, type: "File", title: "Deleted" },
    ]);
    expect(body._embedded.changed.map((f: any) => [f.path, f.status, f.type])).toEqual([
      ["big.txt", "Added", "File"],
      ["data/blob.bin", "Deleted", "File"],
    ]);
  });

  test("a diff longer than the limit is cut there and flagged", async () => {
    const { body } = await get(`/workspace/alpha/commit/${git.commits[2]}`);
    expect(body.diff_truncated).toBe(true);
    expect(body.diff).toHaveLength(DIFF_LIMIT);
    expect(body.changes.map((c: any) => [c.path, c.status])).toEqual([
      ["big.txt", "Added"],
      ["data/blob.bin", "Deleted"],
    ]);
  });

  test("a commit the repository does not hold is not found, and says so", async () => {
    const { status, body } = await get(`/workspace/alpha/commit/${"0".repeat(40)}`);
    expect(status).toBe(404);
    expect(body.detail).toBe(`${"0".repeat(40)} is not a commit in alpha`);
  });

  test("a workspace with no repository mapped serves no history, and says so", async () => {
    const { status, body } = await get("/workspace/beta/commit");
    expect(status).toBe(404);
    expect(body.detail).toBe("beta has no git repository mapped to it");
  });

  test("a workspace that does not exist is not found, repository or not", async () => {
    const { status } = await get("/workspace/nowhere/commit");
    expect(status).toBe(404);
  });
});
