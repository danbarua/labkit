#!/usr/bin/env bun
/**
 * Reads a real LabKit record — built through the CLI or MCP server, not a
 * composition run in a temp directory — into the same `Trace` shape the
 * Explorer already renders. Phase 2 of labkit#124 (labkit#126); `derived` and
 * `fragment` are labkit#205.
 *
 * **The bridge was already proven before this file existed** (2026-08-31,
 * against a record `scripts/probe-dogfood.sh <dir>` kept): `traceOf(name,
 * pgEventLog(db, tenantId))` over that `.labkit/` gave 15 steps, 21 nodes, 26
 * edges, zero `danglingEndpoints`. `pgEventLog` persists `created`, `edges`
 * and `detail` on the same connection a write's transaction commits through
 * (PJ-032), so nothing here is new machinery — it is `fragments/run.ts`'s
 * connect → resolve tenant → scope → read pattern, pointed at a durable
 * record instead of a fresh temporary one.
 *
 * **`derived` and `fragment` come from `fragments/replay.ts`**, not from this
 * record's own connection: there is no way to ask a durable log what a query
 * would have answered at a past `seq` after the fact, so the history is
 * replayed — verb by verb, checked against itself — into a disposable scratch
 * database, and `fragments/derive.ts`'s live snapshots are taken there.
 * `fragment` is the event's own `attribution.attribution_label`, carried
 * through unchanged; a real record was not built by composing named moves,
 * so this is the closest thing to one, whatever a writer set it to.
 *
 * A divergence during replay is not swallowed: `derivedUnavailable` names the
 * `seq` and reason, and steps from there on report empty `derived` and no
 * `fragment`, same as a trace with no provenance at all.
 *
 * **Read-only, and acquired-and-released per call, not held.** `connectDb`'s
 * PGlite backend takes a filesystem lock for the life of the connection
 * (`src/db/backend.ts`); a long-lived reader would block every writer trying
 * to touch the same record, which for a record still being written to (a
 * researcher's live project) would be actively harmful. `readDbTrace()`
 * opens, reads node properties the replay will need, and closes within one
 * call — the same shape `surfacesOver()` uses per MCP tool call
 * (`src/mcp/server.ts`) — so `serve-explorer.ts` must call this per request
 * rather than caching an open connection, exactly as noted in labkit#126.
 * The replay itself runs afterward, against its own temporary database, and
 * never touches `dir` again.
 */

import { connectDb } from "../src/db/connect";
import { resolveTenantContext } from "../src/db/tenant";
import { scopeToTenant } from "../src/db/scoped";
import { TenantGraph } from "../src/db/graph";
import { pgEventLog } from "../src/domain/event-store";
import type { DomainEvent, EventFilter, EventSink } from "../src/domain";
import { traceOf, type Trace } from "../fragments/trace";
import { replayIntoScratch } from "../fragments/replay";

/** A fixed list of already-read events, for `traceOf` after the live connection has closed. */
function historySink(history: readonly DomainEvent[]): EventSink {
  return {
    record: () => {
      throw new Error("historySink is read-only");
    },
    all: async () => history,
    select: async (filter: EventFilter) =>
      history.filter((e) => filter.since === undefined || (e.seq ?? 0) > filter.since),
  };
}

/**
 * Opens the record at `dir` (a project root — the directory whose `.labkit/`
 * subdirectory holds the database, same argument `connectDb` and the CLI's
 * `--db` take), reads its full event history for `tenant`, and returns one
 * `Trace`. `name` labels it for the Explorer's scenario picker.
 */
export async function readDbTrace(dir: string, name: string, tenant = "labkit"): Promise<Trace> {
  let history: DomainEvent[];
  const connection = await connectDb(dir);
  try {
    const ctx = await resolveTenantContext(connection.db, connection.tx, tenant);
    await scopeToTenant(connection.db, ctx);
    const graph = new TenantGraph(ctx, connection.db, connection.tx);
    const events = pgEventLog(connection.db, ctx.tenantId);
    history = [...(await events.all())].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  } finally {
    await connection.close();
  }

  const { provenance, refusedAt } = await replayIntoScratch(history);
  const trace = await traceOf(name, historySink(history), provenance);
  return {
    ...trace,
    origin: "labkit-db",
    ...(refusedAt
      ? {
          derivedUnavailable: `replay diverged at seq ${refusedAt.seq} (${refusedAt.operation}): ${refusedAt.reason}`,
        }
      : {}),
  };
}
