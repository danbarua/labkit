import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The fake agent only exists in the dev server, so the page that talks to it is dev-only: in a
// production build `import.meta.env.DEV` is false, the import is dropped, and the route is a 404.
const AgentSession = import.meta.env.DEV ? lazy(() => import("../ui/AgentSession")) : undefined;

export const Route = createFileRoute("/agent")({
  validateSearch: (search: Record<string, unknown>): { workspace?: string } =>
    typeof search.workspace === "string" && search.workspace !== ""
      ? { workspace: search.workspace }
      : {},
  component: () => {
    if (AgentSession === undefined) throw notFound();
    const { workspace } = Route.useSearch();
    return (
      <Suspense fallback={null}>
        <AgentSession {...(workspace === undefined ? {} : { workspace })} />
      </Suspense>
    );
  },
});
