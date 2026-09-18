import { NODE_LABELS, SEARCHABLE_TEXT, type NodeLabel } from "../../../src/db/domain";
import { problem, publicOrigin } from "./graph-handler";
import type { TenantScope } from "./runtime";

const COLLECTION_JSON = "application/vnd.collection+json";

// A collection is named for its node type, kebab-cased. These say it better.
const SLUG_OVERRIDES: { readonly [L in NodeLabel]?: string } = {
  LineOfEnquiry: "enquiry",
  CriterionEvaluation: "evaluation",
};

function slugFor(label: NodeLabel): string {
  return SLUG_OVERRIDES[label] ?? label.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

const LABEL_BY_SLUG = new Map<string, NodeLabel>(NODE_LABELS.map((label) => [slugFor(label), label]));

// Not a node type: workspaces are the tenants, and only the default workspace can see them all.
const WORKSPACE_SLUG = "workspace";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function pageParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

function collectionJson(collection: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ collection: { version: "1.0", ...collection } }), {
    status: 200,
    headers: { "content-type": COLLECTION_JSON },
  });
}

// `/collections` lists one collection per node type, and the workspaces from the default one.
function index(base: string, scope: TenantScope): Response {
  const entries = [
    ...NODE_LABELS.map((label) => ({ slug: slugFor(label), type: label as string })),
    ...(scope.isDefault ? [{ slug: WORKSPACE_SLUG, type: "Workspace" }] : []),
  ];
  return collectionJson({
    href: `${base}/collections`,
    items: entries.map((entry) => ({
      href: `${base}/collections/${entry.slug}`,
      data: [
        { name: "slug", value: entry.slug },
        { name: "type", value: entry.type },
      ],
    })),
  });
}

function pagingLinks(
  base: string,
  self: string,
  limit: number,
  offset: number,
  hasMore: boolean,
): { rel: string; href: string }[] {
  const pageHref = (o: number) => `${self}?limit=${limit}&offset=${o}`;
  const links = [{ rel: "index", href: `${base}/collections` }];
  if (offset > 0) links.push({ rel: "prev", href: pageHref(Math.max(offset - limit, 0)) });
  if (hasMore) links.push({ rel: "next", href: pageHref(offset + limit) });
  return links;
}

const HANDLE = /^[A-Za-z0-9]+_[A-Za-z0-9]+$/;
const INTERNAL_PROPS = new Set(["natural_id", "retracted"]);

type Data = { name: string; value: unknown };
type Link = { rel: string; href: string; name: string };

// Outbound relations of the given nodes, by source handle. Handles come from the graph, and are
// checked before they go into the query text.
async function outboundLinks(
  scope: TenantScope,
  label: NodeLabel,
  ids: string[],
  base: string,
): Promise<Map<string, Link[]>> {
  const links = new Map<string, Link[]>();
  const safe = ids.filter((id) => HANDLE.test(id));
  if (safe.length === 0) return links;
  const list = safe.map((id) => `'${id}'`).join(", ");
  const result = await scope.query<{ src: string; rel: string; dst: string }>(
    `SELECT r.src::text AS src, r.rel::text AS rel, r.dst::text AS dst
     FROM ag_catalog.cypher(
       '${scope.graphName}'::name,
       $$MATCH (n:${label})-[e]->(m)
         WHERE n.retracted IS NULL AND m.retracted IS NULL AND n.natural_id IN [${list}]
         RETURN n.natural_id, type(e), m.natural_id$$
     ) AS r(src ag_catalog.agtype, rel ag_catalog.agtype, dst ag_catalog.agtype)`,
  );
  for (const row of result.rows) {
    const bucket = links.get(row.src) ?? [];
    bucket.push({ rel: row.rel.toLowerCase(), href: `${base}/graph/${row.dst}`, name: row.dst });
    links.set(row.src, bucket);
  }
  return links;
}

// `/collections/:slug` lists the live nodes of one type: id, type, what each links to, and, where
// the type has one, its main text as `name`. A type with no text of its own is described by its
// other properties instead.
async function listing(req: Request, scope: TenantScope, label: NodeLabel): Promise<Response> {
  const url = new URL(req.url);
  const base = publicOrigin(req).origin + scope.prefix;
  const limit = pageParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = pageParam(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const nameProp = SEARCHABLE_TEXT[label]?.[0];

  // Label and property come from the domain constants above, never from the request.
  const result = await scope.query<{ id: string; value: string | null }>(
    `SELECT id, value FROM (
       SELECT r.id::text AS id, r.value::text AS value
       FROM ag_catalog.cypher(
         '${scope.graphName}'::name,
         $$MATCH (n:${label})
           WHERE n.retracted IS NULL
           RETURN n.natural_id, ${nameProp === undefined ? "properties(n)" : `n.${nameProp}`}$$
       ) AS r(id ag_catalog.agtype, value ag_catalog.agtype)
     ) t
     ORDER BY length(id), id
     LIMIT $1 OFFSET $2`,
    [limit + 1, offset],
  );
  const rows = result.rows;
  const page = rows.slice(0, limit);
  const links = await outboundLinks(scope, label, page.map((row) => row.id), base);

  const self = `${base}/collections/${slugFor(label)}`;

  return collectionJson({
    href: `${self}?limit=${limit}&offset=${offset}`,
    links: pagingLinks(base, self, limit, offset, rows.length > limit),
    items: page.map((row) => {
      const data: Data[] = [
        { name: "id", value: row.id },
        { name: "type", value: label },
      ];
      if (nameProp !== undefined) {
        data.push({ name: "name", value: row.value });
      } else {
        const props = JSON.parse(row.value ?? "{}") as Record<string, unknown>;
        for (const [name, value] of Object.entries(props)) {
          if (!INTERNAL_PROPS.has(name) && (value === null || typeof value !== "object")) {
            data.push({ name, value });
          }
        }
      }
      return { href: `${base}/graph/${row.id}`, data, links: links.get(row.id) ?? [] };
    }),
  });
}

// `/collections/workspace`: each workspace, and where its graph and collections live.
async function workspaceListing(req: Request, scope: TenantScope): Promise<Response> {
  const url = new URL(req.url);
  const origin = publicOrigin(req).origin;
  const limit = pageParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = pageParam(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const rows = (await scope.workspaces()).slice(offset, offset + limit + 1);

  const self = `${origin}/collections/${WORKSPACE_SLUG}`;
  return collectionJson({
    href: `${self}?limit=${limit}&offset=${offset}`,
    links: pagingLinks(origin, self, limit, offset, rows.length > limit),
    items: rows.slice(0, limit).map((workspace) => {
      const root = `${origin}/workspace/${encodeURIComponent(workspace.slug)}`;
      return {
        href: `${root}/collections`,
        data: [
          { name: "slug", value: workspace.slug },
          { name: "name", value: workspace.displayName },
        ],
        links: [
          { rel: "graph", href: `${root}/graph` },
          { rel: "collections", href: `${root}/collections` },
        ],
      };
    }),
  });
}

// `path` is the request path with any workspace prefix already taken off.
export async function collectionsHandler(
  req: Request,
  scope: TenantScope,
  path: string,
): Promise<Response> {
  const slug = path.replace(/^\/collections\/?/, "").replace(/\/$/, "");
  if (slug === "") return index(publicOrigin(req).origin + scope.prefix, scope);
  if (slug === WORKSPACE_SLUG && scope.isDefault) return workspaceListing(req, scope);

  const label = LABEL_BY_SLUG.get(slug);
  if (label === undefined) return problem(404, "Not Found", `${slug} is not a collection`);
  return listing(req, scope, label);
}
