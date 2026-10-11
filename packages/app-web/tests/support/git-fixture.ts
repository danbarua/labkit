/**
 * A small git repository in a temporary folder, built with es-git, for the API's file and history
 * routes. Its commits, oldest first:
 *
 * 1. `README.md`, `src/a.ts` and `data/blob.bin`, a binary file.
 * 2. `src/a.ts` changed and `notes/plan.md` added.
 * 3. `data/blob.bin` deleted and `big.txt` added, longer than the API serves a diff or a file.
 */

import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { initRepository, type Repository } from "es-git";

export interface GitFixture {
  folder: string;
  repo: Repository;
  /** The commits' ids, oldest first. */
  commits: string[];
  close(): Promise<void>;
}

const AUTHOR = { name: "Ada Tester", email: "ada@example.invalid" };

/** A text longer than the API's diff and file limits: 2,000 lines of 80 characters. */
export const BIG_TEXT = `${"x".repeat(79)}\n`.repeat(2_000);

export async function createGitFixture(): Promise<GitFixture> {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "labkit-git-")));
  const repo = await initRepository(folder);
  const commits: string[] = [];

  async function commit(
    message: string,
    second: number,
    files: Record<string, string | Uint8Array | null>,
  ): Promise<void> {
    const index = repo.index();
    for (const [path, content] of Object.entries(files)) {
      if (content === null) {
        await rm(join(folder, path));
        index.removePath(path);
        continue;
      }
      await mkdir(dirname(join(folder, path)), { recursive: true });
      await writeFile(join(folder, path), content);
      index.addPath(path);
    }
    index.write();
    const tree = repo.getTree(index.writeTree());
    const time = { timestamp: 1_790_000_000 + second, offset: 0 };
    const id = repo.commit(tree, message, {
      updateRef: "HEAD",
      parents: commits.slice(-1),
      author: { ...AUTHOR, timeOptions: time },
      committer: { ...AUTHOR, timeOptions: time },
    });
    commits.push(id);
  }

  await commit("Start the project\n\nThe first files.", 0, {
    "README.md": "# Fixture\n",
    "src/a.ts": "export const a = 1;\n",
    "data/blob.bin": new Uint8Array([0, 1, 2, 3, 0, 255]),
  });
  await commit("Change a, plan the work", 60, {
    "src/a.ts": "export const a = 2;\n",
    "notes/plan.md": "- one\n- two\n",
  });
  await commit("Drop the blob, add a big file", 120, {
    "data/blob.bin": null,
    "big.txt": BIG_TEXT,
  });

  return { folder, repo, commits, close: () => rm(folder, { recursive: true, force: true }) };
}
