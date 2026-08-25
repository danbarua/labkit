#!/usr/bin/env bun
/**
 * The MCP server — the door an agent works through.
 *
 * The CLI next door is for a person at a terminal, renders prose by default,
 * and is **read-only**: it builds only a `ReadSurface`, so it cannot write at
 * all. This server is for an agent, returns the **whole** structured report
 * every time, and reads *and writes*. Returning the report entire is deliberate
 * rather than lazy: the CLI's hand-picked prose fields fell behind the report
 * types twice (see that file's header), and a transport that ships the report
 * entire cannot fall behind it at all.
 *
 * **It was read-only for one batch of work and is not any more.** A record
 * nothing can write to is a record with nothing in it, and every read here
 * answers a question about work some other process had to have done. The two
 * halves stay separate at the handler boundary — a read tool is handed a
 * `ReadSurface` and a write tool a `WriteSurface`, so neither can reach the
 * other's verbs — but the server holds both.
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
import { ReadSurface, WriteSurface } from "../domain";
import { pgEventLog } from "../domain/event-store";
import { commandContext, mockGitContext, mockSessionContext } from "../attribution";
import { TOOLS, WRITE_TOOLS } from "./tools";
import { DOCS_URI, renderToolDocs } from "./docs";

/**
 * Registers every tool against the read surface and a **factory** for the write
 * one. Transport-free, so a test can drive it over `InMemoryTransport` without
 * a subprocess.
 *
 * Both are required. An optional write half would be the read-only mode
 * surviving as an API shape, and a caller that wants a read-only server has one
 * already: `src/cli.ts` builds a `ReadSurface` and nothing else.
 *
 * **A factory rather than an instance, so attribution can be per command.** A
 * surface holds no query state — no constructor and no field of its own beyond
 * `SessionCore`'s three, and the only mutable state in reach is
 * `inTransaction`'s depth counter on the shared `TenantGraph` — so building one
 * per tool call costs a `new` over three references and buys a fresh
 * `git_hash` and session id each time. The alternative was threading a context
 * argument through all eighteen write verbs.
 *
 * The read side stays a single instance on purpose: reads never touch the clock
 * and never emit, so there is nothing per-call for them to carry.
 *
 * Every tool declares an `outputSchema`. This reverses what this comment said
 * until 2026-08-22 — that a mirror of the report interfaces would exist only to
 * go stale against them. The objection was to an *unchecked* mirror; the ones in
 * `./schemas` are held to their interfaces by `tsc`, which is a gate that
 * already runs. What the compiler cannot see — a dropped optional field —
 * `tests/mcp.test.ts` parses for. The structured result is still returned
 * alongside the JSON text an older client reads.
 *
 * Errors are not caught. `whySupported()` refuses an ambiguous proposition by
 * throwing, and the SDK turns a throw into `isError: true` carrying the
 * message — so the refusal reaches the caller as a refusal. Wrapping it here
 * would convert a good refusal into an empty success, which is the one
 * outcome the domain went to trouble to avoid.
 */
export function buildServer(read: ReadSurface, makeWrite: () => WriteSurface): McpServer {
  const server = new McpServer({ name: "labkit", version: "0.0.1" });

  // The tool surface as prose, rendered on each read from the same `TOOLS` the
  // loop below registers. A resource rather than a tool because it takes no
  // arguments and answers nothing about the record -- it describes the server,
  // and a caller should be able to read it before deciding which tool to call.
  //
  // It holds no `read`: a client can fetch this against a server whose database
  // is unreachable, which is when an agent most needs to know what it is
  // talking to.
  server.registerResource(
    "tool-docs",
    DOCS_URI,
    {
      title: "LabKit tools",
      description:
        "Human-readable documentation of every tool this server exposes -- what each " +
        "answers, what it takes and what it returns -- generated from the tool " +
        "declarations themselves, so it cannot fall behind them.",
      mimeType: "text/markdown",
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: renderToolDocs() }],
    }),
  );

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
      respond((args) => definition.handler(read, args)),
    );
  }

  for (const definition of WRITE_TOOLS) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        outputSchema: definition.outputSchema,
      },
      // A surface per call, so each write records the attribution and commit
      // in force at the moment it ran rather than at server start.
      respond((args) => definition.handler(makeWrite(), args)),
    );
  }

  return server;
}

/**
 * The shared handler body: count the call, ship the whole result twice — as
 * JSON text for a client that reads `content`, and as `structuredContent` for
 * one that reads the schema.
 *
 * Errors are deliberately not caught here; see the note on `buildServer`.
 */
function respond(run: (args: Record<string, unknown>) => Promise<unknown>) {
  return async (args: Record<string, unknown>) => {
    inFlight++;
    try {
      const result = await run(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    } finally {
      inFlight--;
    }
  };
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
 * Resolves one tenant, builds the read surface and a per-call write factory,
 * serves over stdio.
 *
 * The tenant is resolved once at the boundary and never again — below it every
 * function takes a resolved context, and there is no "current tenant" anyone
 * can change mid-session.
 */
export async function main(tenant = process.env.LABKIT_TENANT ?? "labkit"): Promise<void> {
  const connection = await connectDb();
  // `tenantCtx`, not `ctx`. There are two contexts in scope below and they are
  // unrelated: this one is which tenant's graph to talk to, and the
  // `CommandContext` further down is who is talking and when.
  const tenantCtx = await resolveTenantContext(connection.db, tenant);

  // One graph, so `inTransaction`'s re-entrancy depth is shared between the
  // halves. This is the composition `src/domain/session.ts` specifies for an
  // adapter that needs both.
  const graph = new TenantGraph(tenantCtx, connection.db);

  // The sink is constructed **here** rather than taken from a surface, and that
  // is load-bearing now that the write half is built per call. It used to be
  // whatever `new WriteSurface(graph)` defaulted to, handed on to the read half
  // as `writes.events`; with a surface per call each one would default to its
  // own fresh log, the read half would hold the first call's, and the stream
  // would fragment silently. Owning it at this level makes the process-scoped
  // sink a decision instead of a consequence of construction order.
  //
  // **Durable now.** It was `inMemoryEventLog()` on the grounds that a store
  // was unearned: the graph is the record, `read.ts` never consulted the log,
  // and the scenarios that mention it assert it is *empty* when a historical
  // answer is read. What earned it is the consumer PJ-031 named — attribution
  // rode on every event and nothing could read it, because the log died with
  // the process.
  //
  // Same connection as the graph, which is the atomicity story: `emit` runs
  // inside each verb's `inTransaction`, so an event and the writes it describes
  // commit together. A second connection would silently end that.
  const events = pgEventLog(connection.db, tenantCtx.tenantId);

  // Providers are sampled per call, not once here, so a long-running server
  // records the commit each piece of work was actually done against. Both are
  // mocks today; `src/attribution.ts` is the single file that changes when they
  // stop being.
  const makeWrite = () =>
    new WriteSurface(graph, {
      ...commandContext(mockGitContext, mockSessionContext),
      events,
    });

  const server = buildServer(new ReadSurface(graph, { events }), makeWrite);

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
async function drainThenExit(
  server: McpServer,
  connection: { close(): Promise<void> },
): Promise<void> {
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
