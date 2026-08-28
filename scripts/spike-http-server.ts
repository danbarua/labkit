#!/usr/bin/env bun
/**
 * LabKit's MCP server over HTTP instead of stdio, for a spike.
 *
 * `labkit mcp` speaks stdio, which a client starts as a subprocess: one process
 * per client, and every piece of per-client state gets that for free. This
 * serves the same tools over Streamable HTTP, where one process serves many —
 * so the state that was free has to be found a home, and the point of the spike
 * is to find out which homes are wrong.
 *
 * **`scripts/` and not `src/`, deliberately.** It composes `buildServer` and
 * `surfacesOver`, both exported, and adds no domain code. That keeps it
 * deletable on its own merits: nothing under `src/` knows it exists.
 *
 * ## The one decision this file exists to make
 *
 * `sessionRegistry()` (`src/attribution.ts`) is a closure over one mutable
 * `who`, and `main()` builds exactly one for the process. Over stdio that is
 * one per client, because the client owns the process. Over HTTP it is one for
 * everybody, and the first agent to `register_session` supplies the identity
 * that every other agent's writes are stamped with.
 *
 * **That is worse than the `mock-session-0` PR #87 removed**, by #87's own
 * argument: a uniform placeholder is bad because "empty reads as unknown, a
 * uniform placeholder reads as known" — and a *plausible* name one step further
 * reads as known **and checked**. Agent B's analysis filed under agent A is a
 * false provenance record in the column whose entire purpose is provenance.
 *
 * So `--shared-registry` exists to demonstrate that, not because anyone would
 * want it. Default is one registry per MCP session, which is what the transport
 * already gives us a key for.
 *
 * ## Usage
 *
 *   docker compose up -d db
 *   LABKIT_DB_URL=postgres://postgres:agens@127.0.0.1:5432/labkit_spike \
 *     bun scripts/spike-http-server.ts [--port 8899] [--shared-registry]
 *
 * `LABKIT_DB_URL` is required rather than defaulted. The embedded backend is a
 * single-writer file under a lock, so pointing many HTTP clients at one is a
 * question about PGlite rather than about LabKit, and answering it by accident
 * is not the same as choosing to.
 *
 * **Not `labkit_tests` and not `labkit`.** `reset()` truncates the first, so a
 * concurrent `bun run test:pg` would eat the spike's data with nothing to show
 * for it; the second is deliberately the name a real deployment would pick, and
 * this is not one.
 */

import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { type SessionRegistry, sessionRegistry } from "../src/attribution";
import { buildServer, surfacesOver } from "../src/mcp/server";

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const value = (name: string, fallback: string): string => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
};

const PORT = Number(value("--port", "8899"));
const SHARED = flag("--shared-registry");
const TENANT = process.env.LABKIT_TENANT ?? "labkit";

if (!process.env.LABKIT_DB_URL) {
  console.error(
    "spike-http-server: LABKIT_DB_URL is required.\n" +
      "  The embedded backend is one writer under a lock; many HTTP clients against it\n" +
      "  asks a question about PGlite rather than about LabKit. Start the container:\n" +
      "    docker compose up -d db\n" +
      "    LABKIT_DB_URL=postgres://postgres:agens@127.0.0.1:5432/labkit_spike bun scripts/spike-http-server.ts",
  );
  process.exit(2);
}

/**
 * One registry shared by every connection — the wiring this spike exists to
 * refute. Built once here so the failure is a flag rather than a rewrite.
 */
const shared = sessionRegistry();

interface Session {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  registry: SessionRegistry;
}

const sessions = new Map<string, Session>();

/**
 * Builds a server for one MCP session.
 *
 * The registry is a closure per session rather than a lookup on
 * `extra.sessionId`, which the SDK also offers. Both reach the same place; this
 * one cannot be defeated by someone later sharing a server object, because
 * there is no server to share — each session has its own. It is also the shape
 * `surfacesOver` already takes, so the seam did the work.
 */
function openSession(): Session {
  const registry = SHARED ? shared : sessionRegistry();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, session);
      console.error(`session ${id} opened  (registries: ${SHARED ? "shared" : "per-session"})`);
    },
    onsessionclosed: (id) => {
      sessions.delete(id);
      console.error(`session ${id} closed`);
    },
  });
  const server = buildServer(surfacesOver(TENANT, registry), registry);
  const session: Session = { transport, server, registry };
  return session;
}

Bun.serve({
  port: PORT,
  idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return Response.json({ ok: true, sessions: sessions.size, shared: SHARED });
    }
    if (url.pathname !== "/mcp") return new Response("not found", { status: 404 });

    const id = request.headers.get("mcp-session-id");
    const existing = id ? sessions.get(id) : undefined;
    if (existing) return existing.transport.handleRequest(request);

    // No id, or an id we do not hold: let the transport decide. An initialize
    // gets a new session; anything else gets the SDK's own 400/404, which is a
    // better answer than one invented here.
    const session = openSession();
    await session.server.connect(session.transport);
    return session.transport.handleRequest(request);
  },
});

console.error(
  `spike-http-server: listening on http://127.0.0.1:${PORT}/mcp\n` +
    `  tenant=${TENANT}  registries=${SHARED ? "SHARED (deliberately wrong)" : "per-session"}\n` +
    `  db=${process.env.LABKIT_DB_URL?.replace(/:[^:@/]*@/, ":***@")}`,
);
