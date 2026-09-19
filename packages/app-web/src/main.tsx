import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

// The API owns every other path, so the browser app answers only under this one.
const router = createRouter({
  routeTree,
  basepath: "/app",
  defaultPreload: "intent",
  defaultPendingMs: 300,
  defaultErrorComponent: ({ error }) => (
    <p className="load-error page">{error instanceof Error ? error.message : String(error)}</p>
  ),
  defaultPendingComponent: () => <p className="dim page">loading…</p>,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
