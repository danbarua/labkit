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
 * name, and the tree they are standing in has a HEAD.
 *
 * **The MCP server keeps one mock for the same reason — the protocol
 * carries neither fact — and as of 2026-08-28 it keeps only one.** The protocol
 * still cannot say which agent is calling, and this file still cannot invent
 * it; what changed is that the *agent* can now say, through the
 * `register_session` tool, and {@link SessionRegistry} below is where the
 * answer is held. `git_hash` is untouched and stays forty zeros: a commit is
 * not something a caller can be asked for, because the answer would be
 * unfalsifiable in a way a session id is not — an agent naming itself is
 * checkable against a bus that knows its sessions, an agent naming a commit is
 * checkable against nothing.
 *
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
  /**
   * How this provider came by the name it returns.
   *
   * **On the provider, not on the field, and that is the whole design.** #81
   * spent a while proposing `Observed<string>` / `Claimed<string>` type aliases
   * before noticing they cannot work: every member of the string taxonomy is
   * erased before anything runs, so a brand never reaches an event row and no
   * reader can ever act on it. The grade is a fact about *who answered*, and
   * the thing that knows is the answerer.
   *
   * It is a method rather than a constant because one provider's grade depends
   * on how it was built — {@link personContext} is `observed` when it reads the
   * operating system and `claimed` under `--author`, from one implementation.
   */
  how(): AttributionHow;
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

/**
 * A stand-in session, named so it cannot be mistaken for a real agent.
 *
 * **Do not cull this, and the reason is not that something still imports it.**
 * As of 2026-08-28 it reads as vestigial: the stdio server registers a real
 * agent, and {@link registeredSession}'s fallback to this one is what the write
 * gate exists to stop reaching an event. An unused-looking export in this
 * repository gets deleted, correctly and on sight.
 *
 * It is kept because **the HTTP surface has not been designed yet and will need
 * a stand-in while it is.** Over stdio the process is the session, so a registry
 * is the whole mechanism; over HTTP it is not, and the spike working that out
 * needs something to attribute to before it knows what the real answer is.
 * Measured on 2026-08-28 against `@modelcontextprotocol/sdk@1.30.0`: the default
 * transport is stateless, mints no `Mcp-Session-Id`, and throws on a reused
 * transport — so a registration has nowhere to live there until a
 * `sessionIdGenerator` is supplied, and *what* it should hang on is the open
 * question.
 *
 * **When that lands, ask this again.** If the HTTP surface ends up registering
 * the way stdio does, this has no caller and should go. Keeping it is a bet on
 * unfinished work, not a claim that it is reachable — and a bet with a date on
 * it is a different thing from a thing nobody looked at.
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
 *
 * **A register, not a check.** Any agent can register any string, and that is
 * the design rather than a gap in it: LabKit is a shared book, anyone may pick
 * up a pen, and who holds the keys to the stationery cupboard is somebody
 * else's job. What the record owes in return is honesty about *which* pen —
 * a registered id is something a caller **claimed**, never something LabKit
 * observed, and no amount of gating changes that. The gate over the write
 * tools (`src/mcp/server.ts`) stops an agent *forgetting* to sign, not lying
 * about the signature.
 *
 * **One per connection, held by `main()` and passed in**, exactly as the event
 * log is. Not module state: `inFlight` gets away with that because it serves a
 * single caller and a test-built server has no shutdown, whereas two servers in
 * one process — which the suite builds — would share one registration and each
 * would see the other's agent.
 *
 * Stdio only, and that is a fact about the transport rather than a decision.
 * The process *is* the session there, one client at a time, so a closure is the
 * whole mechanism. Over HTTP it would have nowhere to live: measured
 * 2026-08-28 against `@modelcontextprotocol/sdk@1.30.0`, the default transport
 * is stateless, mints no `Mcp-Session-Id`, and throws rather than serving a
 * second request through one transport. An HTTP LabKit must supply a
 * `sessionIdGenerator` so a registration has a key to hang on.
 */
export interface SessionRegistry {
  /** Records the caller's identity, replacing any previous one. */
  register(label: string, id: string): void;
  /**
   * What was registered, or `null` if nobody has said yet.
   *
   * `null` rather than falling back to {@link mockSessionContext}, so a caller
   * can tell *nobody registered* from *somebody registered something*. Those
   * are different facts and the gate exists to keep them apart — the same
   * reason {@link UNATTRIBUTED} is a named constant rather than three empty
   * strings.
   */
  registered(): { label: string; id: string } | null;
}

/** A fresh registry, holding nobody. */
export function sessionRegistry(): SessionRegistry {
  let who: { label: string; id: string } | null = null;
  return {
    register: (label, id) => {
      who = { label, id };
    },
    registered: () => who,
  };
}

/**
 * The registry as a {@link SessionContextProvider}, for `commandContext`.
 *
 * Falls back to {@link mockSessionContext} when nobody has registered — which
 * the write gate is what stops reaching an event. Without the gate this is the
 * pre-2026-08-28 behaviour: every MCP write stamped `mock-session-0`, the same
 * value for every agent on every machine, occupying the identity column of a
 * record whose whole purpose is provenance. A uniform fake is worse than an
 * empty field, because an empty field reads as unknown and this reads as known.
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
    attribution_how: session.how(),
    git_hash: git.head(),
  };
  return { clock, attribution };
}
