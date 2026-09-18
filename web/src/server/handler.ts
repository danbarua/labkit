import { HAL_JSON, LABEL_BY_COLLECTION, type CollectionSlug } from "../hypermedia";
import { loadCollection, loadResource, loadRoot } from "./resources";
import type { Runtime } from "./runtime";
import { docsHandler } from "./docs-handler";
import { graphHandler, sitemapHandler } from "./graph-handler";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function hal(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": HAL_JSON },
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

function acceptsDocument(accept: string | null): boolean {
  if (accept == null || accept === "" || accept === "*/*") return true;
  return /\bapplication\/(hal\+)?json\b/.test(accept);
}

function notFound(detail?: string): Response {
  return problem(404, "Not Found", detail);
}

function isCollectionSlug(value: string): value is CollectionSlug {
  return Object.hasOwn(LABEL_BY_COLLECTION, value);
}

export function isLabkitApiPath(pathname: string, accept: string): boolean {
  if (pathname === "/healthz" || pathname === "/sitemap.xml") return true;
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  if (pathname === "/docs" || pathname.startsWith("/docs/")) return true;
  if (pathname === "/graph" || pathname.startsWith("/graph/")) return true;
  if (pathname === "/") {
    return acceptsDocument(accept);
  }
  const slug = pathname.split("/").filter((part) => part.length > 0)[0];
  return slug !== undefined && isCollectionSlug(slug);
}

export async function handle(req: Request, runtime: Runtime): Promise<Response> {
  if (req.method !== "GET") {
    return problem(405, "Method Not Allowed", `${req.method} is not GET`);
  }

  const original = new URL(req.url).pathname;
  let path = original;

  if (path === "/healthz") {
    return json({ ok: true, worktree: runtime.worktree, tenant: runtime.tenant });
  }

  if (path === "/docs" || path.startsWith("/docs/")) return docsHandler(req);

  if (path === "/sitemap.xml") return sitemapHandler(req, runtime);

  // new API
  if (path.startsWith("/graph")) return (await graphHandler(req, runtime));

  // old API
  if (path === "/api" || path === "/api/") path = "/";
  else if (path.startsWith("/api/")) path = path.slice("/api".length) || "/";

  if (path === "/") {
    // `/api` is the HAL root for any Accept. `/` with HTML is the SPA and
    // never reaches handle; if it does, still return the root document.
    // const root = await loadRoot(runtime.graph);
    // if (root == null) return notFound("no pose question in this graph");
    // return hal(root);

    return Response.redirect("/graph/Q_1", 302);
  }

  const parts = path.split("/").filter((part) => part.length > 0);
  if (parts.length === 1) {
    const slug = parts[0]!;
    if (!isCollectionSlug(slug)) return notFound(`${original} is not a collection`);
    return hal(await loadCollection(runtime.graph, slug));
  }
  
  if (parts.length === 2) {
    const slug = parts[0]!;
    const n = parts[1]!;
    if (!isCollectionSlug(slug)) return notFound(`${original} is not a resource`);
    const resource = await loadResource(runtime.graph, slug, n);
    if (resource == null) return notFound(`${original} is not in the graph`);
    return hal(resource);
  }

  return notFound(`${original} is not a labkit resource`);
}
