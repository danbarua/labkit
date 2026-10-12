import { ChatCircleDotsIcon } from "@phosphor-icons/react";
import { type CSSProperties, lazy, Suspense, useEffect, useRef, useState } from "react";
import { useSavedNumber } from "../saved-flag";

// The agent exists only in the dev server, so the chat is dev-only: in a production build
// `import.meta.env.DEV` is false, the import is dropped, and there is no chat to show.
const AgentChat = import.meta.env.DEV
  ? lazy(() => import("../agent/AgentChat").then((m) => ({ default: m.AgentChat })))
  : undefined;

/** The chat's width until its border is moved, and the least it can be, in pixels. */
const CHAT_WIDTH = 400;
const MIN_CHAT = 320;
/** The most of the window's width the chat can take. */
const MOST_OF_WINDOW = 0.6;
/** How far one press of Left or Right moves the chat's border, in pixels. */
const BORDER_STEP = 16;

/** The widest the chat can be in this window, and never less than its least. */
const widest = () => Math.max(MIN_CHAT, Math.floor(window.innerWidth * MOST_OF_WINDOW));

/**
 * The border at the chat's left edge, which a drag or the window splitter pattern's keys move:
 * Left and Right by BORDER_STEP, Home to the chat's least width, End to its widest. A double-click
 * returns the chat to CHAT_WIDTH. The browser keeps the width for the next visit.
 */
function ChatBorder({
  width,
  setWidth,
  onDragging,
}: {
  width: number;
  setWidth: (next: number) => void;
  onDragging: (dragging: boolean) => void;
}) {
  const drag = useRef<{ x: number; width: number } | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const place = (next: number) =>
    setWidth(Math.round(Math.min(Math.max(next, MIN_CHAT), widest())));
  const stop = () => {
    drag.current = undefined;
    setDragging(false);
    onDragging(false);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> takes no focus or drag; this is the ARIA window splitter pattern.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the agent"
      aria-valuemin={MIN_CHAT}
      aria-valuemax={widest()}
      aria-valuenow={width}
      tabIndex={0}
      className={dragging ? "splitter vertical dragging" : "splitter vertical"}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, width };
        setDragging(true);
        onDragging(true);
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        // The chat is at the right, so dragging the border left widens it.
        if (start !== undefined) place(start.width + start.x - e.clientX);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={() => place(CHAT_WIDTH)}
      onKeyDown={(e) => {
        const next =
          e.key === "ArrowLeft"
            ? width + BORDER_STEP
            : e.key === "ArrowRight"
              ? width - BORDER_STEP
              : e.key === "Home"
                ? MIN_CHAT
                : e.key === "End"
                  ? widest()
                  : undefined;
        if (next === undefined) return;
        e.preventDefault();
        place(next);
      }}
    />
  );
}

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
  const [width, setWidth] = useSavedNumber("labkit.trace.chat.width", CHAT_WIDTH);
  const [resizing, setResizing] = useState(false);
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
      {shown ? <ChatBorder width={width} setWidth={setWidth} onDragging={setResizing} /> : null}
      <aside
        className={["chat-sidebar", shown ? "" : "collapsed", resizing ? "resizing" : ""]
          .filter(Boolean)
          .join(" ")}
        style={{ "--chat-width": `${width}px` } as CSSProperties}
        aria-label="Agent"
      >
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
