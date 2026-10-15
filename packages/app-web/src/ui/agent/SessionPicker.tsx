import { CommandPalette, type PickItem } from "@labkit/ui";
import { sessionsNote, useAgentSessions } from "./sessions";

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
  const listed = useAgentSessions({ url, cwd, enabled: open });

  const items: PickItem[] =
    listed.kind === "loaded"
      ? (listed.value ?? []).map((session) => ({
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
  const note = sessionsNote(listed, cwd);
  return (
    <CommandPalette
      open={open}
      onClose={onClose}
      title="Sessions"
      placeholder="Search sessions"
      search
      items={items}
      {...(note === undefined ? {} : { empty: note })}
      onPick={(item) => onPick(item.id)}
    />
  );
}
