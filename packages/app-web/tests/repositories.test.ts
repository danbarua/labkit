import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepository } from "es-git";
import { openRepositories } from "../src/server/repositories";

// Resolved, so the folders compare equal to the ones git reports (macOS links /var to /private/var).
const scratch = await realpath(await mkdtemp(join(tmpdir(), "labkit-repositories-")));
afterAll(() => rm(scratch, { recursive: true, force: true }));

describe("the workspaces' repositories", () => {
  test("opens the repository each workspace's folder holds", async () => {
    const folder = join(scratch, "repo");
    await initRepository(folder);
    const repositories = await openRepositories(new Map([["alpha", folder]]));
    expect([...repositories.keys()]).toEqual(["alpha"]);
    expect(repositories.get("alpha")?.workdir()).toBe(`${folder}/`);
  });

  test("skips, with a warning naming the workspace and folder, a folder that is not a repository", async () => {
    const plain = join(scratch, "plain");
    await mkdir(plain);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const repositories = await openRepositories(new Map([["plain", plain]]));
    expect(repositories.size).toBe(0);
    expect(warn.mock.calls[0]?.[0]).toBe("workspace repositories: skipped, not a git repository");
    expect(warn.mock.calls[0]?.[1]).toMatchObject({ slug: "plain", folder: plain });
    warn.mockRestore();
  });
});
