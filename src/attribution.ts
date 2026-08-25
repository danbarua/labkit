/**
 * Where a command's attribution comes from.
 *
 * Deliberately outside all three layers — a peer of `src/cli.ts`, not a member
 * of `src/db/`, `src/domain/` or `src/mcp/`. Attribution is an *environment*
 * fact: which agent is at the keyboard, which commit the working tree is on.
 * The domain should be able to record it without knowing how it was obtained,
 * and the persistence layer should never learn that a subprocess exists.
 *
 * That last part is not hypothetical, and it has now happened. This file said
 * **nothing under `src/` spawns a subprocess** and that a real
 * `GitContextProvider` would be the first; {@link gitContext} below is it, and
 * it is the only subprocess under `src/`. The prediction held in both halves —
 * it arrived here, and the graph and the verbs did not learn about it.
 *
 * The providers are interfaces with stubs behind them, which is exactly the
 * shape `Clock` arrived in and for the same reason: the part that is hard to
 * retrofit is the seam, not the implementation. `systemClock` was a one-liner
 * and the discipline it enforced was the point.
 *
 * **The real pair arrived with the CLI's write commands**, which is the first
 * caller with a genuine answer to either question: a person at a terminal has a
 * name, and the tree they are standing in has a HEAD. The MCP server keeps the
 * mocks, because the answers it needs — *which agent*, *which session* — are
 * facts the protocol does not carry and this file cannot invent.
 *
 * See PJ-031 for why attribution is recorded at all.
 */

import { spawnSync } from "node:child_process";
import { userInfo } from "node:os";

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
 * The working tree's HEAD, by asking git.
 *
 * `spawnSync`, not `exec`: the answer is needed before the command it stamps
 * runs, and there is nothing useful to do concurrently in between. It is one
 * process per LabKit invocation, which is a CLI, not per verb.
 *
 * **Every failure answers `""`**, which is what {@link GitContextProvider.head}
 * specifies: not a repository, git not installed, a repository with no commits
 * yet. Running LabKit outside a checkout is legitimate and must produce a
 * recorded fact — *no commit to name* — rather than a failed research command.
 * A record refusing to be written because the tool could not find git would be
 * the tail wagging the dog.
 *
 * The hash is **not** verified against anything. It says which commit the
 * working tree was on, not that the tree matched it; a dirty tree records the
 * commit it was dirty against, which is more than nothing and less than a
 * guarantee. Say the smaller true thing.
 */
export const gitContext: GitContextProvider = {
  head: () => {
    try {
      const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
      return result.status === 0 ? result.stdout.trim() : "";
    } catch {
      // `spawnSync` throws rather than returning a status when the binary is
      // missing outright, which is a different path from a non-zero exit.
      return "";
    }
  },
};

/**
 * A person at a terminal.
 *
 * `label` is what a reader scans and `id` is what two events are compared on,
 * and they are deliberately the same string here — a local username *is* the
 * stable handle on a single machine, and inventing a second identifier would
 * fabricate a distinction the environment does not make. The two fields stay
 * separate in the type because the MCP side genuinely has both.
 *
 * `override` is `--as` on the command line, and exists because the username is
 * a guess about intent: a shell script driving LabKit is not the person whose
 * account it runs under. When it is given it answers both questions, for the
 * same reason as above.
 */
export function personContext(override?: string): SessionContextProvider {
  // `userInfo()` throws when there is no passwd entry for the uid, which
  // happens in containers. `$USER` is the fallback, and "unknown" after that --
  // never an empty string, which `UNATTRIBUTED` already uses to mean something
  // else.
  const who =
    override ??
    (() => {
      try {
        return userInfo().username;
      } catch {
        return process.env.USER ?? "unknown";
      }
    })();
  return { label: () => who, id: () => who };
}

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
