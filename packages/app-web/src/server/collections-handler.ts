import { NODE_LABELS, type NodeLabel } from "@labkit/core-db/domain";
import { ACT_SLUG, ACT_TYPE, collectionPath, LABEL_BY_SLUG, slugFor } from "./collection-paths";
import {
  isRaisedException,
  MAX_DEPTH,
  populateLinks,
  problem,
  publicOrigin,
} from "./graph-handler";
import type { TenantScope } from "./runtime";

const HAL_JSON = "application/hal+json";

// Not a node type: workspaces are the tenants, and only the default workspace can see them all.
const WORKSPACE_SLUG = "workspace";

// Inside a workspace a collection and a node sit at the same path level. A handle such as `Q_1`
// is upper case, and a slug is lower case, so a name is never both.
export function isCollectionSlug(name: string): boolean {
  return LABEL_BY_SLUG.has(name);
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

// A collection's items are listed without their neighbours unless the client asks for more.
const DEFAULT_DEPTH = 0;

export function pageParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

// A parameter this handler does not page by is the client's preference, such as `depth`, and every
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

export function halJson(
  req: Request,
  body: Record<string, unknown>,
  handled?: ReadonlySet<string>,
): Response {
  const extras = extrasOf(req, handled);
  return new Response(JSON.stringify(extras.length === 0 ? body : withExtras(body, extras)), {
    status: 200,
    headers: { "content-type": HAL_JSON },
  });
}

/** `[{ rel, href }]` as a `_links` object. */
export function linksOf(links: { rel: string; href: string }[]): Record<string, { href: string }> {
  return Object.fromEntries(links.map(({ rel, href }) => [rel, { href }]));
}

// The index lists one collection per node type, and the workspaces from the default workspace.
function index(req: Request, root: string, withWorkspaces: boolean): Response {
  const entries = [
    ...NODE_LABELS.map((label) => ({ slug: slugFor(label), type: label as string })),
    ...(withWorkspaces
      ? [{ slug: WORKSPACE_SLUG, type: "Workspace" }]
      : [{ slug: ACT_SLUG, type: ACT_TYPE }]),
  ];
  return halJson(req, {
    _links: { self: { href: root } },
    _embedded: {
      collection: entries.map((entry) => ({
        slug: entry.slug,
        type: entry.type,
        _links: { self: { href: `${root}/${entry.slug}` } },
      })),
    },
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

interface CollectionHal {
  _links: Record<string, { href: string }>;
  offset: number;
  limit: number;
  count: number;
  _embedded: Record<string, unknown[]>;
}

// A collection lists the live nodes of one type, each as the resource `labkit_get_entity_as_hal`
// gives, to the depth the client asked for. The database answers with relative links; here they
// become absolute, the label becomes its slug, and the client's other parameters ride on each.
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
  const depthParam = url.searchParams.get("depth");
  const depth = depthParam === null ? DEFAULT_DEPTH : Number(depthParam);
  if (!Number.isInteger(depth) || depth < 0 || depth > MAX_DEPTH) {
    return problem(400, "Bad Request", `depth must be an integer from 0 to ${MAX_DEPTH}`);
  }

  let hal: CollectionHal;
  try {
    const result = await scope.query<{ hal: CollectionHal }>(
      "SELECT public.labkit_get_collection_as_hal($1, $2, $3, $4, $5) AS hal",
      [scope.tenantId, label, offset, limit, depth],
    );
    hal = result.rows[0]!.hal;
  } catch (err) {
    if (isRaisedException(err)) return problem(404, "Not Found", err.message);
    throw err;
  }

  const slug = slugFor(label);
  const path = `${origin}${collectionPath(scope.prefix, slug)}`;
  const paging = Object.fromEntries(
    Object.entries(hal._links).map(([rel, link]) => [
      rel,
      { href: `${path}${new URL(link.href, origin).search}` },
    ]),
  );
  const items = hal._embedded[label] ?? [];
  populateLinks(items, { origin, prefix: scope.prefix });

  return halJson(req, {
    _links: { ...paging, index: { href: root } },
    offset: hal.offset,
    limit: hal.limit,
    count: hal.count,
    _embedded: { [slug]: items },
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
  const page = rows.slice(0, limit);

  const self = `${root}/${WORKSPACE_SLUG}`;
  return halJson(req, {
    _links: {
      self: { href: `${self}?limit=${limit}&offset=${offset}` },
      ...linksOf(pagingLinks(root, self, limit, offset, rows.length > limit)),
    },
    offset,
    limit,
    count: page.length,
    _embedded: {
      [WORKSPACE_SLUG]: page.map((workspace) => ({
        slug: workspace.slug,
        name: workspace.displayName,
        _links: { self: { href: `${origin}/workspace/${encodeURIComponent(workspace.slug)}` } },
      })),
    },
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
