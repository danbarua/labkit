/**
 * What the caller asked for, written beside the error when a command fails.
 *
 * A stack trace says where a command broke and says nothing about what it was
 * given. For LabKit that is most of the diagnosis: the surfaces take parsed
 * request objects, so *"which input produced this"* is a question about the DTO
 * and nothing else in the process records it.
 *
 * **At the composition root, on the request as parsed** — `src/cli/cli.ts` and
 * `src/mcp/server.ts`. Not inside a verb: by then the request has been taken
 * apart, and a parse failure never reaches one at all, which is the case this
 * is most useful for.
 *
 * ## stderr, and why that resolves a conflict rather than creating one
 *
 * This repository already refuses to log request values in two places, for a
 * good reason. `unwrapped()` (`src/db/orm.ts`) rethrows the driver's error in
 * place of drizzle's, because drizzle's message is
 * `Failed query: <sql>\nparams: <values>` and LabKit binds propositions,
 * findings and verdicts; `src/db/trace.ts` shortens SQL and never prints its
 * parameters. `src/mcp/server.ts` deliberately does not catch, so an error
 * *message* travels verbatim to the calling agent as `isError: true`.
 *
 * The distinction that makes this safe is the **stream**, not the content:
 *
 * | | goes to | read by |
 * | --- | --- | --- |
 * | the error message | the MCP response, or stdout | the calling agent |
 * | this line | stderr | the operator who ran the process |
 *
 * So the existing rule is unchanged — nothing here widens what reaches an
 * agent. The operator's own request, on the operator's own stderr, is a
 * different thing from a value smuggled into a message that leaves the machine.
 *
 * ## Truncation, and the type that could not do it
 *
 * `Prose` is the taxonomy member that says *"a string LabKit reads and writes
 * and never applies logic to"*, and it is exactly what should be truncated.
 * **It cannot be inspected**: `src/db/domain.ts` declares
 * `export type Prose = string`, a plain alias, so it is erased before any of
 * this runs. All five members of the taxonomy are.
 *
 * What survives to runtime is **length**, and among *domain values* it agrees
 * with the taxonomy rather than approximating it. Every other class is short by
 * construction: a handle is a prefix and a number (`CEVAL_1234`, and the
 * longest prefix in `NODE_TYPES` is five characters), a `Timestamp` is an ISO
 * instant at 24, an `IndexedString` is indexed and therefore bounded in
 * practice. Prose is the only *domain* class that can be long, so a length cut
 * takes prose and leaves the rest whole.
 *
 * **It is not only prose that gets cut, and the first run of this proved it.**
 * A `--db` argument is a filesystem path and went over the limit immediately —
 * paths are not in the taxonomy at all, because they are not stored. So this is
 * a bound on output, which happens to coincide with the prose/not-prose line
 * for everything the record holds. Stated that way rather than as the stronger
 * claim it was first written with, which one command falsified.
 *
 * A cut value keeps its original length in the output, so nothing is elided
 * silently and *"was this truncated or actually short"* is never a question.
 */

/**
 * Long enough that no handle, instant or short label is ever cut; short enough
 * that a paragraph of findings does not fill a terminal. A cut value keeps its
 * length, because *"was the input truncated, or was it actually empty"* is the
 * first question a reader of one of these lines asks.
 */
const KEEP = 120;

/** One line of JSON to stderr — stdout belongs to the program's answer. */
function emit(event: Record<string, unknown>): void {
  process.stderr.write(`${JSON.stringify(event)}\n`);
}

/**
 * Every string cut to {@link KEEP}, structure otherwise preserved.
 *
 * Recurses rather than flattening, because the shape of a request is half of
 * what makes it recognisable — `{concludes: [{proposition, finding}]}` says
 * which verb was called even with both strings elided.
 *
 * Depth-limited and cycle-safe: a request object arrives from `commander` or
 * from an MCP client, and neither is trusted to be a tree. A diagnostic that
 * can hang on its own input is worse than no diagnostic.
 */
export function truncated(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return value.length > KEEP ? `${value.slice(0, KEEP)}… (${value.length} chars)` : value;
  }
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  if (depth >= 6) return "[deep]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => truncated(v, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = truncated(v, depth + 1, seen);
  return out;
}

/**
 * Which door a request came through — ports and adapters, and these are the
 * adapters.
 *
 * **Named `adapter` because it was `surface`, and `surface` is taken.**
 * `ReadSurface` and `WriteSurface` are the read and write halves of the domain,
 * 78 references' worth, so `surface: "mcp"` was a field whose value came from a
 * different axis than its name. CLAUDE.md's architecture section already calls
 * these *"two adapters over one domain"*, so this is the repository's own word
 * rather than a borrowed one.
 *
 * **It is not the actor, and the name has to keep saying so.** This sits beside
 * `attribution_id` wherever it goes next, and the reason the two exist
 * separately is that *who acted* and *how they reached us* are different
 * questions that have already been merged once. A name like `accessed_by` reads
 * as an answer to the first.
 *
 * **The mcp split is by transport because #91 made it load-bearing.** One
 * process per client (stdio) and one process serving many (http) is exactly the
 * difference that produced a shared session registry writing one agent's name
 * onto another's work. A reader who cannot separate them cannot see that class
 * of defect.
 *
 * `mcp-http` has no producer yet and is declared anyway — unusually, and for a
 * stated reason: it is the value whose *absence* a reader would otherwise take
 * as evidence, and the peer session's HTTP work will emit it. If that work is
 * abandoned, this value goes with it.
 */
export type Adapter = "cli" | "mcp-stdio" | "mcp-http";

/**
 * Writes the failed request beside its error.
 *
 * Takes the error rather than throwing or formatting it: the caller decides
 * what the *user* sees, which differs between a CLI and an MCP server, and this
 * only ever adds a line to the log.
 *
 * `request` stays `unknown`: each adapter logs a different shape — the CLI its
 * `argv`, the server its tool name and arguments — and the one field they share
 * is typed by {@link Adapter} at the call site rather than by a wrapper here
 * that would have to know both.
 */
export function logFailedRequest(request: unknown, error: unknown): void {
  const e = error as { message?: string; code?: string; name?: string };
  emit({
    labkit: "request-failed",
    at: new Date().toISOString(),
    request: truncated(request),
    error: {
      name: e?.name ?? typeof error,
      message: typeof e?.message === "string" ? e.message : String(error),
      // SQLSTATE where there is one. The whole point of `unwrapped()` is that
      // this survives, so a reader can tell 23505 from 42501 without the
      // message being parsed.
      ...(e?.code === undefined ? {} : { code: e.code }),
    },
  });
}
