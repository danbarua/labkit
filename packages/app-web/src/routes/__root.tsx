import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Bar } from "../ui/Bar";

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <>
      <Bar />
      <div className="page">
        <h2>Not found</h2>
        <p>
          <Link to="/">Back to the workspaces</Link>
        </p>
      </div>
    </>
  ),
});
