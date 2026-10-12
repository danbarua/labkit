import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { AgentChat } from "./agent/AgentChat";
import { AGENT_CWD } from "./agent-endpoint";
import { Frame } from "./chrome/Frame";

/**
 * The agent on a page of its own: `/agent` starts a session and `/agent/{sessionId}` reopens one
 * the agent still has. A session started here takes its own address, so reloading the page
 * reopens it. Its sessions open in the folder `VITE_LABKIT_ACP_CWD` names, not a workspace's.
 * Nothing links here; the Trace Console has the agent in its right-hand sidebar.
 */
export default function AgentSession({ sessionId }: { sessionId?: string }) {
  const navigate = useNavigate();
  const onStarted = useCallback(
    (started: string) =>
      void navigate({ to: "/agent/{-$sessionId}", params: { sessionId: started }, replace: true }),
    [navigate],
  );
  return (
    <Frame>
      <AgentChat cwd={AGENT_CWD} sessionId={sessionId} onStarted={onStarted} />
    </Frame>
  );
}
