import { classNames, IconButton } from "@labkit/ui";
import { ChatCircleDotsIcon } from "@phosphor-icons/react";
import {
  type CSSProperties,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { mentionItems } from "../agent/mentions";
import { useLoaded } from "../loaded";
import { useWorkspacePaths } from "./file-paths";
import { Separator } from "./separator";
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
  const place = (next: number) =>
    setWidth(Math.round(Math.min(Math.max(next, MIN_CHAT), widest())));
  return (
    <Separator
      orientation="vertical"
      label="Resize the agent"
      min={MIN_CHAT}
      max={widest()}
      now={width}
      className="splitter vertical"
      begin={() => width}
      // The chat is at the right, so dragging the border left widens it.
      onDrag={(from, pixels) => place(from - pixels)}
      onDragging={onDragging}
      onReset={() => place(CHAT_WIDTH)}
      onKey={(key) => {
        const next =
          key === "ArrowLeft"
            ? width + BORDER_STEP
            : key === "ArrowRight"
              ? width - BORDER_STEP
              : key === "Home"
                ? MIN_CHAT
                : key === "End"
                  ? widest()
                  : undefined;
        if (next === undefined) return false;
        place(next);
        return true;
      }}
    />
  );
}

/** Whether this build has the agent's chat at all. */
export const HAS_CHAT = AgentChat !== undefined;

export type Folder =
  | { kind: "loading" }
  | { kind: "mapped"; cwd: string }
  | { kind: "unmapped"; reason: string };

/**
 * The folder the workspace `slug` is, from the dev server (`/agent-workspace/<slug>`, which reads
 * the workspaces mapping file). The agent's sessions for the workspace open in it. No workspace in
 * scope has no folder to find.
 */
function useWorkspaceFolder(slug: string | undefined): Folder {
  const loaded = useLoaded(
    async (signal): Promise<Folder> => {
      const res = await fetch(`/agent-workspace/${encodeURIComponent(slug ?? "")}`, { signal });
      const body = (await res.json()) as { cwd?: string | null; reason?: string; error?: string };
      if (res.ok && typeof body.cwd === "string") return { kind: "mapped", cwd: body.cwd };
      return {
        kind: "unmapped",
        reason: `The agent cannot open a session in ${slug}: ${body.reason ?? body.error ?? `the dev server answered ${res.status}`}.`,
      };
    },
    slug ?? "",
    { enabled: slug !== undefined },
  );
  switch (loaded.kind) {
    case "loading":
      return loaded;
    case "loaded":
      return loaded.value;
    case "failed":
      return {
        kind: "unmapped",
        reason: `The agent cannot open a session in ${slug}: its folder was not found (${loaded.message}).`,
      };
  }
}

/** The agent's chat in the workspace in scope, as the page drives it. */
export interface Chat {
  /** The slug of the workspace in scope. */
  slug: string;
  folder: Folder;
  /** Whether the chat is shown: expanded at full width, or its drawer open in a narrow window. */
  shown: boolean;
  /** Whether the chat's session is connected: it has been shown in this workspace on this page. */
  connected: boolean;
  /** The session to reopen in this workspace. */
  sessionId: string | undefined;
  onStarted: (sessionId: string) => void;
  /** Opens another of this workspace's sessions, from `/sessions`. */
  onPick: (sessionId: string) => void;
  /** Why the chat cannot be shown, when it cannot. */
  unavailable: string | undefined;
}

/**
 * The agent's chat for the workspace `slug`, kept for the life of the page.
 * - The session connects the first time the chat is shown in a workspace, and stays connected
 *   while the chat is hidden. A workspace the chat was never shown in has no session.
 * - Each workspace keeps its session: leaving one and coming back reopens the session it had.
 * - `session` is the address's `?session=`, which names the session of the workspace in scope;
 *   `setSession` writes it. On leaving a workspace, the address names the next one's session.
 */
