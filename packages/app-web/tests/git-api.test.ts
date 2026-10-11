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

let wide: GitFixture;

beforeAll(async () => {
  fixture = await createFixture("pglite");
  git = await createGitFixture();
  wide = await createGitFixture({ wide: 30 });
  runtime = createRuntime(fixture.connections, new Map([["alpha", git.repo]]));
  // Acts 1 and 3 ran against the fixture's first and second commits; act 2 against a commit the
  // repository does not hold.
  const session = await fixture.connections.connect();
  try {
    const { rows } = await session.query<{ graph_name: string }>(
      "SELECT graph_name FROM public.tenants WHERE slug = 'alpha'",
    );
    const events = `"${rows[0]?.graph_name}".domain_event`;
    const hash = (seq: number, value: string) =>
      session.query(`UPDATE ${events} SET git_hash = $1 WHERE seq = $2`, [value, seq]);
    await hash(1, git.commits[0]!);
    await hash(2, "f".repeat(40));
    await hash(3, git.commits[1]!);
  } finally {
    session.release();
  }
}, 60_000);

afterAll(async () => {
  await fixture?.close();
  await git?.close();
  await wide?.close();
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
      committed_at: "2026-09-21T14:15:20.000Z",
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
      _links: {
        index: { href: `${ORIGIN}/workspace/alpha/commit` },
        changes: { href: `${commitHref(second!)}/changes` },
        "parent:commit": [{ href: commitHref(first!), type: "Commit", dir: "out" }],
      },
    });
    expect(body._links["changes:file"].map((l: any) => [l.href, l.dir, l.props.status])).toEqual([
      [`${commitHref(second!)}/file/notes/latin1.txt`, "out", "Added"],
      [`${commitHref(second!)}/file/notes/plan.md`, "out", "Added"],
      [`${commitHref(second!)}/file/readme-link`, "out", "Added"],
      [`${commitHref(second!)}/file/src/a.ts`, "out", "Modified"],
    ]);
    // A file's status is the relation's, not the file's: it is not on the embedded file.
    expect(body._embedded["changes:file"][3]).toMatchObject({ path: "src/a.ts", dir: "out" });
    expect(body._embedded["changes:file"][3].status).toBeUndefined();
    expect(body._embedded["parent:commit"][0]).toMatchObject({ id: first, dir: "out" });
    expect(body.diff).toContain("-export const a = 1;\n+export const a = 2;");
  });

  test("a root commit has no parents, and its diff adds every file", async () => {
    const { body } = await get(`/workspace/alpha/commit/${git.commits[0]}`);
    expect(body.message).toBe("Start the project\n\nThe first files.");
    expect(body._links["parent:commit"]).toEqual([]);
    expect(body._links["changes:file"].map((l: any) => l.props.status)).toEqual([
      "Added",
      "Added",
      "Added",
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
    expect(body._links["changes:file"]).toEqual([
      {
        href: `${commitHref(third!)}/file/big.txt`,
        type: "File",
        dir: "out",
        props: { status: "Added" },
      },
      {
        href: `${commitHref(second!)}/file/data/blob.bin`,
        type: "File",
        dir: "out",
        props: { status: "Deleted" },
      },
    ]);
  });

  test("a diff longer than the limit is cut there and flagged", async () => {
    const { body } = await get(`/workspace/alpha/commit/${git.commits[2]}`);
    expect(body.diff_truncated).toBe(true);
    expect(body.diff).toHaveLength(DIFF_LIMIT);
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

describe("a commit's changed files, past the page size", () => {
  // The same database, with the wide repository mapped to alpha.
  const getWide = async (path: string) => {
    const res = await handle(
      new Request(ORIGIN + path),
      createRuntime(fixture.connections, new Map([["alpha", wide.repo]])),
    );
    return (await res.json()) as any;
  };

  test("a commit relates at most 25 changed files, and its changes collection pages all of them", async () => {
    const id = wide.commits.at(-1)!;
    const body = await getWide(`/workspace/alpha/commit/${id}`);
    expect(body.files_changed).toBe(30);
    expect(body._links["changes:file"]).toHaveLength(25);
    expect(body._embedded["changes:file"]).toHaveLength(25);
    const first = await getWide(`/workspace/alpha/commit/${id}/changes`);
    expect(first.count).toBe(25);
    expect(first._embedded.changes[0]).toMatchObject({ path: "wide/f00.txt", status: "Added" });
    expect(first._links.next.href).toBe(`${commitHref(id)}/changes?limit=25&offset=25`);
    const rest = await getWide(`/workspace/alpha/commit/${id}/changes?limit=25&offset=25`);
    expect(rest._embedded.changes.map((f: any) => f.path)).toEqual([
      "wide/f25.txt",
      "wide/f26.txt",
      "wide/f27.txt",
      "wide/f28.txt",
      "wide/f29.txt",
    ]);
    expect(rest._links.next).toBeUndefined();
  });
});

describe("a file's relations", () => {
  test("a file relates its directory and the commits that changed it, newest first", async () => {
    const [first, second] = git.commits;
    const { body } = await get("/workspace/alpha/file/src/a.ts");
    expect(body._links["contained_in:directory"]).toEqual({
      href: fileHref("src"),
      type: "Directory",
      dir: "out",
    });
    expect(body._links["commit:changes"]).toEqual([
      { href: commitHref(second!), type: "Commit", dir: "in" },
      { href: commitHref(first!), type: "Commit", dir: "in" },
    ]);
    expect(body._embedded["commit:changes"].map((c: any) => [c.id, c.name, c.dir])).toEqual([
      [second, "Change a, plan the work", "in"],
      [first, "Start the project", "in"],
    ]);
    expect(body._links.history.href).toBe(`${ORIGIN}/workspace/alpha/history/src/a.ts`);
  });

  test("a file's history collection lists the commits that changed it, by page", async () => {
    const [first, second] = git.commits;
    const page = await get("/workspace/alpha/history/src/a.ts?limit=1");
    expect(page.body._embedded.commit.map((c: any) => c.id)).toEqual([second]);
    expect(page.body._links.next.href).toBe(
      `${ORIGIN}/workspace/alpha/history/src/a.ts?limit=1&offset=1`,
    );
    const rest = await get("/workspace/alpha/history/src/a.ts?limit=1&offset=1");
    expect(rest.body._embedded.commit.map((c: any) => c.id)).toEqual([first]);
    expect(rest.body._links.next).toBeUndefined();
  });

  test("a file read at a commit relates the commits up to that one, and a top-level file the top directory", async () => {
    const [first, second] = git.commits;
    const { body } = await get(`/workspace/alpha/commit/${second}/file/data/blob.bin`);
    expect(body._links["commit:changes"].map((l: any) => l.href)).toEqual([commitHref(first!)]);
    expect(body._links.history.href).toBe(`${commitHref(second!)}/history/data/blob.bin`);
    const top = await get("/workspace/alpha/file/README.md");
    expect(top.body._links["contained_in:directory"].href).toBe(fileHref("").slice(0, -1));
  });
});

describe("acts and the commits they ran against", () => {
  test("an act relates the commit it ran against when the repository holds it", async () => {
    const one = await get("/workspace/alpha/act/1");
    expect(one.body._links["ran_against:commit"]).toEqual({
      href: commitHref(git.commits[0]!),
      type: "Commit",
      dir: "out",
    });
    const two = await get("/workspace/alpha/act/2");
    expect(two.body.git_hash).toBe("f".repeat(40));
    expect(two.body._links["ran_against:commit"]).toBeUndefined();
  });

  test("a commit relates the acts that ran against it, and its acts collection lists them", async () => {
    const { body } = await get(`/workspace/alpha/commit/${git.commits[0]}`);
    expect(body._links["act:ran_against"]).toEqual([
      { href: `${ORIGIN}/workspace/alpha/act/1`, type: "Act", dir: "in" },
    ]);
    expect(body._embedded["act:ran_against"][0]).toMatchObject({
      id: "1",
      type: "Act",
      name: "pose Q_1",
      dir: "in",
      _links: { subject: { href: `${ORIGIN}/workspace/alpha/Q_1` } },
    });
    const acts = await get(`/workspace/alpha/commit/${git.commits[1]}/acts`);
    expect(acts.body._embedded.acts.map((a: any) => a.id)).toEqual(["3"]);
  });
});
