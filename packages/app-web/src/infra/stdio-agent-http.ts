/**
 * An ACP agent that speaks stdio, served over ACP's Streamable HTTP transport at `/acp`. Each ACP
 * connection runs its own agent process, started when the client sends `initialize`. The bridge
 * relays every JSON-RPC message between the connection and the process's stdin and stdout without
 * changing it; effective-acp's `Http.serve` routes each message to the connection's or the
 * session's event stream. A line from either side that is not JSON-RPC is logged as a warning, with
 * its text, and is not relayed. The process's stderr lines are logged at INFO.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { type Duration, Effect, Predicate, Stream } from "effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as Http from "effective-acp/http";
import { type JsonRpcMessage, type Wire, WireInput } from "effective-acp/json-rpc";
import { fromWebStreams } from "effective-acp/stdio";

/** The shortest bearer token accepted. */
export const minimumTokenLength = 32;

/** How long a stopped connection's agent process has to exit after its stdin closes, before SIGTERM. */
export const stopGraceMs = 5000;

export interface StdioAgentHttpOptions {
  /** The agent's command line: the program, then its arguments. One process runs per ACP connection. */
  readonly command: readonly [string, ...string[]];
  /** The agent processes' working folder. */
  readonly cwd: string;
  /** The agent processes' whole environment. Nothing else from the bridge's environment is added. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The bearer token that every request must carry: at least `minimumTokenLength` characters. */
  readonly token: string;
  /**
   * How long a connection may have no event stream open before it is ended, which stops its agent
   * process: effective-acp's `abandonedAfter`, whose default is 60 seconds.
   */
  readonly abandonedAfter?: Duration.Input;
}

export interface StdioAgentHttp {
  /** Answers one HTTP request to the bridge. */
  readonly fetch: (request: Request) => Promise<Response>;
  /** Ends every open connection and stops its agent process. */
  readonly close: () => Promise<void>;
}

/** Which side of a connection a message came from. */
type Side = "client" | "agent";

const isSingleMessage = (value: unknown): value is JsonRpcMessage =>
  Predicate.isObject(value) &&
  "jsonrpc" in value &&
  value.jsonrpc === "2.0" &&
  (("method" in value && typeof value.method === "string") ||
    "result" in value ||
    "error" in value);

const isMessage = (value: unknown): value is JsonRpcMessage | ReadonlyArray<JsonRpcMessage> =>
  Array.isArray(value) ? value.length > 0 && value.every(isSingleMessage) : isSingleMessage(value);

/**
 * Writes each message that `from` reads to `to`, until `from` ends or either side fails. `noted`
 * runs before each JSON-RPC message is written.
 */
const relay = (
  from: Wire,
  to: Wire,
  side: Side,
  noted: (message: JsonRpcMessage) => Effect.Effect<void>,
): Effect.Effect<void> =>
  from.read.pipe(
    Stream.runForEach(
      WireInput.$match({
        Json: ({ value }) =>
          isMessage(value)
            ? Effect.forEach(Array.isArray(value) ? value : [value], noted, {
                discard: true,
              }).pipe(Effect.andThen(to.write(value)))
            : Effect.logWarning("agent-http.message.not-relayed", {
                from: side,
                reason: "the value is not a JSON-RPC 2.0 message",
                value,
              }),
        Unparsable: ({ text }) =>
          Effect.logWarning("agent-http.message.not-relayed", {
            from: side,
            reason: "the line is not JSON",
            text,
          }),
      }),
    ),
    Effect.catch((error) =>
      Effect.logWarning("agent-http.relay.failed", {
        from: side,
        reason: error.reason,
        cause: error.cause,
      }),
    ),
  );

/**
 * The process's stdin as a `WritableStream`: each chunk is flushed before the next is written.
 * `closeStdin` ends it, not the stream.
 */
const writableOf = (sink: Bun.FileSink): WritableStream<Uint8Array> =>
  new WritableStream({
    write: async (chunk) => {
      sink.write(chunk);
      await sink.flush();
    },
  });

type AgentProcess = Bun.Subprocess<"pipe", "pipe", "pipe">;

const hasExited = (child: AgentProcess): boolean =>
  child.exitCode !== null || child.signalCode !== null;

const stdinClosed = new WeakSet<AgentProcess>();

