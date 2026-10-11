/**
 * A small git repository in a temporary folder, built with es-git, for the API's file and history
 * routes. Its commits, oldest first:
 * 1. `README.md`, `src/a.ts` and `data/blob.bin`, a binary file.
 * 2. `src/a.ts` changed; `notes/plan.md`, `notes/latin1.txt` (text that is not UTF-8) and
 *    `readme-link`, a symbolic link to `README.md`, added.
 * 3. `data/blob.bin` deleted and `big.txt` added, longer than the API serves a diff or a file.
 */

import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
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

/** With `wide`, a fourth commit adds that many files under `wide/`, to pass the API's page size. */
export async function createGitFixture({ wide }: { wide?: number } = {}): Promise<GitFixture> {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "labkit-git-")));
  const repo = await initRepository(folder);
  const commits: string[] = [];

  async function commit(
    message: string,
    second: number,
    files: Record<string, string | Uint8Array | { link: string } | null>,
  ): Promise<void> {
    const index = repo.index();
    for (const [path, content] of Object.entries(files)) {
      if (content === null) {
        await rm(join(folder, path));
        index.removePath(path);
        continue;
      }
      if (typeof content === "object" && "link" in content) {
        await symlink(content.link, join(folder, path));
        index.addPath(path);
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
    // "café" in Latin-1: no NUL byte, so not binary to git, but not UTF-8.
    "notes/latin1.txt": new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0a]),
    "readme-link": { link: "README.md" },
  });
  await commit("Drop the blob, add a big file", 120, {
    "data/blob.bin": null,
    "big.txt": BIG_TEXT,
  });
  if (wide !== undefined)
    await commit(
      `Add ${wide} files`,
      180,
      Object.fromEntries(
        Array.from({ length: wide }, (_, i) => [
          `wide/f${String(i).padStart(2, "0")}.txt`,
          `${i}\n`,
        ]),
      ),
    );

  return { folder, repo, commits, close: () => rm(folder, { recursive: true, force: true }) };
}
