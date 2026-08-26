#!/usr/bin/env bun
/**
 * The MCP server — the door an agent works through.
 *
 * The CLI next door is for a person at a terminal and renders prose by default.
 * This server is for an agent and returns the **whole** structured report every
 * time. Both read and write — the CLI's read-only era ended for the same reason
 * this server's did. Returning the report entire is deliberate
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
 * **It holds no database connection between tool calls**, and that is forced
 * rather than chosen: the embedded PGlite file is single-writer, so a process
 * holding it locks every *other* process out of the project. Usually that other
 * process is a person: `labkit known` in a terminal while an agent session is
 * live is the ordinary workflow, not an edge case. Several agents at once is the
 * rarer reason and was the only one written down until 2026-08-26. See
 * {@link main}.
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
import { scopeToTenant } from "../db/scoped";
import { TenantGraph } from "../db/graph";
import { ReadSurface, WriteSurface } from "../domain";
import { pgEventLog } from "../domain/event-store";
import { commandContext, mockGitContext, mockSessionContext } from "../attribution";
import { TOOLS, WRITE_TOOLS } from "./tools";
import { DOCS_URI, renderToolDocs } from "./docs";

/**
 * Everything a tool call needs, for the duration of that call and no longer.
 *
 * Expressed as a scope rather than as two values because acquiring the database
 * is part of it: {@link main} opens a connection inside this function and closes
 * it in a `finally`, so a handler cannot outlive the connection it read through
 * and nothing else can be holding the file while an agent is idle. A test
 * supplies surfaces over a scenario graph and ignores the scoping entirely.
 */
export type WithSurfaces = <T>(
  work: (surfaces: { read: ReadSurface; write: WriteSurface }) => Promise<T>,
) => Promise<T>;

/**
 * Registers every tool against a **scope** that yields both surfaces.
 * Transport-free, so a test can drive it over `InMemoryTransport` without a
 * subprocess.
 *
 * Both halves are required. An optional write half would be the read-only mode
 * surviving as an API shape.
 *
 * **Per call rather than per server, so attribution and the connection are
 * both per command.** A surface holds no query state — no constructor and no
 * field of its own beyond `SessionCore`'s three — so building one per tool call
 * costs a `new` over three references and buys a fresh `git_hash` and session
 * id each time. The alternative was threading a context argument through all
 * eighteen write verbs. What made the scope a scope rather than a factory is
 * the connection: it has to be released between calls, so something has to own
 * a `finally`.
 *
 * The read half is built per call too, which it did not used to be. Reads never
 * touch the clock and never emit, so there was nothing per-call for them to
 * carry — but they do read through a connection, and that is now per call for
 * both.
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
export function buildServer(withSurfaces: WithSurfaces): McpServer {
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
      respond((args) => withSurfaces(({ read }) => definition.handler(read, args))),
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
      respond((args) => withSurfaces(({ write }) => definition.handler(write, args))),
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
 * Serves over stdio, opening and releasing the database around each tool call.
 *
 * **Does not return.** The promise settles only by the process exiting; see the
 * end of the function.
 *
 * **Nothing is held between calls, and that is the point.** The embedded PGlite
 * file is single-writer: a process that keeps it open locks every other process
 * out of the project for as long as it lives, and the use case is several
 * agents working one project at once. An MCP server lives as long as its agent's
 * session, so holding the file for that long is the one thing it must not do.
 *
 * The cost is a lock, an open, a migration no-op and a tenant resolution per
 * call — **80-96ms warm**, measured 2026-08-26 (open 70-85ms, migrate 2ms,
 * resolve 7-8ms, close 2ms). That is noise against the domain work inside one
 * tool call, and two overlapping calls serialise on the lock rather than racing
 * the file.
 *
 * The tenant is resolved inside each scope and never cached: below the boundary
 * every function takes a resolved context, and there is no "current tenant"
 * anyone can change mid-session. Resolution is also the self-healing
 * reconciliation pass PJ-005 argued for, so paying it per call is a feature
 * rather than a tax.
 */
