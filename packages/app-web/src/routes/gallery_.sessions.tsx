import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// Dev-only like the gallery: the agent is mounted at `/acp` by the dev server alone.
const SessionList = import.meta.env.DEV ? lazy(() => import("../ui/SessionList")) : undefined;

export const Route = createFileRoute("/gallery_/sessions")({
  component: function GallerySessions() {
    if (SessionList === undefined) throw notFound();
    return (
      <Suspense fallback={null}>
        <SessionList />
      </Suspense>
    );
  },
});
