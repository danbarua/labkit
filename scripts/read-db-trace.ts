#!/usr/bin/env bun
/**
 * Reads a real LabKit record into the same `Trace` shape the Explorer
 * renders — the only kind of trace the Explorer shows.
 *
 * **The bridge was already proven before this file existed** (2026-08-31,
 * against a record `scripts/probe-dogfood.sh <dir>` kept): `traceOf(name,
 * pgEventLog(db, tenantId))` over that `.labkit/` gave 15 steps, 21 nodes, 26
 * edges. `pgEventLog` persists `created`, `edges` and `detail` on the same
 * connection a write's transaction commits through (PJ-032), so nothing here
 * is new machinery — it is connect → resolve tenant → scope → read, pointed
 * at a durable record instead of a fresh temporary one.
 *
 * **`derived` comes from `fragments/replay.ts`**, not from this record's own
 * connection: there is no way to ask a durable log what a query would have
 * answered at a past `seq` after the fact, so the history is replayed — verb
 * by verb, checked against itself — into a disposable scratch database, and
 * `fragments/derive.ts`'s live snapshots are taken there.
 *
 * A divergence during replay is not swallowed: `derivedUnavailable` names the
 * `seq` and reason, and steps from there on report empty `derived`, same as a
 * trace with no provenance at all.
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
 * `--db` take) and reads its full event history for `tenant`, in `seq` order.
 *
 * Opens and closes within the call, holding the PGlite lock for neither longer
 * — see this file's header for why that matters to a record someone is still
 * writing to.
 */
export async function readDbHistory(dir: string, tenant = "labkit"): Promise<DomainEvent[]> {
  const connection = await connectDb(dir);
  try {
    const ctx = await resolveTenantContext(connection.db, connection.tx, tenant);
    await scopeToTenant(connection.db, ctx);
    const events = pgEventLog(connection.db, ctx.tenantId);
    return [...(await events.all())].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  } finally {
    await connection.close();
  }
}

/**
 * Turns a history into the `Trace` the Explorer renders, replaying it for the
 * `derived` snapshots.
 *
 * **Separate from {@link readDbHistory} because the two costs are three orders
 * of magnitude apart**, and only one of them has to be paid again when a
 * caller asks twice. Measured 2026-09-07 on the Bonsai record, 405 events:
 * reading the history is 252ms and this is 16,661ms. A viewer that re-read the
 * record per request and replayed it per request spent 98.5% of every request
 * recomputing something that had not changed.
 */
export async function traceFromHistory(
  name: string,
  history: readonly DomainEvent[],
): Promise<Trace> {
  const { provenance, refusedAt } = await replayIntoScratch(history);
  const trace = await traceOf(name, historySink(history), provenance);
  return {
    ...trace,
    ...(refusedAt
      ? {
          derivedUnavailable: `replay diverged at seq ${refusedAt.seq} (${refusedAt.operation}): ${refusedAt.reason}`,
        }
      : {}),
  };
}
