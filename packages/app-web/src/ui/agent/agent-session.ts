import type {
  CreateElicitationResponse,
  PromptCapabilities,
  RequestPermissionOutcome,
} from "@agentclientprotocol/sdk";
import { connectSession, type SessionClient } from "@labkit/acp-client";
import type { AttachLimits, ResolveLink } from "@labkit/ui";
import { initialState, reduce } from "@labkit/view-model";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

/** The command the chat carries out itself rather than sending: start a new session in place. */
export const NEW = { name: "new", description: "Start a new session" } as const;
/** Commands the chat carries out itself. */
export const HOST_COMMANDS = [NEW];

export type Status = "connecting" | "ready" | "failed";

/**
 * Why the composer takes no input while the session is opening: there is no session to send to,
 * and the files, commands and settings it offers come from what the agent answers. Once opening has
 * failed the composer takes input again, so `/new` can start another session.
 */
export const CONNECTING = "Connecting to the agent…";

/** What a failure to reach the agent's session adds: the way on from it. */
const TRY_NEW = `Send /${NEW.name} to start a new session.`;

type ViewAction = Parameters<typeof reduce>[1] | { type: "reset" };

/**
 * The files the composer takes, from what the agent advertises: any file when it takes embedded
 * files, images when it takes only images, none otherwise. At most four files of 20 MiB each.
 */
function attachLimits(takes: PromptCapabilities | undefined): AttachLimits | undefined {
  const most = { maxFiles: 4, maxBytes: 20 * 1024 * 1024 };
  if (takes?.embeddedContext) return most;
  if (takes?.image) return { ...most, accept: ["image/*"] };
  return undefined;
}

/**
 * Where the page fetches a file the agent links to as `blob://<sha256>.<ext>`: the dev server's
 * `/blob/` route, which the agent's HTTP host answers from the files its sessions stored.
 */
export const resolveLink: ResolveLink = (uri) =>
  uri.startsWith("blob://") ? `/blob/${uri.slice("blob://".length)}` : undefined;

/** The view of a session, emptied when another session is opened in its place. */
const reduceView = (state: typeof initialState, action: ViewAction) =>
  action.type === "reset" ? initialState : reduce(state, action);

/**
 * One ACP session at `url`, as a view that follows it and the calls that drive it: the session
 * `sessionId` names, reopened, or a new one when it names none. `started` is the id of the session
 * this hook started; being asked for that one afterwards is not a request to reopen it.
 * `onStarted` is called with the id of each session the hook starts, so the page can put it in its
 * address. Sending `/new` starts a new session in place: the session `sessionId` named until then
 * is not reopened, even before the page's address drops it.
 */
export function useAgentSession({
  url,
  cwd,
  sessionId,
  onStarted,
}: {
  url: string;
  cwd: string | undefined;
  sessionId: string | undefined;
  onStarted: (sessionId: string) => void;
}) {
  const [state, dispatch] = useReducer(reduceView, initialState);
  const [status, setStatus] = useState<Status>("connecting");
  const [started, setStarted] = useState<string>();
  const [takes, setTakes] = useState<PromptCapabilities>();
  // Counts the `/new` commands, each of which connects again; and the session named before the
  // last one, which is not reopened.
  const [generation, setGeneration] = useState(0);
  const [left, setLeft] = useState<string>();
  const client = useRef<SessionClient | null>(null);
  const reopen = sessionId === started || sessionId === left ? undefined : sessionId;

  useEffect(() => {
    let cancelled = false;
    let opened: SessionClient | undefined;
    setStatus("connecting");
    setTakes(undefined);
    dispatch({ type: "reset" });
    // React's development-mode double-invoke runs this effect, its cleanup, then this effect
    // again, synchronously, with no gap for a second connect to see or reuse the first's. Deferring
    // the real connect by a tick lets the first invocation's cleanup cancel it before it ever
    // calls connectSession, so exactly one real ACP connection opens. Opening two at once is not
    // merely wasteful: confirmed against a real agent's logs, the two occasionally race to open
    // one connection's own per-session event stream, which the agent answers 409 to and the
    // transport then treats as connection-fatal — even though the session itself was created
    // successfully — surfacing as an error the person never caused.
    const timer = setTimeout(() => {
      connectSession({
        url,
        onEvent: dispatch,
        ...(cwd === undefined ? {} : { cwd }),
        ...(reopen === undefined ? {} : { sessionId: reopen }),
      }).then(
        (connected) => {
          if (cancelled) {
            void connected.close();
            return;
          }
          opened = connected;
          client.current = connected;
          if (reopen === undefined) setStarted(connected.sessionId);
          setTakes(connected.promptCapabilities);
          setStatus("ready");
        },
        (err: unknown) => {
          if (cancelled) return;
          const reason = err instanceof Error ? err.message : String(err);
          dispatch({ type: "failed", message: `${reason} ${TRY_NEW}` });
          setStatus("failed");
        },
      );
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      client.current = null;
      void opened?.close();
    };
    // `generation` is read so that `/new` connects again even when `reopen` is unchanged.
  }, [url, cwd, reopen, generation]);

  // Once the address names another session, the one left by `/new` may be reopened again.
  useEffect(() => {
    if (left !== undefined && sessionId !== left) setLeft(undefined);
  }, [sessionId, left]);

  const announce = useRef(onStarted);
  announce.current = onStarted;
  useEffect(() => {
    if (started !== undefined) announce.current(started);
  }, [started]);

  // A reload or a closed tab runs no effect cleanup, so the session is left as the page unloads.
  // By `pagehide` the browser has already ended the prompt's request on a reload, so the client
  // no longer counts the turn as running; `beforeunload` comes before that. `pagehide` covers a
  // browser that does not fire `beforeunload`.
  useEffect(() => {
    const leave = () => client.current?.leave();
    window.addEventListener("beforeunload", leave);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("beforeunload", leave);
      window.removeEventListener("pagehide", leave);
    };
  }, []);

  const send = useCallback(
    (text: string, files: readonly File[]) => {
      if (text.trim() === `/${NEW.name}`) {
        setLeft(sessionId);
        setStarted(undefined);
        setGeneration((n) => n + 1);
        return;
      }
      if (client.current === null) {
        dispatch({
          type: "failed",
          message: `The message was not sent: the agent is not connected. ${TRY_NEW}`,
        });
        return;
      }
      void client.current.prompt(text, files);
    },
    [sessionId],
  );
  const cancel = useCallback(() => void client.current?.cancel(), []);
  const answer = useCallback(
    (requestId: string, outcome: RequestPermissionOutcome) =>
      client.current?.answerPermission(requestId, outcome),
    [],
  );
  const answerQuestion = useCallback(
    (requestId: string, response: CreateElicitationResponse) =>
      client.current?.answerQuestion(requestId, response),
    [],
  );
  const setConfig = useCallback(
    (configId: string, value: string | boolean) =>
      void client.current?.setConfigOption(configId, value),
    [],
  );
  const attach = attachLimits(takes);
  return { state, status, started, attach, send, cancel, answer, answerQuestion, setConfig };
}
