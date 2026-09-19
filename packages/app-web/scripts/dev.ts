#!/usr/bin/env bun
/**
 * `bun run dev`: the API and the browser app, each restarted by the tool that knows it.
 *
 * The API runs under `bun --watch`, so an edit to anything it imports restarts it. Vite serves
 * the browser app with hot module replacement and proxies the API's paths to it, which keeps one
 * public port for a tunnel. The two are separate processes because the API's entry is the same
 * one a compiled binary will run, and Vite cannot reload modules a config file imported.
 */

import { ensureLabkitPostgres } from "../src/infra/postgres";

await ensureLabkitPostgres();

const inherit = { stdout: "inherit", stderr: "inherit", stdin: "inherit" } as const;
const children = [
  Bun.spawn(["bun", "--watch", "--no-clear-screen", "src/server/main.ts"], inherit),
  Bun.spawn(["bun", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], inherit),
];

const stop = () => {
  for (const child of children) child.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

// Whichever ends first takes the other with it, so a crash is never a half-running stack.
const code = await Promise.race(children.map((child) => child.exited));
stop();
process.exit(code);
