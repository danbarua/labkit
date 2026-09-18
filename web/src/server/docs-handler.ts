import path from "node:path";
import { fileURLToPath } from "node:url";

const DOCS_ROOT = fileURLToPath(new URL("../../public/docs/", import.meta.url));

// Serves public/docs/** under /docs/. The bare /docs/ is the index.
export async function docsHandler(req: Request): Promise<Response> {
  const pathname = decodeURIComponent(new URL(req.url).pathname);
  const relative = pathname.replace(/^\/docs\/?/, "") || "index.md";
  const file = path.resolve(DOCS_ROOT, relative);
  if (!file.startsWith(DOCS_ROOT)) return new Response("Not Found", { status: 404 });

  const body = Bun.file(file);
  if (!(await body.exists())) return new Response("Not Found", { status: 404 });
  const type = file.endsWith(".md") ? "text/markdown; charset=utf-8" : body.type;
  return new Response(body, { status: 200, headers: { "content-type": type } });
}
