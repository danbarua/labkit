import { spawnSync } from "node:child_process";
import { basename } from "node:path";

/**
 * Which checkout this process is running from, for diagnostics only.
 *
 * **Nothing branches on this.** It is printed by `labkit --version` and returned
 * by the spike server's `/healthz`, so an answer can be attributed to the stack
 * that produced it. No verb, no report and no connection decision reads it.
 *
 * ## What it is for
 *
 * Observed 2026-08-28: `bun run spike:web` in one checkout while another
 * worktree's stack was up. The database could not bind its port, and
 * `localhost:8899/healthz` answered `{"ok":true,…}` — **from the other
 * worktree's server**. Nothing errored, and a green health check described a
 * process the reader had not started.
 *
 * `scripts/worktree-ports.sh` stops the two stacks competing for one port,
 * which prevents the accident. This is the other half: a response that says
 * which checkout answered cannot be mistaken for one from somewhere else, even
 * when a stray `curl` reaches a port the reader did not expect. Isolation
 * prevents the collision; identity makes a collision that gets through
 * self-diagnosing.
 *
 * ## Why it returns `undefined` rather than a fallback
 *
 * A compiled binary on a host with no git has no worktree to name, and neither
 * does a container. Inventing one — the working directory, the hostname —
 * would be a value a reader could act on that means nothing, which is the shape
 * this exists to remove rather than add. Absent is honest; callers omit the
 * field.
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
