import { ChatCircleDotsIcon } from "@phosphor-icons/react";
import { lazy, Suspense } from "react";

// The agent exists only in the dev server, so the chat is dev-only: in a production build
// `import.meta.env.DEV` is false, the import is dropped, and there is no chat to show.
const AgentChat = import.meta.env.DEV
  ? lazy(() => import("../agent/AgentChat").then((m) => ({ default: m.AgentChat })))
  : undefined;

/** Whether this build has the agent's chat at all. */
export const HAS_CHAT = AgentChat !== undefined;

/**
 * The agent's chat at the right of the page, and the rail beside it that stays when the chat is
 * minimised. The session connects the first time the chat is shown and stays connected while it is
 * minimised; only its view is not drawn.
 */
export function ChatSidebar({
  expanded,
  onToggle,
  connected,
  sessionId,
  onStarted,
}: {
  expanded: boolean;
  onToggle: () => void;
  /** Whether the chat has been shown on this page, which is when the session connects. */
  connected: boolean;
  sessionId: string | undefined;
  onStarted: (sessionId: string) => void;
}) {
  if (AgentChat === undefined) return null;
  return (
    <>
      <aside className={expanded ? "chat-sidebar" : "chat-sidebar collapsed"} aria-label="Agent">
        {connected ? (
          <Suspense fallback={null}>
            <AgentChat sessionId={sessionId} onStarted={onStarted} shown={expanded} />
          </Suspense>
        ) : null}
      </aside>
      <nav className="rail right" aria-label="Agent sidebar">
        <button
          type="button"
          className={expanded ? "rail-btn on" : "rail-btn"}
          aria-label="Show or hide the agent"
          aria-expanded={expanded}
          title="Show or hide the agent"
          onClick={onToggle}
        >
          <ChatCircleDotsIcon aria-hidden="true" />
        </button>
      </nav>
    </>
  );
}