/** Closes the process's stdin, once; an agent on stdio exits when its stdin closes. */
const closeStdin = (child: AgentProcess): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (stdinClosed.has(child) || hasExited(child)) return;
    stdinClosed.add(child);
    yield* Effect.tryPromise(async () => {
      await child.stdin.end();
    }).pipe(
      Effect.catch((cause) =>
        Effect.logWarning("agent-http.agent.stdin-not-closed", { pid: child.pid, cause }),
      ),
    );
  });

const exitWithin = (child: AgentProcess) =>
  Effect.promise(() => child.exited).pipe(Effect.timeoutOption(stopGraceMs));

/**
 * Closes stdin and waits up to `stopGraceMs` for the process to exit. If it has not, sends SIGTERM
 * and waits as long again, then sends SIGKILL. Returns once the process has exited.
 */
const stop = (child: AgentProcess): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (hasExited(child)) return;
    yield* closeStdin(child);
    const exited = yield* exitWithin(child);
    if (exited._tag === "Some") {
      yield* Effect.logInfo("agent-http.agent.stopped", {
        pid: child.pid,
        how: "its stdin was closed",
        exitCode: exited.value,
      });
      return;
    }
    child.kill("SIGTERM");
    const terminated = yield* exitWithin(child);
    if (terminated._tag === "None") child.kill("SIGKILL");
    yield* Effect.logWarning("agent-http.agent.stopped", {
      pid: child.pid,
      how:
        terminated._tag === "Some"
          ? `sent SIGTERM: it had not exited ${stopGraceMs} ms after its stdin was closed`
          : `sent SIGKILL: it had not exited ${stopGraceMs} ms after SIGTERM`,
    });
    yield* Effect.promise(() => child.exited);
  });

interface AgentRun {
  readonly child: AgentProcess;
  /** Stops the process (`stop`); every run after the first waits for the first. */
  readonly stop: Effect.Effect<void>;
}

/** Starts the agent process for one connection; the scope stops it. */
const started = (options: StdioAgentHttpOptions) =>
  Effect.acquireRelease(
    Effect.try({
      try: (): AgentProcess =>
        Bun.spawn([...options.command], {
          cwd: options.cwd,
          env: options.env,
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        }),
      catch: (cause) => cause,
    }).pipe(
      Effect.flatMap((child) =>
        Effect.map(Effect.cached(stop(child)), (stopOnce): AgentRun => ({ child, stop: stopOnce })),
      ),
    ),
    (run) => run.stop,
  );

/** The connection whose agent process has a session open, and how to stop that process. */
interface SessionHolder {
  readonly connection: string;
  readonly stop: Effect.Effect<void>;
}

/** Each session's holder. An agent process locks the sessions it has open. */
type Holders = Map<string, SessionHolder>;

const sessionIdOf = (params: unknown): string | undefined =>
  Predicate.isObject(params) && typeof params.sessionId === "string" ? params.sessionId : undefined;

/**
 * Notes, for one connection, which sessions its agent process holds: those it creates and those it
 * is asked to load or resume. When a session is held by another connection's process, that process
 * is stopped before the request is relayed, because labkit-effect refuses to open a session that
 * another running process has open. The newest connection to ask for a session wins, as when a page
 * is reloaded without its old connection having been deleted.
 */
const sessionClaims = (holders: Holders, holder: SessionHolder) => {
  const creating = new Set<unknown>();
  const claim = (sessionId: string) =>
    Effect.gen(function* () {
      const previous = holders.get(sessionId);
      holders.set(sessionId, holder);
      if (previous === undefined || previous.connection === holder.connection) return;
      yield* Effect.logWarning("agent-http.session.taken-over", {
        session: sessionId,
        from: previous.connection,
        reason: "a newer connection asked for the session, and one agent process may hold it",
        action: "stopped the older connection's agent process before relaying the request",
      });
      yield* previous.stop;
    });
  return {
    fromClient: (message: JsonRpcMessage): Effect.Effect<void> => {
      if (!("method" in message) || !("id" in message)) return Effect.void;
      if (message.method === "session/new") creating.add(message.id);
      const asked = sessionIdOf(message.params);
      return (message.method === "session/load" || message.method === "session/resume") &&
        asked !== undefined
        ? claim(asked)
        : Effect.void;
    },
    fromAgent: (message: JsonRpcMessage): Effect.Effect<void> => {
      if ("method" in message || !creating.delete(message.id) || !("result" in message))
        return Effect.void;
      const created = sessionIdOf(message.result);
      return created === undefined ? Effect.void : claim(created);
    },
    release: Effect.sync(() => {
      for (const [sessionId, current] of holders) if (current === holder) holders.delete(sessionId);
    }),
  };
};