export async function main(tenant = process.env.LABKIT_TENANT ?? "labkit"): Promise<void> {
  const withSurfaces: WithSurfaces = async (work) => {
    const connection = await connectDb();
    try {
      // `tenantCtx`, not `ctx`. There are two contexts in scope here and they
      // are unrelated: this one is which tenant's graph to talk to, and the
      // `CommandContext` below is who is talking and when.
      const tenantCtx = await resolveTenantContext(connection.db, tenant);

      // Superuser work is done: `LOAD 'age'` and the graph DDL both needed it.
      // From here the session is `labkit_app` with its tenant pinned, so a tool
      // that forgets to filter still cannot read another tenant's events. See
      // src/db/scoped.ts for what that is and is not worth.
      await scopeToTenant(connection.db, tenantCtx);

      // One graph for both halves, so `inTransaction`'s re-entrancy depth is
      // shared. This is the composition `src/domain/session.ts` specifies for
      // an adapter that needs both.
      const graph = new TenantGraph(tenantCtx, connection.db, connection.tx);

      // **Durable, and on the same connection as the graph** — that is the
      // atomicity story: `emit` runs inside each verb's `inTransaction`, so an
      // event and the writes it describes commit together. A second connection
      // would silently end that.
      //
      // It was `inMemoryEventLog()` on the grounds that a store was unearned:
      // the graph is the record, `read.ts` never consulted the log, and the
      // scenarios that mention it assert it is *empty* when a historical answer
      // is read. What earned it is the consumer PJ-031 named — attribution rode
      // on every event and nothing could read it, because the log died with the
      // process. It must be built here rather than left to a surface's default:
      // a surface defaulting its own log would give the two halves of one call
      // separate streams.
      const events = pgEventLog(connection.db, tenantCtx.tenantId);

      // Providers are sampled per call, so a long-running server records the
      // commit each piece of work was actually done against. Both are mocks
      // today; `src/attribution.ts` is the single file that changes when they
      // stop being.
      return await work({
        read: new ReadSurface(graph, { events }),
        write: new WriteSurface(graph, {
          ...commandContext(mockGitContext, mockSessionContext),
          events,
        }),
      });
    } finally {
      await connection.close();
    }
  };

  const server = buildServer(withSurfaces);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // A client shuts an MCP stdio server down by closing its stdin, and nothing
  // else does. `StdioServerTransport` subscribes to stdin's `data` and `error`
  // only — never `end` — so its `onclose` fires when someone calls `close()`
  // and at no other time.
  //
  // **What keeps the process alive is the stdin subscription, not a held
  // database connection**, which matters now that there is no held connection
  // to fall back on. The comment here used to credit the connection; measured
  // under Bun 1.3.14, a process whose only handle is a `data` listener on
  // stdin stays up indefinitely and keeps answering.
  //
  // The first attempt at this hung `transport.onclose` off the transport and
  // was dead code. It was "verified" by a pipeline whose exit status came from
  // `wc -l` rather than from the server -- the trap CLAUDE.md documents, walked
  // straight into. Measured without the pipe, the process sat there for the
  // full 15 seconds.
  process.stdin.on("end", () => {
    void drainThenExit(server);
  });

  // **Never settles, and that is the contract.** `main()` used to resolve as
  // soon as the transport was connected, on the reasoning that the stdin
  // subscription keeps the process alive — true when this file was the entry
  // point, and false the moment it became one. `src/cli/cli.ts` ends with
  // `process.exit(await main())`, so a resolving promise here meant the
  // compiled binary's `labkit mcp` connected, returned, and exited **0 with no
  // output** before answering a single request.
  //
  // Serving ends by `process.exit` inside `drainThenExit`, so there is nothing
  // for this to resolve *with*. Saying so in the type is what stops the next
  // caller assuming otherwise.
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
