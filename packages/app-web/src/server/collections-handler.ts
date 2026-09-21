import { NODE_LABELS, SEARCHABLE_TEXT, type NodeLabel } from "@labkit/core-db/domain";
import { ACT_SLUG, ACT_TYPE, LABEL_BY_SLUG, slugFor } from "./collection-paths";
import { nodePath, problem, publicOrigin } from "./graph-handler";
import type { TenantScope } from "./runtime";

const COLLECTION_JSON = "application/vnd.collection+json";

// Not a node type: workspaces are the tenants, and only the default workspace can see them all.
const WORKSPACE_SLUG = "workspace";

// Inside a workspace a collection and a node sit at the same path level. A handle such as `Q_1`
// is upper case, and a slug is lower case, so a name is never both.
export function isCollectionSlug(name: string): boolean {
  return LABEL_BY_SLUG.has(name);
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export function pageParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

// A parameter this handler does not read is the client's preference, such as `depth`, and every
// link in the response carries it on unchanged.
const PAGING = new Set(["limit", "offset"]);

function carry(href: string, extras: [string, string][]): string {
  const url = new URL(href);
  for (const name of new Set(extras.map(([n]) => n))) url.searchParams.delete(name);
  for (const [name, value] of extras) url.searchParams.append(name, value);
  return url.toString();
}

// `handled` names the parameters the caller reads itself, which are not carried on.
export function extrasOf(req: Request, handled: ReadonlySet<string> = PAGING): [string, string][] {
  return [...new URL(req.url).searchParams].filter(([name]) => !handled.has(name));
}

export function withExtras(value: unknown, extras: [string, string][]): unknown {
  if (Array.isArray(value)) return value.map((one) => withExtras(one, extras));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      key === "href" && typeof inner === "string"
        ? carry(inner, extras)
        : withExtras(inner, extras),
    ]),
  );
}

export function collectionJson(
  req: Request,
  collection: Record<string, unknown>,
  handled?: ReadonlySet<string>,
): Response {
  const extras = extrasOf(req, handled);
  const body = { collection: { version: "1.0", ...collection } };
  return new Response(JSON.stringify(extras.length === 0 ? body : withExtras(body, extras)), {
    status: 200,
    headers: { "content-type": COLLECTION_JSON },
  });
}

// The index lists one collection per node type, and the workspaces from the default workspace.
function index(req: Request, root: string, withWorkspaces: boolean): Response {
  const entries = [
    ...NODE_LABELS.map((label) => ({ slug: slugFor(label), type: label as string })),
    ...(withWorkspaces
      ? [{ slug: WORKSPACE_SLUG, type: "Workspace" }]
      : [{ slug: ACT_SLUG, type: ACT_TYPE }]),
  ];
  return collectionJson(req, {
    href: root,
    items: entries.map((entry) => ({
      href: `${root}/${entry.slug}`,
      data: [
        { name: "slug", value: entry.slug },
        { name: "type", value: entry.type },
      ],
    })),
  });
}

export function pagingLinks(
  root: string,
  self: string,
  limit: number,
  offset: number,
  hasMore: boolean,
  fixed = "",
): { rel: string; href: string }[] {
  // `fixed` is a query fragment that holds across pages, such as `&since=40`.
  const pageHref = (o: number) => `${self}?limit=${limit}&offset=${o}${fixed}`;
  const links = [{ rel: "index", href: root }];
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
  origin: string,
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
    const href = `${origin}${nodePath(scope.prefix, row.dst)}`;
    bucket.push({ rel: row.rel.toLowerCase(), href, name: row.dst });
    links.set(row.src, bucket);
  }
  return links;
}

// A collection lists the live nodes of one type: id, type, what each links to, and, where
// the type has one, its main text as `name`. A type with no text of its own is described by its
// other properties instead.
async function listing(
  req: Request,
  scope: TenantScope,
  root: string,
  label: NodeLabel,
): Promise<Response> {
  const url = new URL(req.url);
  const origin = publicOrigin(req).origin;
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
  const links = await outboundLinks(
    scope,
    label,
    page.map((row) => row.id),
    origin,
  );

  const self = `${root}/${slugFor(label)}`;

  return collectionJson(req, {
    href: `${self}?limit=${limit}&offset=${offset}`,
    links: pagingLinks(root, self, limit, offset, rows.length > limit),
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
      return {
        href: `${origin}${nodePath(scope.prefix, row.id)}`,
        data,
        links: links.get(row.id) ?? [],
      };
    }),
  });
}

// `/collections/workspace`: each workspace. A workspace is a collection, and its address is its
// index.
async function workspaceListing(req: Request, scope: TenantScope, root: string): Promise<Response> {
  const url = new URL(req.url);
  const origin = publicOrigin(req).origin;
  const limit = pageParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = pageParam(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const rows = (await scope.workspaces()).slice(offset, offset + limit + 1);

  const self = `${root}/${WORKSPACE_SLUG}`;
  return collectionJson(req, {
    href: `${self}?limit=${limit}&offset=${offset}`,
    links: pagingLinks(root, self, limit, offset, rows.length > limit),
    items: rows.slice(0, limit).map((workspace) => {
      return {
        href: `${origin}/workspace/${encodeURIComponent(workspace.slug)}`,
        data: [
          { name: "slug", value: workspace.slug },
          { name: "name", value: workspace.displayName },
        ],
      };
    }),
  });
}

// The collection called `name`, or the index when it is empty. `root` is where this workspace's
// collections are addressed from; only the root handler offers the workspaces.
function serve(
  req: Request,
  scope: TenantScope,
  root: string,
  name: string,
  withWorkspaces: boolean,
): Promise<Response> | Response {
  if (name === "") return index(req, root, withWorkspaces);
  if (name === WORKSPACE_SLUG && withWorkspaces) return workspaceListing(req, scope, root);

  const label = LABEL_BY_SLUG.get(name);
  if (label === undefined) return problem(404, "Not Found", `${name} is not a collection`);
  return listing(req, scope, root, label);
}

// `/collections` and `/collections/{type}`: the default workspace, and the list of workspaces.
export async function rootCollectionsHandler(
  req: Request,
  scope: TenantScope,
  path: string,
): Promise<Response> {
  const name = path.replace(/^\/collections\/?/, "").replace(/\/$/, "");
  return serve(req, scope, `${publicOrigin(req).origin}/collections`, name, true);
}

// `/workspace/{slug}` and `/workspace/{slug}/{type}`. `rest` is what follows the slug.
export async function workspaceCollectionsHandler(
  req: Request,
  scope: TenantScope,
  rest: string,
): Promise<Response> {
  const name = rest.replace(/^\//, "").replace(/\/$/, "");
  return serve(req, scope, `${publicOrigin(req).origin}${scope.prefix}`, name, false);
}
