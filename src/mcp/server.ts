#!/usr/bin/env bun
/**
 * The MCP server — the door an agent works through.
 */

import pkg from "../../package.json" with { type: "json" };
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logFailedRequest, type Adapter } from "../request-log";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { connectDb } from "../db/connect";
import { resolveTenantContext } from "../db/tenant";
import { scopeToTenant } from "../db/scoped";
import { TenantGraph } from "../db/graph";
import { ReadSurface, WriteSurface } from "../domain";
import { pgEventLog } from "../domain/event-store";
import {
  commandContext,
  mockGitContext,
  registeredSession,
  sessionRegistry,
  type SessionRegistry,
} from "../attribution";
import { SESSION_TOOLS, TOOLS, WRITE_TOOLS } from "./tools";
import { DOCS_URI, INSTRUCTIONS, META_TOOLS, renderToolDocs } from "./docs";

/**
 * Everything a tool call needs, for the duration of that call and no longer.
 */
export type WithSurfaces = <T>(
  work: (surfaces: { read: ReadSurface; write: WriteSurface }) => Promise<T>,
) => Promise<T>;

/**
 * Registers every tool against a **scope** that yields both surfaces. Transport-free, so a test
 * can drive it over `InMemoryTransport` without a subprocess.
 */
export function buildServer(
  withSurfaces: WithSurfaces,
  session: SessionRegistry,
  { readOnly = false }: { readOnly?: boolean } = {},
): McpServer {
  // The package's version, not a constant: `serverInfo.version` is what the MCP spec has for
  // "which build am I talking to", and a client displaying a hardcoded one reads as sourced
  // while being wrong. It said `0.0.1` from before the first release until 2026-09-05, while
  // `labkit --version` was right — one binary, two surfaces, disagreeing about what they were.
  const server = new McpServer(
    { name: "labkit", version: pkg.version },
    { instructions: INSTRUCTIONS },
  );

  // The tool surface as prose, rendered on each read from the same `TOOLS` the loops below
  // register. Served twice — as a resource, and as a tool — because not every client implements
  // resources, and one that does not sees the resource in no list.
  server.registerResource(
    "tool-docs",
    DOCS_URI,
    {
      title: "LabKit tools",
      description:
        "Human-readable documentation of every tool that touches the record -- what each " +
        "answers, what it takes and what it returns -- generated from the tool " +
        "declarations themselves, so it cannot fall behind them.",
      mimeType: "text/markdown",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: renderToolDocs() }],
    }),
  );

  // **First in the list, deliberately.** `tools/list` is served in registration
  // order; a client that cannot see resources meets the documentation before
  // the tools it documents. On every server, read-only included, because it
  // describes whichever list this one serves.
  for (const definition of META_TOOLS) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        annotations: { readOnlyHint: true },
      },
      async () => ({
        content: [{ type: "text" as const, text: definition.handler() }],
      }),
    );
  }

  // **Second, before the reads.** This is the only tool whose absence makes every write refuse
  // — an agent scanning the list meets it before the verbs it gates rather than two thirds of
  // the way down.
  if (!readOnly) {
    for (const definition of SESSION_TOOLS) {
      server.registerTool(
        definition.name,
        {
          title: definition.title,
          description: definition.description,
          inputSchema: definition.inputSchema,
          outputSchema: definition.outputSchema,
          // No `readOnlyHint`, matching the writes. It changes nothing in the
          // record and is not a read either; an absent hint is the honest thing
          // to say about a tool that is neither.
        },
        respond(definition.name, (args) => definition.handler(session, args)),
      );
    }
  }

  for (const definition of TOOLS) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        outputSchema: definition.outputSchema,
        // Only on the reads. An absent hint is not a claim either way, which is
        // the honest thing to say about a tool that changes the record.
        annotations: { readOnlyHint: true },
      },
      respond(definition.name, (args) =>
        withSurfaces(({ read }) => definition.handler(read, args)),
      ),
    );
  }

  // **Nothing below this line is registered on a read-only server**, and the
  // early return is why the reads are registered above rather than in one loop
  // with a filter: a filter would leave a reader wondering which list a tool
  // came from, and this way the shape of the function is the answer.
  if (readOnly) return server;

  // Registered before the writes, and reachable when they are not: this is the
  // one tool whose whole job is to open the gate below.

  for (const definition of WRITE_TOOLS) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        outputSchema: definition.outputSchema,
      },
      // A surface per call, so each write records the attribution and commit in force at the
      // moment it ran rather than at server start.
      respond(definition.name, (args) => {
        requireRegistered(session, definition.name);
        return withSurfaces(({ write }) => definition.handler(write, args));
      }),
    );
  }

  return server;
}

/**
 * Refuses a write from a caller who has not said who they are.
 */
