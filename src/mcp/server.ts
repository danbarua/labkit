#!/usr/bin/env bun
/**
 * The MCP server — the other door onto the reads `src/cli.ts` opens.
 *
 * Same surface, different caller. The CLI is for a person at a terminal and
 * renders prose by default; this is for an agent, and returns the **whole**
 * structured report every time. That is deliberate rather than lazy: the CLI's
 * hand-picked prose fields fell behind the report types twice (see that file's
 * header), and a transport that ships the report entire cannot fall behind it
 * at all.
 *
 * **Read-only structurally.** `buildServer` takes a `ReadSurface`. No write
 * verb is in scope, and `tests/mcp.test.ts` derives the forbidden names from
 * `WriteSurface.prototype` rather than listing them, so a verb added later is
 * covered without anyone remembering.
 *
 * **Import from subpaths only.** `@modelcontextprotocol/sdk`'s `exports` maps
 * `"."` to a `dist/esm/index.js` that is not on disk — verified under Bun, not
 * assumed from Node. `server/index.js` is the other trap: it looks like the
 * obvious path and exports the deprecated `Server`.
 *
 * **stdout is the protocol channel.** Nothing below prints to it, and nothing
 * under `connectDb()` does either — query tracing (`LABKIT_TRACE`, see
 * src/db/trace.ts) writes to stderr, which is why it can be left on here.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { connectDb } from "../db/connect";
import { resolveTenantContext } from "../db/tenant";
import { TenantGraph } from "../db/graph";
import { ReadSurface } from "../domain";
import { TOOLS } from "./tools";

/**
 * Registers the seven tools against a read surface. Transport-free, so a test
 * can drive it over `InMemoryTransport` without a subprocess.
 *
 * No `outputSchema` is declared. Declaring one makes `structuredContent`
 * mandatory *and* validated, which would mean hand-writing a Zod mirror of
 * seven report interfaces whose only job is to go stale against them. The
 * structured result is returned regardless, alongside the JSON text an older
 * client reads.
 *
 * Errors are not caught. `whySupported()` refuses an ambiguous proposition by
 * throwing, and the SDK turns a throw into `isError: true` carrying the
 * message — so the refusal reaches the caller as a refusal. Wrapping it here
 * would convert a good refusal into an empty success, which is the one
 * outcome the domain went to trouble to avoid.
 */
export function buildServer(read: ReadSurface): McpServer {
  const server = new McpServer({ name: "labkit", version: "0.0.1" });

  for (const definition of TOOLS) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        annotations: { readOnlyHint: true },
      },
      async (args: Record<string, unknown>) => {
        inFlight++;
        try {
          const result = await definition.handler(read, args);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
            structuredContent: result as Record<string, unknown>,
          };
        } finally {
          inFlight--;
        }
      },
    );
  }

  return server;
}

/**
 * Tool calls currently being answered.
 *
 * Module state rather than a field because it exists for exactly one caller —
 * `main()`'s shutdown, below — and a server built by a test has no shutdown to
 * coordinate. It is here at all because the first version of that shutdown
 * exited on stdin's `end` and dropped the response to a request already in
 * hand: three requests in, two answers out. A shutdown that loses an answer it
 * had computed is worse than one that never exits.
 */
let inFlight = 0;

/**
 * Resolves one tenant, builds one read surface, serves over stdio.
 *
 * The tenant is resolved once at the boundary and never again — below it every
 * function takes a resolved context, and there is no "current tenant" anyone
 * can change mid-session.
 */
export async function main(tenant = process.env.LABKIT_TENANT ?? "labkit"): Promise<void> {
  const connection = await connectDb();
  const ctx = await resolveTenantContext(connection.db, tenant);
  const server = buildServer(new ReadSurface(new TenantGraph(ctx, connection.db)));

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // A client shuts an MCP stdio server down by closing its stdin, and nothing
  // else does. `StdioServerTransport` subscribes to stdin's `data` and `error`
  // only — never `end` — so its `onclose` fires when someone calls `close()`
  // and at no other time, and the open database connection then keeps the
  // event loop alive forever.
  //
  // The first attempt at this hung `transport.onclose` off the transport and
  // was dead code. It was "verified" by a pipeline whose exit status came from
  // `wc -l` rather than from the server -- the trap CLAUDE.md documents, walked
  // straight into. Measured without the pipe, the process sat there for the
  // full 15 seconds.
  process.stdin.on("end", () => {
    void drainThenExit(server, connection);
  });
}

/** Waits for every request already in hand to be answered, then shuts down. */
async function drainThenExit(server: McpServer, connection: { close(): Promise<void> }): Promise<void> {
  // One tick before counting: a request that arrived in the same chunk as the
  // EOF may not have reached its handler yet, so a count of zero right now
  // proves nothing.
  await new Promise((resolve) => setTimeout(resolve, 0));
  while (inFlight > 0) await new Promise((resolve) => setTimeout(resolve, 5));
  await server.close().catch(() => {});
  await connection.close().catch(() => {});
  process.exit(0);
}

if (import.meta.main) await main();
