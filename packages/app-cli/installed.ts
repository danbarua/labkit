/**
 * Whether `node_modules` was installed from the lockfile now in the tree.
 *
 * `bun install` runs `scripts/dev/stamp-install.ts`, which writes the lockfile's hash to
 * {@link STAMP}. A pull, a branch switch or a new worktree can change the lockfile without an
 * install, and code then runs against modules the lockfile no longer describes, failing with
 * errors that name a symptom rather than the cause.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The repository root: `packages/app-cli/` is two levels down. */
const ROOT = join(import.meta.dir, "..", "..");
export const STAMP = join(ROOT, "node_modules", ".labkit-installed-lock");

export function lockfileHash(root = ROOT): string | undefined {
  const lock = join(root, "bun.lock");
  if (!existsSync(lock)) return undefined;
  return Bun.hash(readFileSync(lock)).toString(16);
}

/**
 * A sentence saying what is stale, or undefined when the install matches. A compiled binary
 * carries its modules inside it, so it has nothing to compare.
 */
export function staleInstall(root = ROOT): string | undefined {
  if (import.meta.dir.startsWith("/$bunfs")) return undefined;
  const now = lockfileHash(root);
  if (now === undefined) return undefined;
  const stamp = join(root, "node_modules", ".labkit-installed-lock");
  if (!existsSync(join(root, "node_modules")))
    return "there is no node_modules here; run: bun install";
  const installed = existsSync(stamp) ? readFileSync(stamp, "utf8").trim() : undefined;
  if (installed === now) return undefined;
  return "dependencies changed since the last `bun install`; run: bun install";
}
