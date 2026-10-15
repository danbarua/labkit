import { Link } from "@tanstack/react-router";
import { AGENT_CWD, AGENT_URL } from "./agent-endpoint";
import { sessionsNote, useAgentSessions } from "./agent/sessions";
import { Frame } from "./chrome/Frame";

const when = (updatedAt: string | null | undefined): string =>
  updatedAt ? new Date(updatedAt).toLocaleString() : "";

/**
 * The sessions the agent keeps for this checkout's agent workspace, to open again where they left
 * off or to replay from the start.
 */
export default function SessionList() {
  const listed = useAgentSessions({ url: AGENT_URL, cwd: AGENT_CWD });
  const note = sessionsNote(listed, AGENT_CWD);
  const sessions = listed.kind === "loaded" ? (listed.value ?? []) : [];

  return (
    <Frame bar={<code className="crumb">sessions</code>}>
      <div className="page">
        {note !== undefined ? (
          <p {...(listed.kind === "failed" ? { role: "alert" } : {})}>{note}</p>
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
              {sessions.map((session) => (
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
    </Frame>
  );
}
