import { ensureOverlapBench } from "../infra/seed";
import { handle } from "./handler";
import { openSession } from "./session";

await ensureOverlapBench();
const session = await openSession();
const port = Number(process.env.LABKIT_PORT_WEB ?? 8899);

Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(req) {
    try {
      return await handle(req, session);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },
});

console.log(
  `labkit-web api http://127.0.0.1:${port} tenant=${session.tenant} worktree=${session.worktree}`,
);
