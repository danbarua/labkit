import { ChatCircleDotsIcon } from "@phosphor-icons/react";
import { lazy, Suspense, useEffect, useState } from "react";

// The agent exists only in the dev server, so the chat is dev-only: in a production build
// `import.meta.env.DEV` is false, the import is dropped, and there is no chat to show.
const AgentChat = import.meta.env.DEV
  ? lazy(() => import("../agent/AgentChat").then((m) => ({ default: m.AgentChat })))
  : undefined;

/** Whether this build has the agent's chat at all. */
export const HAS_CHAT = AgentChat !== undefined;

type Folder =
  | { kind: "loading" }
  | { kind: "mapped"; cwd: string }
  | { kind: "unmapped"; reason: string };

/**
 * The folder the workspace `slug` is, from the dev server (`/agent-workspace/<slug>`, which reads
 * the workspaces mapping file). The agent's sessions for the workspace open in it.
 */
function useWorkspaceFolder(slug: string): Folder {
  const [folder, setFolder] = useState<Folder>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setFolder({ kind: "loading" });
    fetch(`/agent-workspace/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as { cwd?: string | null; reason?: string; error?: string };
        if (res.ok && typeof body.cwd === "string") setFolder({ kind: "mapped", cwd: body.cwd });
        else
          setFolder({
            kind: "unmapped",
            reason: `The agent cannot open a session in ${slug}: ${body.reason ?? body.error ?? `the dev server answered ${res.status}`}.`,
          });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setFolder({
          kind: "unmapped",
          reason: `The agent cannot open a session in ${slug}: its folder was not found (${err instanceof Error ? err.message : String(err)}).`,
        });
      });
    return () => controller.abort();
  }, [slug]);
  return folder;
}

/**
 * The agent's chat at the right of the page, and the rail beside it that stays when the chat is
 * minimised. The chat's sessions open in the workspace's folder; a workspace the mapping file does
 * not map has no chat, and the rail's button says why. The session connects the first time the chat
 * is shown and stays connected while it is minimised; only its view is not drawn.
 */
export function ChatSidebar({
  workspace,
  expanded,
  onToggle,
  connected,
  sessionId,
  onStarted,
}: {
  /** The slug of the workspace in scope. */
  workspace: string;
  expanded: boolean;
  onToggle: () => void;
  /** Whether the chat has been shown on this page, which is when the session connects. */
  connected: boolean;
  sessionId: string | undefined;
  onStarted: (sessionId: string) => void;
}) {
  const folder = useWorkspaceFolder(workspace);
  if (AgentChat === undefined) return null;
  const unavailable =
    folder.kind === "unmapped"
      ? folder.reason
      : folder.kind === "loading"
        ? `Finding ${workspace}'s folder…`
        : undefined;
  const shown = expanded && folder.kind === "mapped";
  return (
    <>
      <aside className={shown ? "chat-sidebar" : "chat-sidebar collapsed"} aria-label="Agent">
        {connected && folder.kind === "mapped" ? (
          <Suspense fallback={null}>
            <AgentChat
              // A workspace's sessions are its own: another folder is another chat.
              key={folder.cwd}
              cwd={folder.cwd}
              sessionId={sessionId}
              onStarted={onStarted}
              shown={shown}
            />
          </Suspense>
        ) : null}
      </aside>
      <nav className="rail right" aria-label="Agent sidebar">
        <button
          type="button"
          className={shown ? "rail-btn on" : "rail-btn"}
          aria-label="Show or hide the agent"
          aria-expanded={shown}
          title={unavailable ?? "Show or hide the agent"}
          disabled={unavailable !== undefined}
          onClick={onToggle}
        >
          <ChatCircleDotsIcon aria-hidden="true" />
        </button>
      </nav>
    </>
  );
}
