/**
 * What the caller asked for, written beside the error when a command fails.
 */

/**
 * Long enough that no handle, instant or short label is ever cut; short enough that a paragraph
 * of findings does not fill a terminal.
 */
const KEEP = 120;

/** One line of JSON to stderr — stdout belongs to the program's answer. */
function emit(event: Record<string, unknown>): void {
  process.stderr.write(`${JSON.stringify(event)}\n`);
}

/**
 * Every string cut to {@link KEEP}, structure otherwise preserved.
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
 * Which door a request came through — ports and adapters, and these are the adapters.
 */
export type Adapter = "cli" | "mcp-stdio" | "mcp-http";

/**
 * Writes the failed request beside its error.
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
