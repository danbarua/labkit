import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorkspaceDirectories } from "../src/server/workspace-directories";

const scratch = await realpath(await mkdtemp(join(tmpdir(), "labkit-workspace-directories-")));
afterAll(() => rm(scratch, { recursive: true, force: true }));

async function mapping(name: string, content: string): Promise<string> {
  const file = join(scratch, name);
  await writeFile(file, content);
  return file;
}

describe("the workspaces mapping file", () => {
  test("maps each workspace to its absolute folder, and a ~/ folder to one under the home folder", async () => {
    const directories = await readWorkspaceDirectories(
      await mapping("ok.json", JSON.stringify({ alpha: "/srv/alpha", beta: "~/code/beta" })),
      "/home/someone",
    );
    expect([...directories]).toEqual([
      ["alpha", "/srv/alpha"],
      ["beta", "/home/someone/code/beta"],
    ]);
  });

  test("maps no workspace when there is no file", async () => {
    const info = spyOn(console, "info").mockImplementation(() => {});
    const directories = await readWorkspaceDirectories(join(scratch, "missing.json"));
    expect(directories.size).toBe(0);
    expect(info).toHaveBeenCalledWith(
      "workspace directories: no mapping file; no workspace has a folder",
      { file: join(scratch, "missing.json") },
    );
    info.mockRestore();
  });

  test("maps no workspace, with a warning, when the file is not a JSON object", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    expect((await readWorkspaceDirectories(await mapping("bad.json", "{ nope"))).size).toBe(0);
    expect((await readWorkspaceDirectories(await mapping("list.json", "[]"))).size).toBe(0);
    expect(warn.mock.calls.map((call) => call[0])).toEqual([
      "workspace directories: the mapping file is not JSON",
      "workspace directories: the mapping file is not a JSON object",
    ]);
    warn.mockRestore();
  });

  test("skips, with a warning naming the workspace, an entry that is not a string or not absolute", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const directories = await readWorkspaceDirectories(
      await mapping("skips.json", JSON.stringify({ number: 7, relative: "some/folder" })),
    );
    expect(directories.size).toBe(0);
    expect(warn.mock.calls.map((call) => [call[0], (call[1] as { slug: string }).slug])).toEqual([
      ["workspace directories: skipped, the folder is not a string", "number"],
      ["workspace directories: skipped, the folder is not absolute", "relative"],
    ]);
    warn.mockRestore();
  });
});
