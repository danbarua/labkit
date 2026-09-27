import type { NodeLabel } from "@labkit/core-db/domain";
import { collectionPath, EVENTS_SEGMENT, slugFor } from "./collection-paths";
import type { TenantScope } from "./runtime";
// Bare links return one hop of neighbours. MAX_DEPTH mirrors the limit in labkit_get_entity_as_hal.
const DEFAULT_DEPTH = 1;
export const MAX_DEPTH = 6;

// Where a node lives: directly under its workspace's path.
export function nodePath(prefix: string, id: string): string {
  return `${prefix}/${id}`;
}

// The address the graph query gives a node, before it is made absolute.
const QUERY_HREF = /^\/graph\/([^/]+)$/;

export function problem(status: number, title: string, detail?: string): Response {
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title,
      status,
      ...(detail === undefined ? {} : { detail }),
    }),
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

// `RAISE EXCEPTION` in the database. Both drivers put the SQLSTATE in `code`, and only that is read,
// because they do not share an error class.
export function isRaisedException(err: unknown): err is Error {
  return err instanceof Error && (err as { code?: unknown }).code === "P0001";
}

export async function graphHandler(
  req: Request,
  scope: TenantScope,
  id: string,
): Promise<Response> {
  if (!URL.canParse(req.url)) {
    throw Error("Invalid URL");
  }

  const url = new URL(req.url);
  const depthParam = url.searchParams.get("depth");
  const depth = depthParam === null ? DEFAULT_DEPTH : Number(depthParam);
  if (!Number.isInteger(depth) || depth < 0 || depth > MAX_DEPTH) {
    return problem(400, "Bad Request", `depth must be an integer from 0 to ${MAX_DEPTH}`);
  }

  try {
    const queryResult = await scope.query(
      "SELECT public.labkit_get_entity_as_hal($1, $2, $3) AS resource",
      [scope.graphName, id, depth],
    );

    if (!queryResult?.rows.length) {
      return problem(404, "Not Found");
    }

    const resource = queryResult.rows[0]?.resource as Record<string, unknown>;
    // Links carry the depth that was applied, so following one repeats this view.
    const search = new URLSearchParams(url.search);
    search.set("depth", String(depth));
    populateLinks(resource, {
      origin: publicOrigin(req).origin,
      search: `?${search}`,
      prefix: scope.prefix,
    });
    const links = resource._links as Record<string, unknown>;
    links.expand = {
      href: `${publicOrigin(req).origin}${nodePath(scope.prefix, id)}{?depth}`,
      templated: true,
      title: `depth: hops of neighbours to embed, 0 to ${MAX_DEPTH}`,
    };
    // The collection this node is listed in, carrying the same parameters as every other link.
    const collection = collectionPath(scope.prefix, slugFor(resource.type as NodeLabel));
    links.index = { href: `${publicOrigin(req).origin}${collection}?${search}` };
    const events = `${nodePath(scope.prefix, id)}/${EVENTS_SEGMENT}`;
    links.events = { href: `${publicOrigin(req).origin}${events}?${search}` };

    return new Response(JSON.stringify(resource), {
      status: 200,
      headers: { "content-type": "application/hal+json" },
    });
  } catch (err) {
    if (isRaisedException(err)) {
      return problem(404, "Not Found", `Resource with id ${id} not found. ${err.message}`);
    } else {
      throw err;
    }
  }
}

// Behind the tunnel the request URL says http; the forwarded header says what the crawler used.
export function publicOrigin(req: Request): URL {
  const url = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.slice(0, -1);
  return new URL(`${proto}://${url.host}`);
}

// RFC 9727: one linkset entry per API.
export function apiCatalogHandler(req: Request): Response {
  const origin = publicOrigin(req).origin;
  const catalog = {
    linkset: [
      ...["/collections"].map((anchor) => ({
        anchor: `${origin}${anchor}`,
        "service-desc": [{ href: `${origin}/docs/openapi.json`, type: "application/openapi+json" }],
        "service-doc": [{ href: `${origin}/docs/`, type: "text/markdown" }],
        status: [{ href: `${origin}/healthz`, type: "application/json" }],
      })),
    ],
  };
  return new Response(JSON.stringify(catalog), {
    status: 200,
    headers: { "content-type": "application/linkset+json" },
  });
}

interface LinkContext {
  origin: string;
  /** Set on every link when given; without it a link keeps the query it already has. */
  search?: string;
  prefix: string;
}

// Walks the resource and makes every `_links` href absolute, in place.
export function populateLinks(obj: unknown, ctx: LinkContext): void {
  if (obj === null || typeof obj !== "object") return;
  for (const [key, value] of Object.entries(obj)) {
    if (key === "_links" && value !== null && typeof value === "object") {
      const links = value as Record<string, unknown>;
      for (const [rel, link] of Object.entries(links)) {
        links[rel] = Array.isArray(link)
          ? link.map((one) => absolute(one, ctx))
          : absolute(link, ctx);
      }
    } else {
      populateLinks(value, ctx);
    }
  }
}

function absolute(link: unknown, ctx: LinkContext): unknown {
  if (link === null || typeof link !== "object") return link;
  const { href } = link as { href?: unknown };
  if (typeof href !== "string" || href === "") return link;
  const node = QUERY_HREF.exec(href);
  const path = node ? nodePath(ctx.prefix, node[1]!) : ctx.prefix + href;
  const absoluteUrl = new URL(path, ctx.origin);
  if (ctx.search !== undefined) absoluteUrl.search = ctx.search;
  return { ...link, href: absoluteUrl.toString() };
}
