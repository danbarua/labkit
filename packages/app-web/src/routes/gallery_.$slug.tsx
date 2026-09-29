import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// Dev-only like the gallery: the transcripts are served by a dev-server plugin, so in a production
// build `import.meta.env.DEV` is false, the import is dropped, and the route is a 404. The trailing
// underscore keeps this page out of the gallery's layout: it is a sibling URL, not a child view.
const TranscriptMockup = import.meta.env.DEV
  ? lazy(() => import("../ui/TranscriptMockup"))
  : undefined;

export const Route = createFileRoute("/gallery_/$slug")({
  component: function GalleryTranscript() {
    const { slug } = Route.useParams();
    if (TranscriptMockup === undefined) throw notFound();
    return (
      <Suspense fallback={null}>
        <TranscriptMockup slug={slug} />
      </Suspense>
    );
  },
});
