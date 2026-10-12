import { SCENARIOS } from "@labkit/acp-scenarios";
import { Conversation } from "@labkit/ui";
import "@labkit/ui/ui.css";
import { AGENT_CWD, AGENT_URL } from "../agent-endpoint";
import { RECORD_TYPES } from "../record-types";
import { useSavedTheme } from "../saved-theme";
import { CONNECTING, HOST_COMMANDS, resolveLink, useAgentSession } from "./agent-session";

/**
 * A live session with the agent the dev server mounts at `/acp`: the fake agent by default, or a
 * real one when `LABKIT_ACP_AGENT_URL` names it. The session opens in `cwd`, the folder the agent's
 * tools work in; a real agent needs it absolute, and the fake agent ignores it. ACP has no default
 * `cwd`. The session stays connected while `shown` is false; only its view is not drawn.
 */
export function AgentChat({
  cwd,
  sessionId,
  onStarted,
  shown = true,
  themeButton = false,
}: {
  /** The folder the session opens in. */
  cwd: string | undefined;
  /** The session to reopen; a new one is started when this names none. */
  sessionId: string | undefined;
  /** Called with the id of each session this starts, so the page can put it in its address. */
  onStarted: (sessionId: string) => void;
  shown?: boolean;
  /** Whether the conversation draws its own theme button, for a page with no top bar. */
  themeButton?: boolean;
}) {
  // The dev stack names a folder for the real agent and none for the fake one.
  const real = AGENT_CWD !== undefined;
  const { state, status, attach, send, cancel, answer, answerQuestion, setConfig } =
    useAgentSession({ url: AGENT_URL, cwd, sessionId, onStarted });
  const [theme, setTheme] = useSavedTheme();
  if (!shown) return null;
  return (
    <div className="agent-chat">
      <div className="agent-status">
        {real ? (
          `Agent (${status})`
        ) : (
          <>
            Fake agent ({status}). Try{" "}
            {SCENARIOS.map((s) => (
              <code key={s.id}>/scenario {s.id}</code>
            ))}
          </>
        )}
      </div>
      <div className="agent-conversation">
        <Conversation
          state={state}
          records={{ types: RECORD_TYPES }}
          theme={theme}
          {...(themeButton ? { onThemeChange: setTheme } : {})}
          hostCommands={HOST_COMMANDS}
          {...(attach === undefined ? {} : { attach })}
          composerUnavailable={status === "connecting" ? CONNECTING : undefined}
          onSend={send}
          onCancel={cancel}
          onAnswer={answer}
          onAnswerQuestion={answerQuestion}
          onSetConfig={setConfig}
          resolveLink={resolveLink}
        />
      </div>
    </div>
  );
}
