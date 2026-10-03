import type { SessionInfo } from "@agentclientprotocol/sdk";
import { listSessions } from "@labkit/acp-client";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AGENT_CWD, AGENT_URL } from "./agent-endpoint";
import { Bar } from "./Bar";

type Listed =
  | { kind: "loading" }
  | { kind: "not_listed" }
  | { kind: "failed"; message: string }
  | { kind: "listed"; sessions: readonly SessionInfo[] };

/** Newest first; a session the agent gave no time for goes last. */
const newestFirst = (a: SessionInfo, b: SessionInfo): number =>
  (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");

const when = (updatedAt: string | null | undefined): string =>
  updatedAt ? new Date(updatedAt).toLocaleString() : "";

/**
 * The sessions the agent keeps for this checkout's agent workspace, to open again where they left
 * off or to replay from the start.
 */
export default function SessionList() {
  const [listed, setListed] = useState<Listed>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    // Deferred a tick, as the agent page does: React's development double-invoke cancels the
    // first run before it connects, so one connection opens, not two racing for one stream.
    const timer = setTimeout(() => {
      listSessions({ url: AGENT_URL, ...(AGENT_CWD === undefined ? {} : { cwd: AGENT_CWD }) }).then(
        (sessions) => {
          if (cancelled) return;
          setListed(
            sessions === undefined
              ? { kind: "not_listed" }
              : { kind: "listed", sessions: [...sessions].sort(newestFirst) },
          );
        },
        (err: unknown) => {
          if (cancelled) return;
          setListed({ kind: "failed", message: err instanceof Error ? err.message : String(err) });
        },
      );
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <Bar>
        <code className="crumb">sessions</code>
      </Bar>
      <div className="page">
        {listed.kind === "loading" ? null : listed.kind === "not_listed" ? (
          <p>This agent does not list its sessions.</p>
        ) : listed.kind === "failed" ? (
          <p role="alert">The sessions could not be listed: {listed.message}</p>
        ) : listed.sessions.length === 0 ? (
          <p>The agent has no sessions{AGENT_CWD === undefined ? "" : ` in ${AGENT_CWD}`}.</p>
        ) : (
          <table className="sessions">
            <thead>
              <tr>
                <th>Session</th>
                <th>Last active</th>
                <th>Id</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {listed.sessions.map((session) => (
                <tr key={session.sessionId}>
                  <td>{session.title || <span className="dim">Untitled</span>}</td>
                  <td className="dim">{when(session.updatedAt)}</td>
                  <td>
                    <code>{session.sessionId}</code>
                  </td>
                  <td className="actions">
                    <Link to="/agent/{-$sessionId}" params={{ sessionId: session.sessionId }}>
                      open
                    </Link>{" "}
                    <Link
                      to="/gallery/sessions/$sessionId"
                      params={{ sessionId: session.sessionId }}
                    >
                      replay
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
