import type { SessionInfo } from "@agentclientprotocol/sdk";
import { listSessions } from "@labkit/acp-client";
import { CommandPalette, type PickItem } from "@labkit/ui";
import { useEffect, useState } from "react";
import { messageOf } from "../../message-of";

type Listed =
  | { kind: "loading" }
  | { kind: "not_listed" }
  | { kind: "failed"; message: string }
  | { kind: "listed"; sessions: readonly SessionInfo[] };

/** Newest first; a session the agent gave no time for goes last. */
const newestFirst = (a: SessionInfo, b: SessionInfo): number =>
  (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");

/**
 * The sessions the agent keeps for the folder `cwd`, in a palette to pick one from: `/sessions` in
 * the chat. The list is asked for each time the palette opens. Picking a session hands its id to
 * `onPick`, which reopens it; `current` is marked.
 */
export function SessionPicker({
  url,
  cwd,
  current,
  open,
  onClose,
  onPick,
}: {
  url: string;
  cwd: string | undefined;
  current: string | undefined;
  open: boolean;
  onClose: () => void;
  onPick: (sessionId: string) => void;
}) {
  const [listed, setListed] = useState<Listed>({ kind: "loading" });
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setListed({ kind: "loading" });
    listSessions({ url, ...(cwd === undefined ? {} : { cwd }) }).then(
      (sessions) => {
        if (cancelled) return;
        setListed(
          sessions === undefined
            ? { kind: "not_listed" }
            : { kind: "listed", sessions: [...sessions].sort(newestFirst) },
        );
      },
      (err: unknown) => {
        if (cancelled) return;
        setListed({ kind: "failed", message: messageOf(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, url, cwd]);

  const items: PickItem[] =
    listed.kind === "listed"
      ? listed.sessions.map((session) => ({
          id: session.sessionId,
          label: session.title || "Untitled",
          detail: [
            session.updatedAt ? new Date(session.updatedAt).toLocaleString() : undefined,
            session.sessionId,
          ]
            .filter((part) => part !== undefined)
            .join(" · "),
          keywords: session.sessionId,
          ...(session.sessionId === current ? { current: true } : {}),
        }))
      : [];
  const empty =
    listed.kind === "loading"
      ? "Asking the agent for its sessions…"
      : listed.kind === "not_listed"
        ? "This agent does not list its sessions."
        : listed.kind === "failed"
          ? `The sessions could not be listed: ${listed.message}`
          : `The agent has no sessions${cwd === undefined ? "" : ` in ${cwd}`}.`;
  return (
    <CommandPalette
      open={open}
      onClose={onClose}
      title="Sessions"
      placeholder="Search sessions"
      search
      items={items}
      empty={empty}
      onPick={(item) => onPick(item.id)}
    />
  );
}
