import { handle } from "./handler";
import { openRuntime } from "./runtime";

const runtime = await openRuntime();
const port = Number(process.env.LABKIT_PORT_WEB ?? 8899);

Bun.serve({
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
      return new Response(
        JSON.stringify({
          title: "Application Error",
          detail: message,
        }),
        {
          status: 500,
          headers: { "content-type": "application/problem+json" },
        },
      );
    }
  },
});

// Diagnostics go to stderr: stdout is a protocol channel elsewhere in this repo (check:stdout).
console.error(`labkit-web api http://127.0.0.1:${port} worktree=${runtime.worktree}`);
