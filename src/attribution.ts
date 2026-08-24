/**
 * Where a command's attribution comes from.
 *
 * Deliberately outside all three layers — a peer of `src/cli.ts`, not a member
 * of `src/db/`, `src/domain/` or `src/mcp/`. Attribution is an *environment*
 * fact: which agent is at the keyboard, which commit the working tree is on.
 * The domain should be able to record it without knowing how it was obtained,
 * and the persistence layer should never learn that a subprocess exists.
 *
 * That last part is not hypothetical. **Nothing under `src/` spawns a
 * subprocess today**, and a real `GitContextProvider` — one that actually runs
 * `git rev-parse HEAD` — would be the first. Keeping it here means that when it
 * arrives it arrives in one file that the graph and the verbs do not import.
 *
 * The providers are interfaces with stubs behind them, which is exactly the
 * shape `Clock` arrived in and for the same reason: the part that is hard to
 * retrofit is the seam, not the implementation. `systemClock` was a one-liner
 * and the discipline it enforced was the point. Same here — {@link
 * mockGitContext} and {@link mockSessionContext} answer with constants, and the
 * MCP server is already wired through them, so replacing either is a change to
 * this file alone.
 *
 * See PJ-031 for why attribution is recorded at all, and for the honest note
 * that nothing reads it yet.
 */

import {
  type AttributionContext,
  type Clock,
  type CommandContext,
  systemClock,
} from "./domain";

/** The commit a command ran against. */
export interface GitContextProvider {
  /**
   * The current HEAD, or `""` outside a repository.
   *
   * Empty rather than throwing or returning `undefined`: running LabKit outside
   * a checkout is legitimate, and it should produce a recorded fact ("no commit
   * to name") rather than a failed command or an absent field.
   */
  head(): string;
}

/** Who is running commands. */
export interface SessionContextProvider {
  /** Human-readable, for a person scanning a report. Collides and gets renamed. */
  label(): string;
  /** Stable, for comparing two events. Never shown in place of the label. */
  id(): string;
}

/**
 * A stand-in HEAD, and visibly one.
 *
 * All zeros rather than a plausible-looking hash. A fake that reads as real is
 * the failure mode worth designing against here: the first person to see a
 * `git_hash` in a record will try to check out that commit, and forty zeros
 * answers them immediately where `a3f91c2` would send them looking.
 */
export const mockGitContext: GitContextProvider = {
  head: () => "0".repeat(40),
};

/** A stand-in session, named so it cannot be mistaken for a real agent. */
export const mockSessionContext: SessionContextProvider = {
  label: () => "mock-session",
  id: () => "mock-session-0",
};

/**
 * Assembles the context a command executes in.
 *
 * Providers are called **on every invocation**, not once and cached, which is
 * the whole reason `src/mcp/server.ts` builds a surface per tool call: a git
 * hash sampled at process start would name the commit the server booted on
 * rather than the commit the work was done against, and those differ in exactly
 * the session where the record matters most.
 */
export function commandContext(
  git: GitContextProvider,
  session: SessionContextProvider,
  clock: Clock = systemClock,
): CommandContext {
  const attribution: AttributionContext = {
    attribution_label: session.label(),
    attribution_id: session.id(),
    git_hash: git.head(),
  };
  return { clock, attribution };
}
