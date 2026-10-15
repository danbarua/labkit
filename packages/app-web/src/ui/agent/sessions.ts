import type { SessionInfo } from "@agentclientprotocol/sdk";
import { listSessions } from "@labkit/acp-client";
import { type Loaded, useLoaded } from "../loaded";

/** Newest first; a session the agent gave no time for goes last. */
const newestFirst = (a: SessionInfo, b: SessionInfo): number =>
  (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");

/**
 * The sessions the agent at `url` keeps for the folder `cwd`, newest first, asked for again each
 * time `enabled` turns true. The value is `undefined` when the agent does not list its sessions.
 */
export function useAgentSessions({
  url,
  cwd,
  enabled = true,
}: {
  url: string;
  cwd: string | undefined;
  enabled?: boolean;
}): Loaded<readonly SessionInfo[] | undefined> {
  return useLoaded(
    () =>
      listSessions({ url, ...(cwd === undefined ? {} : { cwd }) }).then(
        (sessions) => sessions && [...sessions].sort(newestFirst),
      ),
    `${url} ${cwd ?? ""} ${enabled}`,
    // A listing opens an ACP connection: see `useLoaded` for why it waits a tick.
    { enabled, deferred: true },
  );
}

/** What a list of the sessions says in place of its rows, or `undefined` when it has rows. */
export function sessionsNote(
  listed: Loaded<readonly SessionInfo[] | undefined>,
  cwd: string | undefined,
): string | undefined {
  switch (listed.kind) {
    case "loading":
      return "Asking the agent for its sessions…";
    case "failed":
      return `The sessions could not be listed: ${listed.message}`;
    case "loaded":
      if (listed.value === undefined) return "This agent does not list its sessions.";
      return listed.value.length === 0
        ? `The agent has no sessions${cwd === undefined ? "" : ` in ${cwd}`}.`
        : undefined;
  }
}
