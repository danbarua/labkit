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
function useAgentSession(url: string) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [status, setStatus] = useState<Status>("connecting");
  const client = useRef<SessionClient | null>(null);

  useEffect(() => {
    let abandoned = false;
    let opened: SessionClient | undefined;
    setStatus("connecting");
    connectSession({ url, onEvent: dispatch }).then(
      (connected) => {
        if (abandoned) {
          void connected.close();
          return;
        }
        opened = connected;
        client.current = connected;
        setStatus("ready");
      },
      (err: unknown) => {
        if (abandoned) return;
        dispatch({ type: "failed", message: err instanceof Error ? err.message : String(err) });
        setStatus("failed");
      },
    );
    return () => {
      abandoned = true;
      client.current = null;
      void opened?.close();
    };
  }, [url]);

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
 * A live session with the development fake agent, which the dev server mounts at `/acp`. It plays
 * a scripted turn for each prompt, and a prompt of `/scenario <id>` picks which.
 */
export default function AgentSession() {
  const { state, status, send, cancel, answer, setConfig } = useAgentSession("/acp");
  return (
    <>
      <Bar />
      <div style={{ padding: "8px 16px", color: "var(--text-dim)", fontSize: 12 }}>
        Fake agent ({status}). Try{" "}
        {SCENARIOS.map((s) => (
          <code key={s.id} style={{ marginRight: 8 }}>
            /scenario {s.id}
          </code>
        ))}
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
