import { LABEL_BY_COLLECTION, type CollectionSlug } from "../hypermedia";
import { loadCollection, loadResource, loadRoot } from "./resources";
import type { Session } from "./session";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function notFound(): Response {
  return json({ error: "not found" }, 404);
}

function isCollectionSlug(value: string): value is CollectionSlug {
  return Object.hasOwn(LABEL_BY_COLLECTION, value);
}

export function isLabkitApiPath(pathname: string, accept: string): boolean {
  if (pathname === "/healthz") return true;
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  if (pathname === "/") {
    return accept === "" || accept === "*/*" || /\bapplication\/json\b/.test(accept);
  }
  const slug = pathname.split("/").filter((part) => part.length > 0)[0];
  return slug !== undefined && isCollectionSlug(slug);
}

export async function handle(req: Request, session: Session): Promise<Response> {
  if (req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  let path = new URL(req.url).pathname;
  if (path === "/api" || path === "/api/") path = "/";
  else if (path.startsWith("/api/")) path = path.slice("/api".length);

  if (path === "/healthz") {
    return json({ ok: true, worktree: session.worktree, tenant: session.tenant });
  }

  if (path === "/") {
    const accept = req.headers.get("accept");
    const jsonAccept =
      accept == null || accept === "" || accept === "*/*" || /\bapplication\/json\b/.test(accept);
    if (!jsonAccept) return notFound();
    const root = await loadRoot(session.graph);
    if (root == null) return notFound();
    return json(root);
  }

  const parts = path.split("/").filter((part) => part.length > 0);
  if (parts.length === 1) {
    const slug = parts[0]!;
    if (!isCollectionSlug(slug)) return notFound();
    return json(await loadCollection(session.graph, slug));
  }
  if (parts.length === 2) {
    const slug = parts[0]!;
    const n = parts[1]!;
    if (!isCollectionSlug(slug)) return notFound();
    const resource = await loadResource(session.graph, slug, n);
    if (resource == null) return notFound();
    return json(resource);
  }

  return notFound();
}