export function useChat({
  slug,
  expanded,
  session,
  setSession,
}: {
  slug: string | undefined;
  expanded: boolean;
  session: string | undefined;
  setSession: (sessionId: string | undefined) => void;
}): Chat | undefined {
  // A build without the chat asks for no folder.
  const folder = useWorkspaceFolder(AgentChat === undefined ? undefined : slug);
  // The session each workspace had on this page, and the workspace the address's session is.
  // Until the address is written again, the session it names is the workspace's just left.
  const sessions = useRef(new Map<string, string>());
  const addressed = useRef(slug);
  const left = useRef<string | undefined>(undefined);
  if (addressed.current !== slug) {
    if (addressed.current !== undefined && session !== undefined)
      sessions.current.set(addressed.current, session);
    addressed.current = slug;
    left.current = session;
  }
  const named = session === left.current ? undefined : session;
  if (slug !== undefined && named !== undefined) sessions.current.set(slug, named);
  const sessionId = slug === undefined ? undefined : sessions.current.get(slug);
  useEffect(() => {
    if (session !== sessionId) setSession(sessionId);
  }, [session, sessionId, setSession]);

  const [shownIn, setShownIn] = useState<ReadonlySet<string>>(new Set());
  const shown = expanded && folder.kind === "mapped";
  useEffect(() => {
    if (shown && slug !== undefined && !shownIn.has(slug)) setShownIn(new Set([...shownIn, slug]));
  }, [shown, slug, shownIn]);

  const onStarted = useCallback(
    (started: string) => {
      if (addressed.current !== undefined) sessions.current.set(addressed.current, started);
      setSession(started);
    },
    [setSession],
  );
  if (AgentChat === undefined || slug === undefined) return undefined;
  return {
    slug,
    folder,
    shown,
    connected: shown || shownIn.has(slug),
    sessionId,
    onStarted,
    onPick: onStarted,
    unavailable:
      folder.kind === "unmapped"
        ? folder.reason
        : folder.kind === "loading"
          ? `Finding ${slug}'s folder…`
          : undefined,
  };
}

/** The button that shows or hides the agent's chat: in the rail, or in a narrow window, the top bar. */
export function ChatButton({ chat, onToggle }: { chat: Chat; onToggle: () => void }) {
  return (
    <IconButton
      className="rail-btn"
      on={chat.shown}
      label="Show or hide the agent"
      icon={ChatCircleDotsIcon}
      aria-expanded={chat.shown}
      unavailable={chat.unavailable}
      onClick={onToggle}
    />
  );
}

/**
 * The agent's chat at the right of the page. At full width the rail beside it stays when it is
 * minimised; in a narrow window it is a drawer over the page, and its button is in the top bar.
 * The chat's sessions open in the workspace's folder; a workspace the mapping file does not map has
 * no chat, and the button says why.
 */
export function ChatSidebar({
  chat,
  narrow,
  onToggle,
}: {
  chat: Chat;
  narrow: boolean;
  onToggle: () => void;
}) {
  const [width, setWidth] = useSavedNumber("labkit.workspace.chat.width", CHAT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const { folder, shown } = chat;
  const paths = useWorkspacePaths(chat.slug, chat.connected, "chat mentions")?.paths;
  const cwd = folder.kind === "mapped" ? folder.cwd : undefined;
  const mentions = useMemo(
    () => (cwd === undefined || paths === undefined ? undefined : mentionItems(cwd, paths)),
    [cwd, paths],
  );
  if (AgentChat === undefined) return null;
  return (
    <>
      {shown && !narrow ? (
        <ChatBorder width={width} setWidth={setWidth} onDragging={setResizing} />
      ) : null}
      <aside
        className={classNames("chat-sidebar", shown ? "open" : "collapsed", resizing && "resizing")}
        style={{ "--chat-width": `${width}px` } as CSSProperties}
        aria-label="Agent"
      >
        {chat.connected && folder.kind === "mapped" ? (
          <Suspense fallback={null}>
            <AgentChat
              // A workspace's sessions are its own: another folder is another chat.
              key={folder.cwd}
              cwd={folder.cwd}
              sessionId={chat.sessionId}
              onStarted={chat.onStarted}
              onPick={chat.onPick}
              {...(mentions === undefined ? {} : { mentions })}
              shown={shown}
            />
          </Suspense>
        ) : null}
      </aside>
      {narrow ? null : (
        <nav className="rail right" aria-label="Agent sidebar">
          <ChatButton chat={chat} onToggle={onToggle} />
        </nav>
      )}
    </>
  );
}
