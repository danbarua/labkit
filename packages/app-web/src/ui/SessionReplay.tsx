import { sessionHistory } from "@labkit/acp-client";
import { useLoaded } from "./loaded";
import type { Recording } from "./playback";
import { AGENT_CWD, AGENT_URL } from "./agent-endpoint";
import { Page, Replay } from "./Replay";

/**
 * A session the agent keeps, replayed from the start: what reopening it shows, an event at a
 * time, at a steady pace (the agent keeps no arrival times). Nothing is sent to it.
 */
export default function SessionReplay({ sessionId }: { sessionId: string }) {
  const loaded = useLoaded(
    () =>
      sessionHistory({
        url: AGENT_URL,
        sessionId,
        ...(AGENT_CWD === undefined ? {} : { cwd: AGENT_CWD }),
      }).then((events): Recording => ({ events })),
    sessionId,
    // Reopening a session opens an ACP connection: see `useLoaded` for why it waits a tick.
    { deferred: true },
  );
  if (loaded.kind === "loaded")
    return <Replay key={sessionId} crumb={sessionId} recording={loaded.value} />;
  return (
    <Page crumb={sessionId} controls={null}>
      <div className="page">
        {loaded.kind === "loading" ? (
          <p className="dim">Reopening the session…</p>
        ) : (
          <p role="alert">The session could not be reopened: {loaded.message}</p>
        )}
      </div>
    </Page>
  );
}
