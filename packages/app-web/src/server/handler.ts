import { withTenant, type Runtime, type TenantScope } from "./runtime";
import {
  isCollectionSlug,
  rootCollectionsHandler,
  workspaceCollectionsHandler,
} from "./collections-handler";
import { docsHandler } from "./docs-handler";
import {
  apiCatalogHandler,
  graphHandler,
  nodePath,
  publicOrigin,
  sitemapHandler,
} from "./graph-handler";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function problem(status: number, title: string, detail?: string): Response {
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

export function notFound(detail?: string): Response {
  return problem(404, "Not Found", detail);
}

// function isCollectionSlug(value: string): value is CollectionSlug {
//   return Object.hasOwn(LABEL_BY_COLLECTION, value);
// }

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Only a request that arrived by a public name is readable from other origins. The Host header
// is set by the browser, so a page cannot claim to be on the tunnel while hitting the local server.
function withCors(req: Request, response: Response): Response {
  if (LOOPBACK_HOSTS.has(new URL(req.url).hostname)) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  return new Response(response.body, { status: response.status, headers });
}

function preflight(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-allow-headers": req.headers.get("access-control-request-headers") ?? "",
      "access-control-max-age": "86400",
    },
  });
}

export async function handle(req: Request, runtime: Runtime): Promise<Response> {
  if (req.method === "OPTIONS") return withCors(req, preflight(req));
  return withCors(req, await route(req, runtime));
}

// `/workspace/{slug}` is a workspace's collections, `/workspace/{slug}/{type}` one collection and
// `/workspace/{slug}/{handle}` one node. The bare `/graph/{handle}` and `/collections…` are the
// default workspace.
const WORKSPACE_PATH = /^\/workspace\/([^/]+)(\/.*)?$/;

async function inWorkspace(
  runtime: Runtime,
  slug: string | undefined,
  work: (scope: TenantScope) => Promise<Response>,
): Promise<Response> {
  return (await withTenant(runtime, slug, work)) ?? notFound(`workspace ${slug} does not exist`);
}

async function route(req: Request, runtime: Runtime): Promise<Response> {
  if (req.method !== "GET") {
    return problem(405, "Method Not Allowed", `${req.method} is not GET`);
  }

  const original = new URL(req.url).pathname;
  const path = original;

  const workspace = WORKSPACE_PATH.exec(original);
  if (workspace) {
    const slug = decodeURIComponent(workspace[1]!);
    const rest = workspace[2] ?? "";
    console.debug("request: workspace", slug, rest);
    const name = /^\/([^/]+)$/.exec(rest)?.[1];
    if (name !== undefined && !isCollectionSlug(name)) {
      const id = decodeURIComponent(name);
      return inWorkspace(runtime, slug, (scope) => graphHandler(req, scope, id));
    }
    return inWorkspace(runtime, slug, (scope) => workspaceCollectionsHandler(req, scope, rest));
  }

  if (path === "/healthz") {
    console.debug("request: health check", path);
    return json({ ok: true, worktree: runtime.worktree });
  }

  if (path === "/docs" || path.startsWith("/docs/")) {
    console.debug("request: docs", path);
    return docsHandler(req);
  }

  if (path === "/collections" || path.startsWith("/collections/")) {
    console.debug("request: collections", path);
    return inWorkspace(runtime, undefined, (scope) => rootCollectionsHandler(req, scope, path));
  }

  if (path === "/.well-known/api-catalog") {
    console.debug("request: api-catalog", path);
    return apiCatalogHandler(req);
  }

  if (path === "/sitemap.xml") {
    console.debug("request: sitemap", path);
    return inWorkspace(runtime, undefined, (scope) => sitemapHandler(req, scope));
  }

  if (/^\/graph\/?$/.test(path)) {
    console.debug("request: graph without a handle, redirecting to the first question", path);
    return Response.redirect(new URL(nodePath("", "Q_1"), publicOrigin(req)), 302);
  }

  const node = /^\/graph\/([^/]+)$/.exec(path)?.[1];
  if (node !== undefined) {
    console.debug("request: graph", path);
    const id = decodeURIComponent(node);
    return inWorkspace(runtime, undefined, (scope) => graphHandler(req, scope, id));
  }

  if (path === "/") {
    // `/api` is the HAL root for any Accept. `/` with HTML is the SPA and
    // never reaches handle; if it does, still return the root document.
    // const root = await loadRoot(runtime.graph);
    // if (root == null) return notFound("no pose question in this graph");
    // return hal(root);
    console.debug("request: root", path);
    return Response.redirect("/graph/Q_1", 302);
  }

  // const parts = path.split("/").filter((part) => part.length > 0);
  // if (parts.length === 1) {
  //   const slug = parts[0]!;
  //   if (!isCollectionSlug(slug)) return notFound(`${original} is not a collection`);
  //   return hal(await loadCollection(runtime.graph, slug));
  // }

  // if (parts.length === 2) {
  //   const slug = parts[0]!;
  //   const n = parts[1]!;
  //   if (!isCollectionSlug(slug)) return notFound(`${original} is not a resource`);
  //   const resource = await loadResource(runtime.graph, slug, n);
  //   if (resource == null) return notFound(`${original} is not in the graph`);
  //   return hal(resource);
  // }

  return notFound(`${original} is not a labkit resource`);
}
