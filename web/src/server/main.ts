import { ensureOverlapBench } from "../infra/seed";
import { handle } from "./handler";
import { openRuntime } from "./runtime";

await ensureOverlapBench();
const runtime = await openRuntime();
const port = Number(process.env.LABKIT_PORT_WEB ?? 8899);

Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(req) {
    try {
      return await handle(req, runtime);
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

console.log(
  `labkit-web api http://127.0.0.1:${port} tenant=${runtime.tenant} worktree=${runtime.worktree}`,
);