const logLines = (child: AgentProcess): Effect.Effect<void> =>
  Stream.fromReadableStream({ evaluate: () => child.stderr, onError: (cause) => cause }).pipe(
    Stream.decodeText,
    Stream.splitLines,
    Stream.runForEach((line) =>
      Effect.logInfo("agent-http.agent.stderr", { pid: child.pid, line }),
    ),
    Effect.catch((cause) =>
      Effect.logWarning("agent-http.agent.stderr-failed", { pid: child.pid, cause }),
    ),
  );

/**
 * One ACP connection: its own agent process, with messages relayed both ways. When the agent
 * process exits first, the connection ends, and a non-zero exit code is logged as an error. When
 * the client deletes the connection, or the bridge closes, the scope stops the process (`stop`).
 */
const connection = (
  options: StdioAgentHttpOptions,
  client: Wire,
  connectionId: string,
  holders: Holders,
) =>
  Effect.gen(function* () {
    const spawned = yield* Effect.result(started(options));
    if (spawned._tag === "Failure") {
      yield* Effect.logError("agent-http.agent.not-started", {
        command: options.command,
        cwd: options.cwd,
        cause: spawned.failure,
      });
      return;
    }
    const { child } = spawned.success;
    const claims = sessionClaims(holders, { connection: connectionId, stop: spawned.success.stop });
    yield* Effect.addFinalizer(() => claims.release);
    yield* Effect.logInfo("agent-http.agent.started", {
      pid: child.pid,
      command: options.command,
      cwd: options.cwd,
    });
    const agent = fromWebStreams(child.stdout, writableOf(child.stdin));
    yield* Effect.forkScoped(logLines(child));
    // The client's side ends on DELETE: closing stdin is how an editor tells the agent to exit.
    yield* Effect.forkScoped(
      relay(client, agent, "client", claims.fromClient).pipe(Effect.ensuring(closeStdin(child))),
    );
    yield* relay(agent, client, "agent", claims.fromAgent);
    const exitCode = yield* Effect.promise(() => child.exited);
    const exited = { pid: child.pid, exitCode, signal: child.signalCode };
    yield* exitCode === 0
      ? Effect.logInfo("agent-http.agent.exited", exited)
      : Effect.logError("agent-http.agent.exited", exited);
  });

const digest = (text: string): Buffer => createHash("sha256").update(text).digest();

/**
 * Serves the agent that `options.command` starts, one process per ACP connection. A request without
 * `Authorization: Bearer <token>` is answered 401 and logged as a warning.
 */
export function stdioAgentHttp(options: StdioAgentHttpOptions): StdioAgentHttp {
  if (options.token.length < minimumTokenLength)
    throw new Error(
      `The bridge's bearer token has ${options.token.length} characters; it needs at least ${minimumTokenLength}`,
    );
  const expected = digest(options.token);
  const holders: Holders = new Map();
  const { handler, dispose } = HttpRouter.toWebHandler(
    Http.serve({
      abandonedAfter: options.abandonedAfter,
      onConnection: (client, { id }) =>
        connection(options, client, id, holders).pipe(Effect.annotateLogs({ connection: id })),
    }),
  );

  const refusal = (header: string | null): string | undefined => {
    const bearer = header === null ? undefined : /^Bearer +(\S+) *$/i.exec(header)?.[1];
    if (bearer === undefined) return "the request has no Authorization header of scheme Bearer";
    return timingSafeEqual(digest(bearer), expected)
      ? undefined
      : "the bearer token does not match the bridge's token";
  };

  return {
    fetch: async (request) => {
      const refused = refusal(request.headers.get("authorization"));
      if (refused === undefined) return handler(request);
      await Effect.runPromise(
        Effect.logWarning("agent-http.request.refused", {
          method: request.method,
          path: new URL(request.url).pathname,
          status: 401,
          reason: refused,
        }),
      );
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer" },
      });
    },
    close: dispose,
  };
}
