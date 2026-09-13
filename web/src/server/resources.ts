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
  type HalDir,
  type HalLink,
  type HalLinks,
  type HalResource,
  type ResourceDocument,
  type RootDocument,
} from "../hypermedia";

type NodeProps = { natural_id: string } & Record<string, unknown>;

const COLLECTION_LINKS = Object.fromEntries(
  (Object.keys(LABEL_BY_COLLECTION) as CollectionSlug[]).map((slug) => [
    slug,
    { href: `/${slug}` },
  ]),
) as { readonly [S in CollectionSlug]: HalLink };

export async function loadRoot(graph: TenantGraph): Promise<RootDocument | null> {
  const rows = await graph.query(
    `MATCH (n:Question {natural_id: $id}) RETURN n`,
    { n: vertexProps<NodeProps>() },
    { id: WALK_START_ID },
  );
  if (rows.length === 0) return null;
  return {
    id: "labkit",
    _links: {
      self: { href: "/" },
      start: { href: WALK_START_HREF, name: WALK_START_ID },
      ...COLLECTION_LINKS,
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
  const items: HalResource[] = rows.map((row) => {
    const id = row.n.natural_id;
    const href = hrefFor(id, label);
    return {
      id,
      type: label,
      _links: { self: { href, name: id } },
    };
  });
  return {
    type: label,
    _links: {
      self: { href: `/${slug}` },
      item: items.map((item) => item._links.self),
    },
    _embedded: items.length > 0 ? { item: items } : undefined,
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

  const _links: HalLinks = {
    self: { href: hrefFor(node.n.natural_id, label), name: node.n.natural_id },
  };
  const _embedded: NonNullable<HalResource["_embedded"]> = {};
  addNeighbors(_links, _embedded, outbound, "out");
  addNeighbors(_links, _embedded, inbound, "in");

  return {
    id: node.n.natural_id,
    type: label,
    properties: node.n,
    _links,
    _embedded: Object.keys(_embedded).length > 0 ? _embedded : undefined,
  };
}

function addNeighbors(
  links: HalLinks,
  embedded: NonNullable<HalResource["_embedded"]>,
  rows: ReadonlyArray<{ rel: string; m: { label: string; properties: NodeProps } }>,
  dir: HalDir,
): void {
  for (const row of rows) {
    const rel = row.rel as EdgeLabel;
    const id = row.m.properties.natural_id;
    const href = hrefFor(id, row.m.label as NodeLabel);
    const link: HalLink = { href, name: id, dir };
    const neighbor: HalResource = {
      id,
      type: row.m.label as NodeLabel,
      dir,
      _links: { self: { href, name: id } },
    };

    const existingLinks = links[rel];
    if (existingLinks == null) links[rel] = [link];
    else if (Array.isArray(existingLinks)) existingLinks.push(link);
    else links[rel] = [existingLinks, link];

    const existingEmbedded = embedded[rel];
    if (existingEmbedded == null) embedded[rel] = [neighbor];
    else if (Array.isArray(existingEmbedded)) existingEmbedded.push(neighbor);
    else embedded[rel] = [existingEmbedded, neighbor];
  }
}
