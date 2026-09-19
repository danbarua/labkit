import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Explorer } from "../ui/Explorer";
import { fetchResource } from "../ui/graph-api";
import { toInt } from "../ui/search";

const DEFAULT_DEPTH = 1;

export const Route = createFileRoute("/workspace/$slug/graph/$id")({
  validateSearch: (search: Record<string, unknown>): { depth?: number } => {
    const depth = toInt(search.depth);
    return depth === undefined ? {} : { depth };
  },
  loaderDeps: ({ search }) => ({ depth: search.depth ?? DEFAULT_DEPTH }),
  loader: ({ params, deps, abortController }) =>
    fetchResource(params.slug, params.id, deps.depth, abortController.signal),
  component: GraphPage,
});

function GraphPage() {
  const { slug } = Route.useParams();
  const resource = Route.useLoaderData();
  const navigate = useNavigate();
  // Keyed by workspace, so what the canvas has been shown never carries over into another one.
  return (
    <Explorer
      key={slug}
      workspace={slug}
      resource={resource}
      onNavigate={(id) =>
        navigate({
          to: "/workspace/$slug/graph/$id",
          params: { slug, id },
          search: (current) => current,
        })
      }
    />
  );
}
