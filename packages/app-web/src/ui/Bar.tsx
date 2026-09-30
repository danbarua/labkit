import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** The header every page shares: where you are, and whatever controls the page adds. */
export function Bar({ workspace, children }: { workspace?: string; children?: ReactNode }) {
  return (
    <header id="bar">
      <h1>
        <Link to="/">
          LabKit <span>Explorer</span>
        </Link>
      </h1>
      {workspace === undefined ? null : (
        <Link to="/workspace/$slug" params={{ slug: workspace }} className="crumb">
          {workspace}
        </Link>
      )}
      {/* Pages that exist only in development; a host with no address bar reaches them from here. */}
      {import.meta.env.DEV ? (
        <>
          <Link to="/gallery" className="crumb">
            gallery
          </Link>
          {/* A full page load: the agent page keeps the session it has open, and this starts one. */}
          <Link to="/agent/{-$sessionId}" reloadDocument className="crumb">
            agent
          </Link>
        </>
      ) : null}
      {children}
    </header>
  );
}
