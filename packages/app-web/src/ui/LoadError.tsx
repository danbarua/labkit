import { Link, useRouter } from "@tanstack/react-router";
import { Bar } from "./Bar";

/**
 * A page whose data could not be loaded: the header, what went wrong, and ways on from here, so a
 * host with no address bar (a VS Code tab) is never left on a page with nothing to click.
 */
export function LoadError({ error }: { error: unknown }) {
  const router = useRouter();
  return (
    <>
      <Bar />
      <div className="page">
        <p className="load-error">{error instanceof Error ? error.message : String(error)}</p>
        <p>
          <button type="button" onClick={() => void router.invalidate()}>
            Try again
          </button>{" "}
          <Link to="/">Back to the workspaces</Link>
        </p>
      </div>
    </>
  );
}