function requireRegistered(session: SessionRegistry, tool: string): void {
  if (session.registered()) return;
  throw new Error(
    `${tool} expected a registered session and this connection has none: ` +
      "call register_session with the id your harness gives you, then retry. " +
      "LabKit records what you tell it and checks nothing — the id is yours to " +
      "state, and an unsigned entry is worse than none because it looks attributed.",
  );
}

/**
 * The shared handler body: count the call, ship the whole result twice — as JSON text for a
 * client that reads `content`, and as `structuredContent` for one that reads the schema.
 */
function respond(tool: string, run: (args: Record<string, unknown>) => Promise<unknown>) {
  return async (args: Record<string, unknown>) => {
    inFlight++;
    try {
      const result = await run(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (error) {
      logFailedRequest({ adapter: "mcp-stdio" satisfies Adapter, tool, args }, error);
      throw error;
    } finally {
      inFlight--;
    }
  };
}

/**
 * Tool calls currently being answered.
 */
let inFlight = 0;

/**
 * The composition every surface is built through: connect, resolve the tenant, step down, hand
 * a tool both halves, close.
 */
export function surfacesOver(tenant: string, session: SessionRegistry): WithSurfaces {
  return async (work) => {
    const connection = await connectDb();
    try {
      // `tenantCtx`, not `ctx`. There are two contexts in scope here and they
      // are unrelated: this one is which tenant's graph to talk to, and the
      // `CommandContext` below is who is talking and when.
      const tenantCtx = await resolveTenantContext(connection.db, connection.tx, tenant);

      // Superuser work is done: `LOAD 'age'` and the graph DDL both needed it.
      // From here the session is `labkit_app` with its tenant pinned, so a tool
      // that forgets to filter still cannot read another tenant's events. See
      // src/db/scoped.ts for what that is and is not worth.
      await scopeToTenant(connection.db, tenantCtx);

      // One graph for both halves, so `inTransaction`'s re-entrancy depth is
      // shared. This is the composition `src/domain/session.ts` specifies for
      // an adapter that needs both.
      const graph = new TenantGraph(tenantCtx, connection.db, connection.tx);

      // **Durable, and on the same connection as the graph** — that is the atomicity story:
      // `emit` runs inside each verb's `inTransaction`, so an event and the writes it describes
      // commit together. A second connection would silently end that.
      const events = pgEventLog(connection.db, tenantCtx.tenantId);

      // Providers are sampled per call, so a long-running server records the commit each piece
      // of work was actually done against — and, now, the agent that was registered at that
      // moment rather than at server start.
      return await work({
        read: new ReadSurface(graph, { events }),
        write: new WriteSurface(graph, {
          ...commandContext(
            mockGitContext,
            registeredSession(session),
            undefined,
            session.registered()?.reconstructedFrom ?? undefined,
          ),
          events,
        }),
      });
    } finally {
      await connection.close();
    }
  };
}

/**
 * Serves over stdio, opening and releasing the database around each tool call.
 */
export async function main(
  tenant = process.env.LABKIT_TENANT ?? "labkit",
  { readOnly = false }: { readOnly?: boolean } = {},
): Promise<void> {
  // One registry for the life of the process, which over stdio is the life of
  // one client's connection. Built here rather than defaulted inside
  // `buildServer` for the same reason `pgEventLog` is: the tool that writes to
  // it and the surface that reads from it must be looking at one object, and a
  // component that defaults its own would hand them two.
  const session = sessionRegistry();

  const withSurfaces = surfacesOver(tenant, session);

  const server = buildServer(withSurfaces, session, { readOnly });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // A client shuts an MCP stdio server down by closing its stdin, and nothing else does.
  // `StdioServerTransport` subscribes to stdin's `data` and `error` only — never `end` — so its
  // `onclose` fires when someone calls `close()` and at no other time.
  process.stdin.on("end", () => {
    void drainThenExit(server);
  });

  // **Never settles, and that is the contract.** `src/cli/cli.ts` ends with `process.exit(await
  // main())`, so a promise that resolves once the transport is connected makes `labkit mcp`
  // connect, return, and exit **0 with no output** before answering a single request.
  await new Promise<never>(() => {});
}

/** Waits for every request already in hand to be answered, then shuts down. */
async function drainThenExit(server: McpServer): Promise<void> {
  // One tick before counting: a request that arrived in the same chunk as the
  // EOF may not have reached its handler yet, so a count of zero right now
  // proves nothing.
  await new Promise((resolve) => setTimeout(resolve, 0));
  while (inFlight > 0) await new Promise((resolve) => setTimeout(resolve, 5));
  await server.close().catch(() => {});
  process.exit(0);
}

if (import.meta.main) await main();
