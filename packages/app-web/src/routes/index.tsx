import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar } from "../ui/Bar";
import { fetchCollection, itemsOf } from "../ui/collection-api";

export const Route = createFileRoute("/")({
  loader: ({ abortController }) =>
    fetchCollection("/collections/workspace", {}, abortController.signal),
  component: Workspaces,
});

function Workspaces() {
  const workspaces = Route.useLoaderData();
  return (
    <>
      <Bar />
      <div className="page">
        <h2>Workspaces</h2>
        <ul className="cards">
          {itemsOf(workspaces).map((item) => {
            const { slug, name } = item as { slug: string; name: string };
            return (
              <li key={slug}>
                <Link to="/workspace/$slug" params={{ slug }}>
                  {name}
                </Link>
                <span className="dim">{slug}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
