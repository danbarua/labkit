import { Link, useRouter } from "@tanstack/react-router";
import { Frame } from "./chrome/Frame";
import { messageOf } from "../message-of";

/**
 * A page whose data could not be loaded: the header, what went wrong, and ways on from here, so a
 * host with no address bar (a VS Code tab) is never left on a page with nothing to click.
 */
export function LoadError({ error }: { error: unknown }) {
  const router = useRouter();
  return (
    <Frame>
      <div className="page">
        <p className="load-error">{messageOf(error)}</p>
        <p>
          <button type="button" onClick={() => void router.invalidate()}>
            Try again
          </button>{" "}
          <Link to="/$" params={{ _splat: "" }}>
            Back to the workspaces
          </Link>
        </p>
      </div>
    </Frame>
  );
}
