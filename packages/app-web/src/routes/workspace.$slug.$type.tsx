import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar } from "../ui/Bar";
import { dataOf, fetchCollection } from "../ui/collection-api";
import { workspacePath } from "../ui/graph-api";
import { toInt } from "../ui/search";

export const Route = createFileRoute("/workspace/$slug/$type")({
  validateSearch: (search: Record<string, unknown>): { limit?: number; offset?: number } => {
    const limit = toInt(search.limit);
    const offset = toInt(search.offset);
    return {
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
    };
  },
  loaderDeps: ({ search }) => ({ limit: search.limit, offset: search.offset }),
  loader: ({ params, deps, abortController }) =>
    fetchCollection(`${workspacePath(params.slug)}/${params.type}`, deps, abortController.signal),
  component: CollectionPage,
});

function CollectionPage() {
  const { slug, type } = Route.useParams();
  const { limit, offset } = Route.useSearch();
  const collection = Route.useLoaderData();
  const size = limit ?? collection.items.length;
  const hasNext = collection.links.some((link) => link.rel === "next");
  const hasPrev = collection.links.some((link) => link.rel === "prev");
  const start = offset ?? 0;

  return (
    <>
      <Bar workspace={slug} />
      <div className="page">
        <h2>{type}</h2>
        {collection.items.length === 0 ? (
          <p className="dim">nothing here</p>
        ) : (
          <table className="items">
            <tbody>
              {collection.items.map((item) => {
                const data = dataOf(item);
                const id = String(data.id);
                const { id: _id, type: _type, name, ...rest } = data;
                const summary = name ?? Object.values(rest).join(" · ");
                return (
                  <tr key={id}>
                    <td>
                      <Link to="/workspace/$slug/graph/$id" params={{ slug, id }}>
                        {id}
                      </Link>
                    </td>
                    <td>{String(summary)}</td>
                    <td className="dim">
                      {item.links.map((link) => `${link.rel} ${link.name ?? ""}`).join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="paging">
          {hasPrev ? (
            <Link
              to="/workspace/$slug/$type"
              params={{ slug, type }}
              search={{ limit, offset: Math.max(start - size, 0) }}
            >
              ← previous
            </Link>
          ) : null}
          {hasNext ? (
            <Link
              to="/workspace/$slug/$type"
              params={{ slug, type }}
              search={{ limit, offset: start + size }}
            >
              next →
            </Link>
          ) : null}
        </p>
      </div>
    </>
  );
}
