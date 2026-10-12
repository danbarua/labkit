import { openRepository, type Repository } from "es-git";
import type { WorkspaceDirectories } from "./workspace-directories";

/** The git repository each workspace serves its files and history from, by workspace slug. */
export type Repositories = ReadonlyMap<string, Repository>;

/**
 * The repository each workspace's folder holds, by workspace slug. A folder that is not a git
 * repository is left out with a warning, and its workspace serves no files or history.
 */
export async function openRepositories(
  directories: WorkspaceDirectories,
): Promise<Map<string, Repository>> {
  const repositories = new Map<string, Repository>();
  for (const [slug, folder] of directories) {
    try {
      repositories.set(slug, await openRepository(folder, { noSearch: true }));
      console.info("workspace repositories: mapped", { slug, folder });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn("workspace repositories: skipped, not a git repository", {
        slug,
        folder,
        reason,
      });
    }
  }
  return repositories;
}

/** Whether `err` is libgit2 reporting that what was asked for does not exist. */
export function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.includes("code=NotFound");
}

/** Whether `repo` holds the commit `hash`. Any error other than its absence is thrown. */
export function holdsCommit(repo: Repository, hash: string): boolean {
  try {
    repo.getCommit(hash);
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}
