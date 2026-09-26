import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The fake agent only exists in the dev server, so the page that talks to it is dev-only: in a
// production build `import.meta.env.DEV` is false, the import is dropped, and the route is a 404.
const AgentSession = import.meta.env.DEV ? lazy(() => import("../ui/AgentSession")) : undefined;

export const Route = createFileRoute("/agent")({
  component: () => {
    if (AgentSession === undefined) throw notFound();
    return (
      <Suspense fallback={null}>
        <AgentSession />
      </Suspense>
    );
  },
});
