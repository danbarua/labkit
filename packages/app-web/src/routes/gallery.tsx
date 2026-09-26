import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The scenario corpus is a development fixture, so its gallery is dev-only: in a production build
// `import.meta.env.DEV` is false, the import is dropped, and the route is a 404.
const Gallery = import.meta.env.DEV ? lazy(() => import("../ui/Gallery")) : undefined;

export const Route = createFileRoute("/gallery")({
  component: () => {
    if (Gallery === undefined) throw notFound();
    return (
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
    );
  },
});
