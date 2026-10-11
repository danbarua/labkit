/**
 * The API's routes for a workspace's git history, through `handle()`, against the fixture's
 * workspaces with a temporary repository mapped to `alpha` and none to `beta`.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: response bodies are read loosely; each test asserts only the part of the shape it is about

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { FILE_LIMIT, PATCH_LIMIT, RAW_LIMIT } from "../src/server/git-handler";
import { handle } from "../src/server/handler";
import { createRuntime, type Runtime } from "../src/server/runtime";
import { createFixture, type Fixture } from "./support/fixture";
import { BIG_TEXT, createGitFixture, type GitFixture, PIXEL_PNG } from "./support/git-fixture";

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

  test("a listed file names its media type only when its extension does", async () => {
    const { body } = await get("/workspace/alpha/file");
    expect(body._embedded.file.map((e: any) => [e.name, e.media_type])).toEqual([
      ["notes", undefined],
      ["src", undefined],
      ["big.txt", "text/plain"],
      ["readme-link", undefined],
      ["README.md", "text/markdown"],
    ]);
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
    // The diff is not on the commit: it is a child resource per file.
    expect(body.diff).toBeUndefined();
    expect(body._links.diff.href).toBe(`${commitHref(second!)}/diff`);
  });

  test("a commit's diff is one resource per changed file, listed by its diff collection", async () => {
    const second = git.commits[1]!;
    const { body } = await get(`/workspace/alpha/commit/${second}/diff`);
    expect(body._embedded.diff.map((d: any) => [d.type, d.path, d.status])).toEqual([
      ["Diff", "notes/latin1.txt", "Added"],
      ["Diff", "notes/plan.md", "Added"],
      ["Diff", "readme-link", "Added"],
      ["Diff", "src/a.ts", "Modified"],
    ]);
    const one = await get(`/workspace/alpha/commit/${second}/diff/src/a.ts`);
    expect(one.body).toMatchObject({
      id: "src/a.ts",
      type: "Diff",
      status: "Modified",
      patch_truncated: false,
      _links: {
        self: { href: `${commitHref(second)}/diff/src/a.ts`, type: "Diff" },
        file: { href: `${commitHref(second)}/file/src/a.ts`, type: "File" },
      },
    });
    expect(one.body.patch).toContain("-export const a = 1;\n+export const a = 2;");
    const none = await get(`/workspace/alpha/commit/${second}/diff/README.md`);
    expect(none.status).toBe(404);
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
    const diff = await get(`/workspace/alpha/commit/${git.commits[0]}/diff`);
    const patch = (path: string) =>
      diff.body._embedded.diff.find((d: any) => d.path === path).patch;
    expect(patch("data/blob.bin")).toBe(
      "diff --git a/data/blob.bin b/data/blob.bin\nBinary files differ\n",
    );
    expect(patch("src/a.ts")).toContain(
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

  test("a file's diff longer than the limit is cut there and flagged", async () => {
    const { body } = await get(`/workspace/alpha/commit/${git.commits[2]}/diff/big.txt`);
    expect(body.patch_truncated).toBe(true);
    expect(body.patch).toHaveLength(PATCH_LIMIT);
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
  test("a file relates the commits that changed it, newest first, and links its directory", async () => {
    const [first, second] = git.commits;
    const { body } = await get("/workspace/alpha/file/src/a.ts");
    // The directory is where the file is listed, not a relation: its path names it.
    expect(body._links.index).toEqual({ href: fileHref("src") });
    expect(body._links["contained_in:directory"]).toBeUndefined();
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

  test("a file read at a commit relates the commits up to that one", async () => {
    const [first, second] = git.commits;
    const { body } = await get(`/workspace/alpha/commit/${second}/file/data/blob.bin`);
    expect(body._links["commit:changes"].map((l: any) => l.href)).toEqual([commitHref(first!)]);
    expect(body._links.history.href).toBe(`${commitHref(second!)}/history/data/blob.bin`);
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
    // The commit's summary is embedded, so a page shows it without asking for the commit.
    expect(one.body._embedded["ran_against:commit"]).toMatchObject({
      id: git.commits[0],
      type: "Commit",
      name: "Start the project",
      dir: "out",
    });
    expect(one.body._embedded["ran_against:commit"].diff).toBeUndefined();
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

  test("a commit an act ran against links its events: every change those acts made", async () => {
    const [first, , third] = git.commits;
    const { body } = await get(`/workspace/alpha/commit/${first}`);
    expect(body._links.events.href).toBe(`${commitHref(first!)}/events`);
    const events = await get(`/workspace/alpha/commit/${first}/events`);
    expect(events.status).toBe(200);
    expect(events.body._links.about.href).toBe(commitHref(first!));
    const all = events.body._embedded.events;
    expect(all.length).toBeGreaterThan(0);
    expect(all.map((e: any) => [e.seq, e.index])).toEqual(
      all.map((_: any, i: number) => [1, i + 1]),
    );
    expect(all[0]).toMatchObject({
      seq: 1,
      operation: "pose",
      subject: "Q_1",
      _links: { parent: { href: `${ORIGIN}/workspace/alpha/act/1`, type: "Act" } },
    });
    expect(all[0]._links.id).toEqual({ href: `${ORIGIN}/workspace/alpha/Q_1`, type: "Question" });
    // No change names the commit, so none is in, out of, or about it.
    expect(all.some((e: any) => "dir" in e)).toBe(false);
    // No act ran against the third commit, so it has no events to link.
    const none = await get(`/workspace/alpha/commit/${third}`);
    expect(none.body._links.events).toBeUndefined();
  });
});

describe("a workspace's branches and timeline", () => {
  let forked: GitFixture;
  let head: string;
  const getForked = async (path: string) => {
    const res = await handle(
      new Request(ORIGIN + path),
      createRuntime(fixture.connections, new Map([["alpha", forked.repo]])),
    );
    return { status: res.status, body: (await res.json()) as any };
  };
  beforeAll(async () => {
    forked = await createGitFixture({ branches: true });
    head = forked.repo.head().shorthand();
  });
  afterAll(() => forked?.close());

  test("lists the local branches, then the remote-tracking ones, HEAD's marked current", async () => {
    const [, , third, side, merge] = forked.commits;
    const { body } = await getForked("/workspace/alpha/branch");
    expect(body._embedded.branch.map((b: any) => [b.name, b.remote, b.current, b.tip])).toEqual([
      [head, false, true, merge],
      ["side", false, false, side],
      ["origin/main", true, false, third],
    ]);
    expect(body._embedded.branch[2]._links["points_to:commit"]).toEqual({
      href: commitHref(third!),
      type: "Commit",
      dir: "out",
    });
    expect(body._embedded.branch[2]._embedded["points_to:commit"].name).toBe(
      "Drop the blob, add a big file",
    );
  });

  test("serves one branch by its name, a slash in it encoded", async () => {
    const one = await getForked("/workspace/alpha/branch/origin%2Fmain");
    expect(one.status).toBe(200);
    expect(one.body._links.self.href).toBe(`${ORIGIN}/workspace/alpha/branch/origin%2Fmain`);
    const none = await getForked("/workspace/alpha/branch/nope");
    expect(none.status).toBe(404);
  });

  test("the timeline lists every branch's commits, children first, with parents and branch names", async () => {
    const [first, second, third, side, merge] = forked.commits;
    const { body } = await getForked("/workspace/alpha/timeline");
    expect(body._embedded.timeline.map((c: any) => [c.id, c.parents, c.branches, c.head])).toEqual([
      [merge, [third, side], [head], true],
      [third, [second], ["origin/main"], false],
      [side, [second], ["side"], false],
      [second, [first], [], false],
      [first, [], [], false],
    ]);
  });

  test("the history at /commit links the timeline and the branches", async () => {
    const { body } = await getForked("/workspace/alpha/commit?limit=1");
    expect(body._links.timeline.href).toBe(`${ORIGIN}/workspace/alpha/timeline`);
    expect(body._links.branches.href).toBe(`${ORIGIN}/workspace/alpha/branch`);
  });
});

describe("a file's media type and raw bytes", () => {
  let media: GitFixture;
  const raw = (repo: GitFixture, path: string) =>
    handle(
      new Request(ORIGIN + path),
      createRuntime(fixture.connections, new Map([["alpha", repo.repo]])),
    );
  const json = async (repo: GitFixture, path: string) =>
    (await (await raw(repo, path)).json()) as any;
  beforeAll(async () => {
    media = await createGitFixture({ media: true });
  });
  afterAll(() => media?.close());

  test("each file names its media type, by extension, or text or bytes by its content", async () => {
    const types: [string, string][] = [];
    for (const path of ["pixel.png", "docs/guide.md", "src/a.ts", "big.txt", "readme-link"])
      types.push([path, (await json(media, `/workspace/alpha/file/${path}`)).media_type]);
    expect(types).toEqual([
      ["pixel.png", "image/png"],
      ["docs/guide.md", "text/markdown"],
      ["src/a.ts", "text/x-typescript"],
      ["big.txt", "text/plain"],
      ["readme-link", "text/plain"],
    ]);
    const blob = await json(
      media,
      `/workspace/alpha/commit/${media.commits[0]}/file/data/blob.bin`,
    );
    expect(blob.media_type).toBe("application/octet-stream");
    expect(blob._links.raw).toEqual({
      href: `${commitHref(media.commits[0]!)}/raw/data/blob.bin`,
      type: "application/octet-stream",
    });
  });

  test("raw serves the committed bytes as the media type, unsniffed and sandboxed", async () => {
    const res = await raw(media, "/workspace/alpha/raw/pixel.png");
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PIXEL_PNG);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toStartWith("sandbox;");
    expect(res.headers.get("content-disposition")).toBe(
      `inline; filename="pixel.png"; filename*=UTF-8''pixel.png`,
    );
  });

  test("raw text carries a charset only when it is UTF-8", async () => {
    const guide = await raw(media, "/workspace/alpha/raw/docs/guide.md");
    expect(guide.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const latin1 = await raw(media, "/workspace/alpha/raw/notes/latin1.txt");
    expect(latin1.headers.get("content-type")).toBe("text/plain");
  });

  test("raw at a commit serves the file as it was then", async () => {
    const res = await raw(media, `/workspace/alpha/commit/${media.commits[0]}/raw/data/blob.bin`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0, 1, 2, 3, 0, 255]));
  });

  test("raw serves nothing that is not a committed file", async () => {
    for (const path of ["missing.png", "src", "..%2F..%2Fetc%2Fpasswd"]) {
      const res = await raw(media, `/workspace/alpha/raw/${path}`);
      expect([path, res.status]).toEqual([path, 404]);
    }
  });

  test("raw refuses a file larger than its limit, and says how large", async () => {
    const huge = await createGitFixture({ huge: RAW_LIMIT + 1 });
    try {
      const res = await raw(huge, "/workspace/alpha/raw/huge.bin");
      expect(res.status).toBe(413);
      expect(((await res.json()) as any).detail).toBe(
        `huge.bin is ${RAW_LIMIT + 1} bytes; files over ${RAW_LIMIT} bytes are not served raw`,
      );
    } finally {
      await huge.close();
    }
  }, 30_000);
});
