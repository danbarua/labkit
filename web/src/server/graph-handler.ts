import type { TenantScope } from "./runtime";
import { DatabaseError } from "pg";
// Bare links return one hop of neighbours. MAX_DEPTH mirrors the limit in entity_as_hal.
const DEFAULT_DEPTH = 1;
const MAX_DEPTH = 6;

// matches /graph/Q_1
const MATCHER = new URLPattern({ pathname: "/graph/:id" });

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

// `path` is the request path with any workspace prefix already taken off.
export async function graphHandler(
  req: Request,
  scope: TenantScope,
  path: string,
): Promise<Response> {
  if (!URL.canParse(req.url)) {
    throw Error("Invalid URL");
  }

  const m = MATCHER.exec({ pathname: path });
  const id = m?.pathname.groups.id;
  if (!id) {
    console.log("request: /graph without id, redirecting to /graph/Q_1", req.url);
    return Response.redirect(new URL(`${scope.prefix}/graph/Q_1`, publicOrigin(req)), 302);
  }

  const url = new URL(req.url);
  const depthParam = url.searchParams.get("depth");
  const depth = depthParam === null ? DEFAULT_DEPTH : Number(depthParam);
  if (!Number.isInteger(depth) || depth < 0 || depth > MAX_DEPTH) {
    return problem(400, "Bad Request", `depth must be an integer from 0 to ${MAX_DEPTH}`);
  }

  try {
    const queryResult = await scope.query("SELECT entity_as_hal($1, $2, $3)", [
      scope.graphName,
      id,
      depth,
    ]);

    if (!queryResult || !queryResult.rows.length) {
      return problem(404, "Not Found");
    }

    const resource = queryResult!.rows.at(0)!.entity_as_hal as Record<string, unknown>;
    // Links carry the depth that was applied, so following one repeats this view.
    const search = new URLSearchParams(url.search);
    search.set("depth", String(depth));
    const converted = populateLinks(resource, {
      origin: publicOrigin(req).origin,
      search: `?${search}`,
      prefix: scope.prefix,
    });
    (converted._links as Record<string, unknown>).expand = {
      href: `${publicOrigin(req).origin}${scope.prefix}/graph/${id}{?depth}`,
      templated: true,
      title: `depth: hops of neighbours to embed, 0 to ${MAX_DEPTH}`,
    };

    return new Response(JSON.stringify(converted), {
      status: 200,
      headers: { "content-type": "application/hal+json" },
    });
  } catch (err) {
    if (err instanceof DatabaseError && err.code === "P0001") {
      return problem(404, "Not Found", `Resource with id ${id} not found. ${err.message}`);
    } else {
      throw err;
    }
  }
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// Behind the tunnel the request URL says http; the forwarded header says what the crawler used.
export function publicOrigin(req: Request): URL {
  const url = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.slice(0, -1);
  return new URL(`${proto}://${url.host}`);
}

// Every live Question is an entry point into /graph; the rest of the graph is reached by following links.
export async function sitemapHandler(req: Request, scope: TenantScope): Promise<Response> {
  const result = await scope.query<{ id: string }>(`
        SELECT trim(both '"' FROM natural_id::text) AS id
        FROM ag_catalog.cypher(
            '${scope.graphName}'::name,
            $$MATCH (n:Question)
              WHERE n.retracted IS NULL
              RETURN n.natural_id
              ORDER BY n.natural_id$$
        ) AS node(natural_id ag_catalog.agtype)
    `);
  const origin = publicOrigin(req).origin;
  const paths = [
    "/docs/",
    "/docs/api.md",
    "/collections",
    ...result.rows.map((row) => `${scope.prefix}/graph/${row.id}`),
  ];
  const urls = paths.map((p) => `  <url><loc>${xmlEscape(origin + p)}</loc></url>`).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/xml" },
  });
}

// RFC 9727: one linkset entry per API.
export function apiCatalogHandler(req: Request): Response {
  const origin = publicOrigin(req).origin;
  const catalog = {
    linkset: [
      ...["/graph", "/collections"].map((anchor) => ({
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
  search: string;
  prefix: string;
}

// walk through the resource and convert _links to absolute URLs
function populateLinks(obj: any, ctx: LinkContext): Record<string, unknown> {
  if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      if (key === "_links" && typeof obj[key] === "object") {
        for (const linkKey of Object.keys(obj[key])) {
          const linkValue = obj[key][linkKey];
          obj[key][linkKey] = Array.isArray(linkValue)
            ? linkValue.map(absolute)
            : absolute(linkValue);
        }
      } else {
        populateLinks(obj[key], ctx);
      }
    }

    return obj;
  }

  return obj;

  function absolute(link: any) {
    if (!link || typeof link !== "object" || !link.href) return link;
    const absoluteUrl = new URL(ctx.prefix + link.href, ctx.origin);
    absoluteUrl.search = ctx.search;
    return { ...link, href: absoluteUrl.toString() };
  }
}
