import { scalar, vertex, vertexProps } from "../../../src/db/cypher";
import type { TenantGraph } from "../../../src/db/graph";
import type { EdgeLabel, NodeLabel } from "../../../src/db/domain";
import {
  LABEL_BY_COLLECTION,
  WALK_START_HREF,
  WALK_START_ID,
  hrefFor,
  naturalIdFrom,
  type CollectionDocument,
  type CollectionSlug,
  type HypermediaRef,
  type ResourceDocument,
  type RootDocument,
} from "../hypermedia";

type NodeProps = { natural_id: string } & Record<string, unknown>;

const COLLECTION_HREFS = Object.fromEntries(
  (Object.keys(LABEL_BY_COLLECTION) as CollectionSlug[]).map((slug) => [slug, `/${slug}`]),
) as { readonly [S in CollectionSlug]: string };

export async function loadRoot(graph: TenantGraph): Promise<RootDocument | null> {
  const rows = await graph.query(
    `MATCH (n:Question {natural_id: $id}) RETURN n`,
    { n: vertexProps<NodeProps>() },
    { id: WALK_START_ID },
  );
  if (rows.length === 0) return null;
  return {
    id: "labkit",
    href: "/",
    links: {
      start: { href: WALK_START_HREF, id: WALK_START_ID },
      collections: COLLECTION_HREFS,
    },
  };
}

export async function loadCollection(
  graph: TenantGraph,
  slug: CollectionSlug,
): Promise<CollectionDocument> {
  const label = LABEL_BY_COLLECTION[slug];
  const rows = await graph.query(`MATCH (n:${label}) RETURN n ORDER BY n.natural_id`, {
    n: vertexProps<NodeProps>(),
  });
  return {
    type: label,
    href: `/${slug}`,
    items: rows.map((row) => ({
      id: row.n.natural_id,
      href: hrefFor(row.n.natural_id, label),
    })),
  };
}

export async function loadResource(
  graph: TenantGraph,
  slug: CollectionSlug,
  n: string,
): Promise<ResourceDocument | null> {
  const label = LABEL_BY_COLLECTION[slug];
  const id = naturalIdFrom(slug, n);
  const nodes = await graph.query(
    `MATCH (n:${label} {natural_id: $id}) RETURN n`,
    { n: vertexProps<NodeProps>() },
    { id },
  );
  const node = nodes[0];
  if (!node) return null;

  // Far end `m` is unlabelled, so the per-label RLS policy that hides retracted
  // nodes does not apply. Without the filter, links point at handles GET then 404s.
  const [outbound, inbound] = await Promise.all([
    graph.query(
      `MATCH (n:${label} {natural_id: $id})-[e]->(m)
       WHERE n.retracted IS NULL AND m.retracted IS NULL
       RETURN type(e) AS rel, m`,
      { rel: scalar<string>(), m: vertex<NodeProps>() },
      { id },
    ),
    graph.query(
      `MATCH (n:${label} {natural_id: $id})<-[e]-(m)
       WHERE n.retracted IS NULL AND m.retracted IS NULL
       RETURN type(e) AS rel, m`,
      { rel: scalar<string>(), m: vertex<NodeProps>() },
      { id },
    ),
  ]);

  return {
    id: node.n.natural_id,
    type: label,
    href: hrefFor(node.n.natural_id, label),
    properties: node.n,
    links: {
      out: groupLinks(outbound),
      in: groupLinks(inbound),
    },
  };
}

function groupLinks(
  rows: ReadonlyArray<{ rel: string; m: { label: string; properties: NodeProps } }>,
): Partial<Record<EdgeLabel, HypermediaRef[]>> {
  const grouped: Partial<Record<EdgeLabel, HypermediaRef[]>> = {};
  for (const row of rows) {
    const rel = row.rel as EdgeLabel;
    const id = row.m.properties.natural_id;
    const ref: HypermediaRef = { id, href: hrefFor(id, row.m.label as NodeLabel) };
    const existing = grouped[rel];
    if (existing) existing.push(ref);
    else grouped[rel] = [ref];
  }
  return grouped;
}
