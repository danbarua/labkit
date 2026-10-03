import { sessionHistory } from "@labkit/acp-client";
import { useEffect, useState } from "react";
import { AGENT_CWD, AGENT_URL } from "./agent-endpoint";
import type { Recording } from "./playback";
import { Page, Replay } from "./Replay";

type Loaded = { kind: "loading" } | { kind: "failed"; message: string } | Recording;

/**
 * A session the agent keeps, replayed from the start: what reopening it shows, an event at a
 * time, at a steady pace (the agent keeps no arrival times). Nothing is sent to it.
 */
export default function SessionReplay({ sessionId }: { sessionId: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setLoaded({ kind: "loading" });
    // Deferred a tick, as the agent page does: React's development double-invoke cancels the
    // first run before it connects, so one connection opens, not two racing for one stream.
    const timer = setTimeout(() => {
      sessionHistory({
        url: AGENT_URL,
        sessionId,
        ...(AGENT_CWD === undefined ? {} : { cwd: AGENT_CWD }),
      }).then(
        (events) => {
          if (!cancelled) setLoaded({ events });
        },
        (err: unknown) => {
          if (cancelled) return;
          setLoaded({ kind: "failed", message: err instanceof Error ? err.message : String(err) });
        },
      );
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId]);

  if (!("kind" in loaded)) return <Replay key={sessionId} crumb={sessionId} recording={loaded} />;
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
