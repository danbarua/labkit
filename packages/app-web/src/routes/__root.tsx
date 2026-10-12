import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Frame } from "../ui/chrome/Frame";

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <Frame>
      <div className="page">
        <h2>Not found</h2>
        <p>
          <Link to="/$" params={{ _splat: "" }}>
            Back to the workspaces
          </Link>
        </p>
      </div>
    </Frame>
  ),
});
