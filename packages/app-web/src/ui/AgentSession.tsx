import type { RequestPermissionOutcome } from "@agentclientprotocol/sdk";
import { connectSession, type SessionClient } from "@labkit/acp-client";
import { SCENARIOS } from "@labkit/acp-scenarios";
import { Conversation } from "@labkit/ui";
import { RECORD_TYPES } from "./record-types";
import "@labkit/ui/ui.css";
import { initialState, reduce } from "@labkit/view-model";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Bar } from "./Bar";

type Status = "connecting" | "ready" | "failed";

/** One ACP session at `url`, as a view that follows it and the calls that drive it. */
function useAgentSession(url: string, cwd?: string) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [status, setStatus] = useState<Status>("connecting");
  const client = useRef<SessionClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    let opened: SessionClient | undefined;
    setStatus("connecting");
    // React's development-mode double-invoke runs this effect, its cleanup, then this effect
    // again, synchronously, with no gap for a second connect to see or reuse the first's. Deferring
    // the real connect by a tick lets the first invocation's cleanup cancel it before it ever
    // calls connectSession, so exactly one real ACP connection opens. Opening two at once is not
    // merely wasteful: confirmed against a real agent's logs, the two occasionally race to open
    // one connection's own per-session event stream, which the agent answers 409 to and the
    // transport then treats as connection-fatal — even though the session itself was created
    // successfully — surfacing as an error the person never caused.
    const timer = setTimeout(() => {
      connectSession({ url, cwd, onEvent: dispatch }).then(
        (connected) => {
          if (cancelled) {
            void connected.close();
            return;
          }
          opened = connected;
          client.current = connected;
          setStatus("ready");
        },
        (err: unknown) => {
          if (cancelled) return;
          dispatch({ type: "failed", message: err instanceof Error ? err.message : String(err) });
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
  }, [url, cwd]);

  const send = useCallback((text: string) => void client.current?.prompt(text), []);
  const cancel = useCallback(() => void client.current?.cancel(), []);
  const answer = useCallback(
    (requestId: string, outcome: RequestPermissionOutcome) =>
      client.current?.answerPermission(requestId, outcome),
    [],
  );
  const setConfig = useCallback(
    (configId: string, value: string | boolean) =>
      void client.current?.setConfigOption(configId, value),
    [],
  );
  return { state, status, send, cancel, answer, setConfig };
}

/**
 * A live session with the agent the dev server mounts at `/acp`: the fake agent by default, or a
 * real one when `LABKIT_ACP_AGENT_URL` names it. A real agent needs an absolute, writable `cwd`
 * for its session store; `VITE_LABKIT_ACP_CWD` (set by `dev-with-agent.ts`) supplies one, and the
 * fake agent ignores it. Without either, ACP's own default of `/` fails on a read-only root.
 */
export default function AgentSession() {
  const cwd = import.meta.env.VITE_LABKIT_ACP_CWD as string | undefined;
  const real = cwd !== undefined;
  const { state, status, send, cancel, answer, setConfig } = useAgentSession("/acp", cwd);
  return (
    <>
      <Bar />
      <div style={{ padding: "8px 16px", color: "var(--text-dim)", fontSize: 12 }}>
        {real ? (
          `Agent (${status})`
        ) : (
          <>
            Fake agent ({status}). Try{" "}
            {SCENARIOS.map((s) => (
              <code key={s.id} style={{ marginRight: 8 }}>
                /scenario {s.id}
              </code>
            ))}
          </>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Conversation
          state={state}
          records={{ types: RECORD_TYPES }}
          onSend={send}
          onCancel={cancel}
          onAnswer={answer}
          onSetConfig={setConfig}
        />
      </div>
    </>
  );
}
