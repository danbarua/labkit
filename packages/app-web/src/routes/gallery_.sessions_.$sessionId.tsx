import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// Dev-only like the gallery. The trailing underscore on `sessions_` keeps this page out of the
// list's layout: a sibling URL, not a child view.
const SessionReplay = import.meta.env.DEV ? lazy(() => import("../ui/SessionReplay")) : undefined;

export const Route = createFileRoute("/gallery_/sessions_/$sessionId")({
  component: function GallerySessionReplay() {
    const { sessionId } = Route.useParams();
    if (SessionReplay === undefined) throw notFound();
    return (
      <Suspense fallback={null}>
        <SessionReplay sessionId={sessionId} />
      </Suspense>
    );
  },
});
