/**
 * The MCP server — the door an agent works through.
 */

import { labkitVersion } from "@labkit/core-db/version";
import type { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logFailedRequest, type Adapter } from "@labkit/core-domain/request-log";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ReadSurface, WriteSurface, openRecord } from "@labkit/core-domain";
import type { RecordLocation } from "@labkit/core-db/connect";
import {
  commandContext,
  mockGitContext,
  mockSessionContext,
  type SessionContextProvider,
} from "@labkit/core-domain/context";
import { TOOLS, WRITE_TOOLS } from "./tools";
import { DOCS_URI, instructionsFor, metaTools, renderToolDocs, type Registered } from "./docs";

/**
 * Everything a tool call needs, for the duration of that call and no longer.
 */
export type WithSurfaces = <T>(
  work: (surfaces: { read: ReadSurface; write: WriteSurface }) => Promise<T>,
) => Promise<T>;

/**
 * A tool's `outputSchema`, only when the caller asked for it.
 *
 * The schemas are 87KB of the 133KB an agent receives from `tools/list`, and
 * no caller reads them as documentation. Set `LABKIT_MCP_OUTPUT_SCHEMA=1` to
 * declare them, which a client validating structured results wants.
 */
function declaredOutput(schema: z.ZodType | undefined): { outputSchema?: z.ZodType } {
  const wanted = process.env.LABKIT_MCP_OUTPUT_SCHEMA;
  if (schema === undefined) return {};
  if (wanted === undefined || wanted === "" || wanted === "0" || wanted === "false") return {};
  return { outputSchema: schema };
}

/**
 * Registers every tool against a **scope** that yields both surfaces. Transport-free, so a test
 * can drive it over `InMemoryTransport` without a subprocess.
 */
export function buildServer(
  withSurfaces: WithSurfaces,
  { readOnly = false }: { readOnly?: boolean } = {},
): McpServer {
  // What this server registers, decided before anything is registered: the handshake's
  // instructions and the documentation both describe this list and no other.
  const registered: Registered = { reads: TOOLS, writes: readOnly ? [] : WRITE_TOOLS };

  // The package's version, not a constant: `serverInfo.version` is what the MCP spec has for
  // "which build am I talking to".
  const server = new McpServer(
    { name: "labkit", version: labkitVersion() },
    { instructions: instructionsFor(registered) },
  );

  // The tool surface as prose, rendered on each read from `registered`. Served twice — as a
  // resource, and as a tool — because not every client implements resources, and one that does
  // not sees the resource in no list.
  server.registerResource(
    "tool-docs",
    DOCS_URI,
    {
      title: "LabKit tools",
      description:
        "What each tool on this server does, in prose, generated from the tool declarations.",
      mimeType: "text/markdown",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: renderToolDocs(registered) }],
    }),
  );

  // First in the list: `tools/list` is served in registration order, so a client that cannot
  // see resources meets the documentation before the tools it documents.
  for (const definition of metaTools(registered)) {
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

  for (const definition of registered.reads) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        ...declaredOutput(definition.outputSchema),
        // Only on the reads. An absent hint is not a claim either way, which is
        // the honest thing to say about a tool that changes the record.
        annotations: { readOnlyHint: true },
      },
      respond(definition.name, (args) =>
        withSurfaces(({ read }) => definition.handler(read, args)),
      ),
    );
  }

  for (const definition of registered.writes) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        ...declaredOutput(definition.outputSchema),
      },
      // A surface per call, so each write records the commit in force at the moment it ran
      // rather than at server start.
      respond(definition.name, (args) =>
        withSurfaces(({ write }) => definition.handler(write, args)),
      ),
    );
  }

  return server;
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
 * a tool both halves, close. `session` names who each write is attributed to.
 */
export function surfacesOver(
  { record, tenant }: { record?: RecordLocation; tenant: string },
  session: SessionContextProvider,
): WithSurfaces {
  return async (work) => {
    // Providers are sampled per call, so a long-running server records the commit each piece
    // of work was actually done against, and the session named at that moment.
    const opened = await openRecord({
      ...(record === undefined ? {} : { record }),
      tenant,
      context: commandContext(mockGitContext, session),
    });
    try {
      return await work({ read: opened.read, write: opened.write });
    } finally {
      await opened.close();
    }
  };
}

/**
 * Serves over stdio, opening and releasing the database around each tool call. `record` is where
 * the CLI located the record; the server does not locate one of its own.
 */
export async function main({
  record,
  tenant,
  readOnly = false,
}: {
  record: RecordLocation;
  tenant: string;
  readOnly?: boolean;
}): Promise<void> {
  // Nothing on stdio says who the caller is, so writes carry the stand-in session.
  const server = buildServer(surfacesOver({ record, tenant }, mockSessionContext), { readOnly });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // A client shuts an MCP stdio server down by closing its stdin, and nothing else does.
  // `StdioServerTransport` subscribes to stdin's `data` and `error` only — never `end` — so its
  // `onclose` fires when someone calls `close()` and at no other time.
  process.stdin.on("end", () => {
    void drainThenExit(server);
  });

  // **Never settles, and that is the contract.** `packages/app-cli/cli.ts` ends with `process.exit(await
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
