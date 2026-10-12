import { SCENARIOS } from "@labkit/acp-scenarios";
import { Conversation } from "@labkit/ui";
import "@labkit/ui/ui.css";
import { AGENT_CWD, AGENT_URL } from "../agent-endpoint";
import { RECORD_TYPES } from "../record-types";
import { useSavedTheme } from "../saved-theme";
import { HOST_COMMANDS, resolveLink, UNAVAILABLE, useAgentSession } from "./agent-session";

/**
 * A live session with the agent the dev server mounts at `/acp`: the fake agent by default, or a
 * real one when `LABKIT_ACP_AGENT_URL` names it. A real agent needs an absolute, writable `cwd`
 * for its session store; `VITE_LABKIT_ACP_CWD` (set by `dev-with-agent.ts`) supplies one, and the
 * fake agent ignores it. ACP has no default `cwd`. The session stays connected while `shown` is
 * false; only its view is not drawn.
 */
export function AgentChat({
  sessionId,
  onStarted,
  shown = true,
  themeButton = false,
}: {
  /** The session to reopen; a new one is started when this names none. */
  sessionId: string | undefined;
  /** Called with the id of each session this starts, so the page can put it in its address. */
  onStarted: (sessionId: string) => void;
  shown?: boolean;
  /** Whether the conversation draws its own theme button, for a page with no top bar. */
  themeButton?: boolean;
}) {
  const real = AGENT_CWD !== undefined;
  const { state, status, attach, send, cancel, answer, answerQuestion, setConfig } =
    useAgentSession({ url: AGENT_URL, cwd: AGENT_CWD, sessionId, onStarted });
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
          composerUnavailable={status === "ready" ? undefined : UNAVAILABLE[status]}
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
