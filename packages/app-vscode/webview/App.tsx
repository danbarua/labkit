import { Conversation } from "@labkit/ui";
import "@labkit/ui/ui.css";
import { initialState, reduce } from "@labkit/view-model";
import { useEffect, useReducer, useRef, useState } from "react";
import { type InboundMessage, vscodeSession } from "./vscode-session";

/**
 * The extension host is already the ACP client (it owns the connection to the agent); this
 * webview only renders what it says. `vscodeSession` turns its postMessage traffic into the same
 * `ViewEvent`s the web app's HTTP client produces, so `reduce` and `Conversation` need nothing
 * webview-specific. Keyed by `generation`, which increments on `reset` (a new or switched
 * session), so the conversation starts from `initialState` rather than carrying the previous
 * session's blocks forward.
 */
export function App() {
  const [generation, setGeneration] = useState(0);
  return <Session key={generation} onReset={() => setGeneration((current) => current + 1)} />;
}

function Session({ onReset }: { onReset: () => void }) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const bridge = useRef<ReturnType<typeof vscodeSession> | null>(null);

  useEffect(() => {
    const onMessage = (message: InboundMessage) => {
      switch (message.kind) {
        case "event":
          dispatch(message.event);
          break;
        case "reset":
          onReset();
          break;
        case "ready":
          if (message.configOptions.length > 0) {
            dispatch({
              type: "update",
              update: {
                sessionUpdate: "config_option_update",
                configOptions: [...message.configOptions],
              },
            });
          }
          break;
      }
    };
    const session = vscodeSession(onMessage);
    bridge.current = session;
    return () => {
      session.dispose();
      bridge.current = null;
    };
  }, [onReset]);

  return (
    <Conversation
      state={state}
      onSend={(text) => bridge.current?.prompt(text)}
      onCancel={() => bridge.current?.cancel()}
      onSetConfig={(configId, value) => bridge.current?.setConfigOption(configId, value)}
    />
  );
}
