/**
 * Optional query tracing, off unless asked for.
 *
 * **Why this exists.** Two separate investigations into the same intermittent
 * test failure each began by hand-instrumenting `tests/helpers/db.ts`, and
 * three documents — `CLAUDE.md`, `docs/TASKS.md` and that helper's own header —
 * asserted a wrong cause in the meantime. What finally settled it was
 * measurable in one run once the instrumentation existed: every query tracked
 * from start to completion, so "it hangs" could be answered with *59,086
 * queries, zero unfinished* rather than argued.
 *
 * The two numbers that did the work are the two this module records. **In-flight
 * queries outstanding past a threshold** is what turns "it hung" into "nothing
 * hung" — a negative result no post-mortem log can produce, because a query that
 * never completes never writes a completion line. **Per-connection counts and
 * durations** is what turned a 5-second timeout into "311 sequential queries
 * summing 4.955s of real round trips", which located the cost in provisioning
 * rather than in any stall.
 *
 * **Zero cost when off.** `traced()` returns the connection it was handed,
 * unwrapped, so a disabled trace is one env-var read at construction and no
 * per-query work at all. The check is never made per query.
 *
 * ```sh
 * LABKIT_TRACE=1 bun test                      # slow queries + a stuck-query watchdog
 * LABKIT_TRACE=1 LABKIT_TRACE_SLOW_MS=200 …    # lower the slow threshold
 * LABKIT_TRACE=all bun test 2> queries.jsonl   # every query, one JSON object per line
 * ```
 *
 * **Parameters are never logged.** They carry research content — propositions,
 * findings, verdicts — and a trace file is a debugging artefact that gets pasted
 * into issues and chat. SQL text is truncated for the same reason.
 */
import type { LabKitDB } from "./client";

interface TraceOptions {
  /** Log completed queries at or above this duration. Default 1000ms. */
  slowMs: number;
  /** Report queries still in flight at or above this age. Default 3000ms. */
  stuckMs: number;
  /** Log every query, not only slow ones. */
  all: boolean;
}

function options(): TraceOptions | null {
  const on = process.env.LABKIT_TRACE;
  if (!on || on === "0" || on === "false") return null;
  const num = (name: string, fallback: number) => {
    const raw = process.env[name];
    const parsed = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    slowMs: num("LABKIT_TRACE_SLOW_MS", 1000),
    stuckMs: num("LABKIT_TRACE_STUCK_MS", 3000),
    all: on === "all",
  };
}

interface InFlight {
  connection: string;
  sql: string;
  startedAt: number;
}

/** One line of JSON per event, to stderr — stdout belongs to the program. */
function emit(event: Record<string, unknown>): void {
  process.stderr.write(`${JSON.stringify(event)}\n`);
}

/** Enough of the statement to recognise it; never the parameters. */
function shorten(sql: string): string {
  const flat = sql.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
}

const inFlight = new Map<number, InFlight>();
let nextQueryId = 0;
let watchdog: ReturnType<typeof setInterval> | undefined;

/**
 * One shared watchdog for every traced connection, started lazily.
 *
 * `unref()` so it can never hold a process open — a debugging aid that stops a
 * test run from exiting would be worse than no aid at all.
 */
function ensureWatchdog(stuckMs: number): void {
  if (watchdog) return;
  watchdog = setInterval(() => {
    const now = performance.now();
    for (const [id, q] of inFlight) {
      const age = now - q.startedAt;
      if (age >= stuckMs) {
        emit({
          trace: "stuck",
          id,
          connection: q.connection,
          ageMs: Math.round(age),
          sql: q.sql,
        });
      }
    }
  }, Math.max(250, stuckMs / 4));
  watchdog.unref?.();
}

/**
 * What is in flight right now, as a snapshot.
 *
 * The watchdog above is the production consumer; this exists so the claim can
 * be **asserted** rather than described. `tests/trace.test.ts` used to say in a
 * comment that a thrown query must not leave a phantom entry — the one failure
 * mode that would make this module lie — and then assert `expect(true)`, which
 * is a second copy of the claim rather than a check on it (PJ-028). Moving
 * `inFlight.delete(id)` out of the `finally` left the whole suite green; with
 * the snapshot exported it fails, which is the difference.
 *
 * A copy, not the map: a caller holding the live map could clear it.
 */
export function tracedInFlight(): Array<{ id: number; connection: string; sql: string }> {
  return [...inFlight].map(([id, q]) => ({ id, connection: q.connection, sql: q.sql }));
}

/** Per-connection totals, for answering "how much work was this test doing?". */
const counts = new Map<string, { queries: number; totalMs: number }>();

/** What each traced connection has run so far. Empty when tracing is off. */
export function traceTotals(): Array<{ connection: string; queries: number; totalMs: number }> {
  return [...counts].map(([connection, c]) => ({ connection, ...c }));
}

/**
 * Wraps a connection so its queries are traced, or hands it straight back when
 * tracing is off.
 *
 * `label` is how the connection appears in the output — a test name, a role
 * such as `admin`, anything that tells two connections apart. Telling them
 * apart is most of the value: the teardown race this module was built to
 * diagnose is invisible unless you can see which connection did what.
 */
export function traced(db: LabKitDB, label = "db"): LabKitDB {
  const opts = options();
  if (!opts) return db;
  ensureWatchdog(opts.stuckMs);

  return {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const id = nextQueryId++;
      const short = shorten(sql);
      const startedAt = performance.now();
      inFlight.set(id, { connection: label, sql: short, startedAt });
      try {
        const result = await db.query<T>(sql, params);
        const ms = performance.now() - startedAt;
        const c = counts.get(label) ?? { queries: 0, totalMs: 0 };
        counts.set(label, { queries: c.queries + 1, totalMs: c.totalMs + ms });
        if (opts.all || ms >= opts.slowMs) {
          emit({ trace: "query", id, connection: label, ms: Math.round(ms), sql: short });
        }
        return result;
      } catch (err) {
        emit({
          trace: "error",
          id,
          connection: label,
          ms: Math.round(performance.now() - startedAt),
          sql: short,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      } finally {
        // In `finally`, so a thrown query cannot leave a phantom entry that the
        // watchdog would then report as stuck forever. The whole point of this
        // module is that "still in flight" means what it says.
        inFlight.delete(id);
      }
    },
  };
}
