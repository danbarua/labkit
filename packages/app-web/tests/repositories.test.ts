import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepository } from "es-git";
import { openRepositories } from "../src/server/repositories";

// Resolved, so the folders compare equal to the ones git reports (macOS links /var to /private/var).
const scratch = await realpath(await mkdtemp(join(tmpdir(), "labkit-repositories-")));
afterAll(() => rm(scratch, { recursive: true, force: true }));

async function mapping(name: string, content: string): Promise<string> {
  const file = join(scratch, name);
  await writeFile(file, content);
  return file;
}

describe("the workspaces mapping file", () => {
  test("maps each workspace to the repository its folder holds", async () => {
    const folder = join(scratch, "repo");
    await initRepository(folder);
    const repositories = await openRepositories(
      await mapping("ok.json", JSON.stringify({ alpha: folder })),
    );
    expect([...repositories.keys()]).toEqual(["alpha"]);
    expect(repositories.get("alpha")?.workdir()).toBe(`${folder}/`);
  });

  test("reads a folder that starts with ~/ as one under the home folder", async () => {
    const folder = join(scratch, "home-repo");
    await initRepository(folder);
    const repositories = await openRepositories(
      await mapping("home.json", JSON.stringify({ alpha: "~/home-repo" })),
      scratch,
    );
    expect(repositories.get("alpha")?.workdir()).toBe(`${folder}/`);
  });

  test("maps no workspace when there is no file", async () => {
    const info = spyOn(console, "info").mockImplementation(() => {});
    const repositories = await openRepositories(join(scratch, "missing.json"));
    expect(repositories.size).toBe(0);
    expect(info).toHaveBeenCalledWith(
      "workspace repositories: no mapping file; no workspace serves files",
      { file: join(scratch, "missing.json") },
    );
    info.mockRestore();
  });

  test("maps no workspace, with a warning, when the file is not a JSON object", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    expect((await openRepositories(await mapping("bad.json", "{ nope"))).size).toBe(0);
    expect((await openRepositories(await mapping("list.json", "[]"))).size).toBe(0);
    expect(warn.mock.calls.map((call) => call[0])).toEqual([
      "workspace repositories: the mapping file is not JSON",
      "workspace repositories: the mapping file is not a JSON object",
    ]);
    warn.mockRestore();
  });

  test("skips, with a warning naming the workspace and folder, an entry that names no repository", async () => {
    const plain = join(scratch, "plain");
    await mkdir(plain);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const repositories = await openRepositories(
      await mapping("skips.json", JSON.stringify({ number: 7, relative: "some/folder", plain })),
    );
    expect(repositories.size).toBe(0);
    expect(warn.mock.calls.map((call) => [call[0], (call[1] as { slug: string }).slug])).toEqual([
      ["workspace repositories: skipped, the folder is not a string", "number"],
      ["workspace repositories: skipped, the folder is not absolute", "relative"],
      ["workspace repositories: skipped, not a git repository", "plain"],
    ]);
    expect(warn.mock.calls[2]?.[1]).toMatchObject({ folder: plain });
    warn.mockRestore();
  });
});
