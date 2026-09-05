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
 * live is the ordinary workflow, not an edge case. Several agents at once is
 * the rarer reason. See {@link main}.
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
 * **`session` is required for the same reason, and it is the newer half of that
 * argument.** It could default to a fresh {@link sessionRegistry}, and then a
 * caller who forgot it would get a server whose write gate is armed but whose
 * registration nothing can reach — or, worse, an optional-and-absent form
 * meaning *no gate*, which is a safety property shipping switched off by
 * default. Requiring it means every construction site, tests included, goes
 * through the path that ships. `main()` owns the one real registry, exactly as
 * it owns the one real event log and for the same reason: a component that
 * defaults its own gives two halves of one call two different answers.
 *
 * **`readOnly` hides the write tools, where the registration gate refuses
 * them, and the difference is *not yet* against *not here*.** An unregistered
 * caller has a remedy and the refusal names it; a caller on a read-only server
 * has none, so a shorter `tools/list` is the honest description rather than a
 * refusal that could only say "no". A tool absent from the list is
 * indistinguishable from a server that never had it — which is the objection to
 * hiding in the gate's case and the *point* here.
 *
 * **`register_session` goes with them.** It exists to open a gate this server
 * has nothing behind, so a visible one would be a tool whose effect nothing can
 * observe — and an agent that registered and then found itself unable to write
 * would have been told, by the tool list, that writing was possible.
 *
 * It is decided at construction and never changes, which is the other half of
 * the argument: `disable()` and `sendToolListChanged()` exist, but Claude
 * Desktop is not believed to handle the notification, and a client that ignores
 * it caches whatever list it first saw. A list that is static from the first
 * `tools/list` needs no notification to be correct.
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
 * The read half is built per call too. Reads never touch the clock and never
 * emit, so there is nothing per-call for them to carry — but they do read
 * through a connection, and that is per call for both.
 *
 * Every tool declares an `outputSchema`. A mirror of the report interfaces
 * would exist only to go stale against them if nothing checked it; the ones in
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
export function buildServer(
  withSurfaces: WithSurfaces,
  session: SessionRegistry,
  { readOnly = false }: { readOnly?: boolean } = {},
): McpServer {
  // The package's version, not a constant: `serverInfo.version` is what the
  // MCP spec has for "which build am I talking to", and a client displaying a
  // hardcoded one reads as sourced while being wrong. It said `0.0.1` from
  // before the first release until 2026-09-05, while `labkit --version` was
  // right — one binary, two surfaces, disagreeing about what they were.
  //
  // The same bundled import the CLI uses (`src/cli/program.ts`), so a compiled
  // binary carries the value inlined rather than reading a file that is not
  // there — `import ... with { type: "json" }` is resolved at build time, which
  // is why this needs none of `src/db/migrations.ts`'s asset handover.
  const server = new McpServer({ name: "labkit", version: pkg.version });

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

  // **First in the list, deliberately.** `tools/list` is served in
  // registration order, and this is the only tool whose absence makes every
  // write refuse — an agent scanning the list meets it before the verbs it
  // gates rather than two thirds of the way down.
  // **Registered before the reads, because `tools/list` is served in
  // registration order** and this is the only tool whose absence makes every
  // write refuse — an agent scanning the list meets it before the verbs it
  // gates rather than two thirds of the way down.
  //
  // Still behind the read-only check: a server with no write tools has nothing
  // for a session to sign, and offering to register one would promise a
  // capability that server does not have.
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
      // A surface per call, so each write records the attribution and commit
      // in force at the moment it ran rather than at server start.
      //
      // **Inside `respond`, so a blocked write reaches the operator's stderr.**
      // The refusal could sit outside it and log nothing, which would be
      // quieter; but the failure this gate creates is *"my agent cannot
      // write"*, and the person diagnosing that wants to see which tool was
      // called with what. `logFailedRequest` is already the answer to exactly
      // that question for every other failure here.
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
 *
 * **Not a permission check, and this is where someone would later assume
 * otherwise.** Any agent can register any string — LabKit does not verify it
 * and could not. This stops an agent *forgetting* to sign, never lying about
 * the signature. A gate on anonymity, not on authority.
 *
 * What it refuses is real, which is this repo's bar for a refusal. Without it
 * the write lands stamped `mock-session-0` (`src/attribution.ts`) — the same
 * value for every agent on every machine, in the identity column of a record
 * whose entire purpose is provenance. A uniform placeholder is worse than an
 * empty field: empty reads as unknown, this reads as known.
 *
 * The message names the remedy, which is why this refuses rather than hiding
 * the tool. A tool absent from `tools/list` is indistinguishable from a server
 * that never had it, and teaches the caller nothing.
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
 * The shared handler body: count the call, ship the whole result twice — as
 * JSON text for a client that reads `content`, and as `structuredContent` for
 * one that reads the schema.
 *
 * **Errors are still not caught here**, which is the note on `buildServer` and
 * has not changed: the SDK turns a throw into `isError: true` and the agent is
 * told. What is added is a line on *stderr* naming the arguments that failed —
 * `rethrow`, not `catch`. A stack trace says where a tool broke and nothing
 * about what it was given, and `args` is the request as the client sent it,
 * before any schema has taken it apart. See `src/request-log.ts` for why the
 * stream is the whole of what makes this safe.
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
 * The composition every surface is built through: connect, resolve the tenant,
 * step down, hand a tool both halves, close.
 *
 * **Extracted from {@link main} on 2026-08-28 so a second transport cannot fork
 * it.** Wiring an HTTP server meant either calling this or writing it again,
 * and writing it again is the copy this repository deletes on sight — six
 * paragraphs of argument about transaction scope, tenant pinning and which mock
 * is still a mock, in two places, going stale independently. `main()` is the
 * stdio call site now rather than the only one.
 *
 * **`session` is a parameter, and that is the whole of what a second transport
 * changes.** Over stdio one registry per process is one registry per client,
 * because the client owns the process. Over HTTP one process serves many, so
 * the registry belongs to whatever that transport calls a session — and taking
 * it as an argument is what lets a caller decide that without touching this
 * function. One registry shared across connections would stamp every agent's
 * writes with whichever registered first, which reads as true and is not.
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

      // **Durable, and on the same connection as the graph** — that is the
      // atomicity story: `emit` runs inside each verb's `inTransaction`, so an
      // event and the writes it describes commit together. A second connection
      // would silently end that.
      //
      // The graph is the record and `read.ts` never consults the log, so the
      // store is earned by attribution rather than by history: it rides on every
      // event, and an in-memory log dies with the process before anything can
      // read it. It must be built here rather than left to a surface's default:
      // a surface defaulting its own log would give the two halves of one call
      // separate streams.
      const events = pgEventLog(connection.db, tenantCtx.tenantId);

      // Providers are sampled per call, so a long-running server records the
      // commit each piece of work was actually done against — and, now, the
      // agent that was registered at that moment rather than at server start.
      //
      // **One is still a mock and one is not.** `git_hash` stays forty zeros:
      // the protocol carries no commit, and asking the caller for one would buy
      // a value nothing could ever contradict. A session id is different — it
      // is checkable in principle against a bus that knows its sessions, which
      // is why it is worth taking on the caller's word and `git_hash` is not.
      //
      // `registeredSession` falls back to the mock when nobody has registered;
      // `requireRegistered` is what stops that fallback ever reaching an event,
      // and `tests/mcp.test.ts` asserts the pair.
      return await work({
        read: new ReadSurface(graph, { events }),
        write: new WriteSurface(graph, {
          ...commandContext(mockGitContext, registeredSession(session)),
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
 * reconciliation pass, so paying it per call is a feature rather than a tax.
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

  // A client shuts an MCP stdio server down by closing its stdin, and nothing
  // else does. `StdioServerTransport` subscribes to stdin's `data` and `error`
  // only — never `end` — so its `onclose` fires when someone calls `close()`
  // and at no other time.
  //
  // **What keeps the process alive is the stdin subscription, not a held
  // database connection** — there is no held connection to fall back on.
  // Measured under Bun 1.3.14: a process whose only handle is a `data` listener
  // on stdin stays up indefinitely and keeps answering.
  //
  // Measure it without a pipe. `$?` after a pipeline is the *last* command's
  // status, so a check ending in `| wc -l` reports the pipe's success and not
  // the server's.
  process.stdin.on("end", () => {
    void drainThenExit(server);
  });

  // **Never settles, and that is the contract.** `src/cli/cli.ts` ends with
  // `process.exit(await main())`, so a promise that resolves once the transport
  // is connected makes `labkit mcp` connect, return, and exit **0 with no
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
