import { createFileRoute, Outlet } from "@tanstack/react-router";
import { fetchCollection } from "../ui/collection-api";
import { workspacePath } from "../ui/graph-api";

// The workspace's collections, fetched once for every page inside it. A slug the API does not
// know fails here, so no page below has to handle a workspace that is not there.
export const Route = createFileRoute("/workspace/$slug")({
  loader: ({ params, abortController }) =>
    fetchCollection(workspacePath(params.slug), {}, abortController.signal),
  component: Outlet,
});
