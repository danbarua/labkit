import { createFileRoute } from "@tanstack/react-router";
import { type Tab, WorkspacePage } from "../ui/workspace/WorkspacePage";

interface Search {
  /** The API path of the collection the left column lists. */
  list?: string | undefined;
  /** The centre column's tab, when it is not the overview. */
  tab?: Exclude<Tab, "overview"> | undefined;
  /** The agent's session the chat reopens. */
  session?: string | undefined;
}

// Every path the other routes leave is an API path, opened on the workspace page:
// `/app/workspace/w/Q_1` opens `/workspace/w/Q_1`. What it is, a resource or a collection, is what
// the API answers.
export const Route = createFileRoute("/$")({
  validateSearch: (search: Record<string, unknown>): Search => {
    if (search.tab !== undefined && search.tab !== "debug")
      console.warn("workspace page: an unknown tab in the address shows the overview", {
        tab: search.tab,
      });
    // The router lays this over the address's own query, so a value that is not valid is set to
    // undefined here; leaving it out would let the address's value through.
    return {
      list: typeof search.list === "string" ? search.list : undefined,
      tab: search.tab === "debug" ? search.tab : undefined,
      session: typeof search.session === "string" ? search.session : undefined,
    };
  },
  component: Page,
});

function Page() {
  const { _splat } = Route.useParams();
  const { list, tab, session } = Route.useSearch();
  return (
    <WorkspacePage
      path={_splat ? `/${_splat}` : ""}
      list={list}
      tab={tab ?? "overview"}
      session={session}
    />
  );
}
