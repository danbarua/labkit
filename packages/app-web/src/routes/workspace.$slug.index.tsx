import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { Bar } from "../ui/Bar";
import { dataOf } from "../ui/collection-api";

const workspace = getRouteApi("/workspace/$slug");

export const Route = createFileRoute("/workspace/$slug/")({
  component: Collections,
});

function Collections() {
  const { slug } = Route.useParams();
  const index = workspace.useLoaderData();
  return (
    <>
      <Bar workspace={slug} />
      <div className="page">
        <h2>{slug}</h2>
        <ul className="cards">
          {index.items.map((item) => {
            const { slug: type, type: label } = dataOf(item) as { slug: string; type: string };
            return (
              <li key={type}>
                <Link to="/workspace/$slug/$type" params={{ slug, type }}>
                  {type}
                </Link>
                <span className="dim">{label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
