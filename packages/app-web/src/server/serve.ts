import { handle } from "./handler";
import type { Runtime } from "./runtime";

/** The API on `port` (0 picks a free one), answering with `handle` and logging each request. */
export function serve(runtime: Runtime, port: number) {
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      try {
        const started = performance.now();
        const res = await handle(req, runtime);
        const ms = Math.round(performance.now() - started);
        const type = res.headers.get("content-type") ?? "";
        console.error(`${req.method} ${new URL(req.url).pathname} ${res.status} ${type} ${ms}ms`);
        return res;
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ title: "Application Error", detail: message }), {
          status: 500,
          headers: { "content-type": "application/problem+json" },
        });
      }
    },
  });
}
