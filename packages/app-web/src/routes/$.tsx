import { createFileRoute } from "@tanstack/react-router";
import { type Tab, TraceConsole } from "../ui/trace/TraceConsole";

interface Search {
  /** The API path of the collection the left column lists. */
  list?: string | undefined;
  /** The centre column's tab, when it is not the overview. */
  tab?: Exclude<Tab, "overview"> | undefined;
}

// Every path the other routes leave is an API path, opened in the Trace Console: `/app/workspace/w/Q_1`
// opens `/workspace/w/Q_1`. What it is, a resource or a collection, is what the API answers.
export const Route = createFileRoute("/$")({
  validateSearch: (search: Record<string, unknown>): Search => {
    if (search.tab !== undefined && search.tab !== "graph" && search.tab !== "debug")
      console.warn("trace console: an unknown tab in the address shows the overview", {
        tab: search.tab,
      });
    // The router lays this over the address's own query, so a value that is not valid is set to
    // undefined here; leaving it out would let the address's value through.
    return {
      list: typeof search.list === "string" ? search.list : undefined,
      tab: search.tab === "graph" || search.tab === "debug" ? search.tab : undefined,
    };
  },
  component: Page,
});

function Page() {
  const { _splat } = Route.useParams();
  const { list, tab } = Route.useSearch();
  return <TraceConsole path={_splat ? `/${_splat}` : ""} list={list} tab={tab ?? "overview"} />;
}
