/**
 * Where a command's attribution comes from.
 */

import { spawnSync } from "node:child_process";
import { userInfo } from "node:os";

import {
  type AttributionContext,
  type AttributionHow,
  type Clock,
  type CommandContext,
  systemClock,
} from "./domain";

/** The commit a command ran against. */
export interface GitContextProvider {
  /**
   * The current HEAD, or `""` outside a repository.
   */
  head(): string;
}

/** Who is running commands. */
export interface SessionContextProvider {
  /** Human-readable, for a person scanning a report. Collides and gets renamed. */
  label(): string;
  /** Stable, for comparing two events. Never shown in place of the label. */
  id(): string;
  /**
   * How this provider came by the name it returns.
   */
  how(): AttributionHow;
}

/**
 * A stand-in HEAD, and visibly one.
 */
export const mockGitContext: GitContextProvider = {
  head: () => "0".repeat(40),
};

/**
 * A stand-in session, named so it cannot be mistaken for a real agent.
 */
export const mockSessionContext: SessionContextProvider = {
  label: () => "mock-session",
  id: () => "mock-session-0",
  // **`claimed`, not a fourth grade.** Nothing observed anything, and the
  // harness asserted a name LabKit stored without checking -- which is exactly
  // what `claimed` says. That it is a *stub* is a fact about how good the
  // assertion is, and the grade does not rank assertions, it says where they
  // came from.
  how: () => "claimed",
};

/**
 * The working tree's HEAD, by asking git.
 */
export const gitContext: GitContextProvider = {
  head: () => {
    try {
      const result = spawnSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      });
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
 */
export function personContext(override?: string): SessionContextProvider {
  if (override === "") throw new Error("author label must not be empty");
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
  // **The grade is decided here, at construction, from how `who` was reached.**
  // With an override a caller asserted a name and nothing checked it — true
  // even when it happens to match the OS user, which is exactly the case that
  // earned this field: `labkit --author dan` and `labkit` on dan's machine
  // wrote byte-identical events, and only one of them had looked at anything.
  const how: AttributionHow = override === undefined ? "observed" : "claimed";
  return { label: () => who, id: () => who, how: () => how };
}

/**
 * Who is on the other end of one stdio connection, once they have said.
 */
export interface SessionRegistry {
  /**
   * Records the caller's identity, replacing any previous one. `reconstructedFrom` is what the
   * connection's writes were read off, when the agent did not see the work happen.
   */
  register(label: string, id: string, reconstructedFrom?: string): void;
  /**
   * What was registered, or `null` if nobody has said yet.
   */
  registered(): { label: string; id: string; reconstructedFrom: string | null } | null;
}

/** A fresh registry, holding nobody. */
export function sessionRegistry(): SessionRegistry {
  let who: { label: string; id: string; reconstructedFrom: string | null } | null = null;
  return {
    // Replaced whole rather than merged: registering again is a new statement of
    // who is on the line, and a source carried over from the previous one would
    // stamp acts the caller never said were reconstructed.
    register: (label, id, reconstructedFrom) => {
      who = { label, id, reconstructedFrom: reconstructedFrom ?? null };
    },
    registered: () => who,
  };
}

/**
 * The registry as a {@link SessionContextProvider}, for `commandContext`.
 */
export function registeredSession(registry: SessionRegistry): SessionContextProvider {
  return {
    label: () => registry.registered()?.label ?? mockSessionContext.label(),
    id: () => registry.registered()?.id ?? mockSessionContext.id(),
    // **`claimed` either way, and there is no branch here on purpose.** A
    // registered agent asserted its own id and LabKit stored it unchecked; the
    // fallback is the harness asserting a stub. Both are assertions, and the
    // grade says where a value came from rather than how much it is worth — a
    // branch would imply the registered one had been verified.
    how: () => "claimed",
  };
}

/**
 * Assembles the context a command executes in.
 */
export function commandContext(
  git: GitContextProvider,
  session: SessionContextProvider,
  clock: Clock = systemClock,
  reconstructedFrom?: string,
): CommandContext {
  const attribution: AttributionContext = {
    attribution_label: session.label(),
    attribution_id: session.id(),
    attribution_how: session.how(),
    git_hash: git.head(),
  };
  // Omitted rather than passed as `undefined`, so a caller spreading this over
  // `ResearchSessionOptions` cannot overwrite a source set beside it.
  return reconstructedFrom ? { clock, attribution, reconstructedFrom } : { clock, attribution };
}
