/**
 * Serves the fake agent over Streamable HTTP for development: `bun packages/acp-fake/main.ts [port]`.
 * Without a port the system picks one. Bound to the loopback interface only.
 */

import { createFakeAcpServer } from "./server";

const server = createFakeAcpServer();
const port = Number(process.argv[2] ?? 0);

const listening = Bun.serve({
  hostname: "127.0.0.1",
  port,
  // The stream stays open while a turn waits for a permission answer, so no idle timeout.
  idleTimeout: 0,
  fetch: (req) => server.handleRequest(req),
});

console.error(`labkit fake ACP agent http://127.0.0.1:${listening.port}/`);
