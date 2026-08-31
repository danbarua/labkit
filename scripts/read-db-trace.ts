#!/usr/bin/env bun
/**
 * Reads a real LabKit record — built through the CLI or MCP server, not a
 * composition run in a temp directory — into the same `Trace` shape the
 * Explorer already renders. Phase 2 of labkit#124 (labkit#126).
 *
 * **The bridge was already proven before this file existed** (2026-08-31,
 * against a record `scripts/probe-dogfood.sh <dir>` kept): `traceOf(name,
 * pgEventLog(db, tenantId))` over that `.labkit/` gave 15 steps, 21 nodes, 26
 * edges, zero `danglingEndpoints`. `pgEventLog` persists `created`, `edges`
 * and `detail` on the same connection a write's transaction commits through
 * (PJ-032), so nothing here is new machinery — it is `fragments/run.ts`'s
 * connect → resolve tenant → scope → read pattern, pointed at a durable
 * record instead of a fresh temporary one, with `TenantGraph` and
 * `WriteSurface` both absent because a trace read needs neither.
 *
 * **What this cannot give a trace that a composition's does:**
 * - `derived` is always empty. `fragments/derive.ts`'s enquiry/gate snapshots
 *   are taken live, immediately after each event is recorded — there is no
 *   way to ask a durable log what a query would have answered at a past
 *   `seq` after the fact. Filling this in would mean replaying the whole
 *   history state-by-state, which is explicitly out of scope for this issue.
 * - `fragment` is always absent. A real record was not built by composing
 *   named moves; it was built by whoever ran the CLI or an agent driving the
 *   MCP server, one command at a time, same as `read-rust-traces.ts`'s
 *   traces have no `fragment` either, for the same reason.
 *
 * **Read-only, and acquired-and-released per call, not held.** `connectDb`'s
 * PGlite backend takes a filesystem lock for the life of the connection
 * (`src/db/backend.ts`); a long-lived reader would block every writer trying
 * to touch the same record, which for a record still being written to (a
 * researcher's live project) would be actively harmful. `readDbTrace()`
 * opens, reads, and closes within one call — the same shape
 * `surfacesOver()` uses per MCP tool call (`src/mcp/server.ts`) — so
 * `serve-explorer.ts` must call this per request rather than caching an
 * open connection, exactly as noted in labkit#126.
 */

import { connectDb } from "../src/db/connect";
import { resolveTenantContext } from "../src/db/tenant";
import { scopeToTenant } from "../src/db/scoped";
import { pgEventLog } from "../src/domain/event-store";
import { traceOf, type Trace } from "../fragments/trace";

/**
 * Opens the record at `dir` (a project root — the directory whose `.labkit/`
 * subdirectory holds the database, same argument `connectDb` and the CLI's
 * `--db` take), reads its full event history for `tenant`, and returns one
 * `Trace`. `name` labels it for the Explorer's scenario picker.
 */
export async function readDbTrace(dir: string, name: string, tenant = "labkit"): Promise<Trace> {
  const connection = await connectDb(dir);
  try {
    const ctx = await resolveTenantContext(connection.db, connection.tx, tenant);
    await scopeToTenant(connection.db, ctx);
    const events = pgEventLog(connection.db, ctx.tenantId);
    const trace = await traceOf(name, events);
    return { ...trace, origin: "labkit-db" };
  } finally {
    await connection.close();
  }
}
