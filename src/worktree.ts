import { spawnSync } from "node:child_process";
import { basename } from "node:path";

/**
 * Which checkout this process is running from, for diagnostics only.
 */
export function worktreeName(): string | undefined {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    // git's "not a git repository" is an ordinary outcome here, not something
    // to print at whoever is reading the CLI's output.
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (r.status !== 0 || typeof r.stdout !== "string") return undefined;
  const top = r.stdout.trim();
  return top === "" ? undefined : basename(top);
}
