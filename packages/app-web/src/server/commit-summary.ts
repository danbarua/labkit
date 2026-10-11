import type { Commit } from "es-git";
import { COMMIT_SLUG, COMMIT_TYPE } from "./collection-paths";

/**
 * A commit as an item of a list, or as a neighbour embedded in another resource: its id, first
 * line, author and time. `base` is the workspace's address, `{origin}/workspace/{slug}`.
 */
export function summaryOf(base: string, commit: Commit) {
  return {
    id: commit.id(),
    type: COMMIT_TYPE,
    name: commit.summary() ?? "",
    author: commit.author().name,
    committed_at: commit.time().toISOString(),
    _links: { self: { href: `${base}/${COMMIT_SLUG}/${commit.id()}`, type: COMMIT_TYPE } },
  };
}
