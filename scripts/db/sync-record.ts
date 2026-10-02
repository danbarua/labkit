#!/usr/bin/env bun
/**
 * Appends a local record's events to a tenant of a Postgres database, then builds the tenant's
 * graph from the events it appended.
 *
 *   LABKIT_DB_URL=<url> bun scripts/db/sync-record.ts --db <local record dir> --tenant <slug>
 *
 * The source is the local record's `labkit` tenant, which is what the CLI reads when it is given
 * no `--tenant`. It is opened as the CLI opens a record, through the record's daemon unless
 * `LABKIT_DAEMON=0`, so opening it may apply migrations. It is read and closed before the
 * tenant is opened.
 *
 * Which events the tenant already holds is decided by position, not by `seq`. The tenant
 * numbers its own events, so after a gap in the source's numbering (a rolled-back write takes a
 * number and stores nothing) the two numberings differ. The tenant holds the source's first N
 * events when its N events equal them on every field except `seq`; the rest are appended. When
 * they do not, the script names the first event that differs and appends nothing.
 *
 * Each event is recorded through `pgEventLog(...).record`, the sink every write verb uses. The
 * target database gives it its own `seq`. Handles already in the event (`NOTE_68`) are stored
 * as they are: the database replaces only `{{NOTE}}` placeholders, and a stored event has none.
 * The graph is then built from the stored events with `applyDelta`. Recording and building are
 * one transaction, because a later run counts every stored event as held and does not build
 * its graph again.
 *
 * It does not copy graph rows, delete or change anything the tenant holds, keep the source's
 * `seq`, or rewrite labels the current schema no longer has. `labkit dump` and `labkit restore`
 * copy a whole database; this does not.
 */

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { connectTo, dataDirFor } from "@labkit/core-db/connect";
import { TenantGraph } from "@labkit/core-db/graph";
import { scopeToTenant } from "@labkit/core-db/scoped";
import { resolveTenantContext } from "@labkit/core-db/tenant";
import { pgEventLog } from "@labkit/core-domain/event-store";
import type { EventSink, RecordedEvent } from "@labkit/core-domain/events";
import { applyDelta } from "@labkit/core-domain/projection";

/** The tenant a local record is read from: the CLI's default. */
const SOURCE_TENANT = "labkit";

export interface Synced {
  /** Events the tenant held before this run, all of them the source's first events. */
  readonly present: number;
  /** The events this run stored, as the tenant stored them. */
  readonly appended: readonly RecordedEvent[];
  readonly nodes: number;
  readonly edges: number;
}

/** Thrown when the tenant's events are not the start of the source's. Nothing was appended. */
export class Diverged extends Error {}

/** An event without the number its store gave it. */
const act = ({ seq: _seq, ...rest }: RecordedEvent) => rest;

const describe = (e: RecordedEvent): string =>
  `seq ${e.seq} ${e.operation} ${e.subject} at ${e.at} by ${e.attribution.attribution_id}`;

/**
 * Appends to `target` the events of `source` it does not hold, and builds the graph from what it
 * stored, in one transaction.
 */
export async function syncEvents(
  source: readonly RecordedEvent[],
  target: { events: EventSink; graph: TenantGraph },
): Promise<Synced> {
  return target.graph.inTransaction(async () => {
    const held = await target.events.all();
    for (const [i, event] of held.entries()) {
      const from = source[i];
      if (from === undefined)
        throw new Diverged(
          `the tenant holds ${held.length} events and the source ${source.length}; ` +
            `tenant event ${i + 1}, ${describe(event)}, is not in the source`,
        );
      if (!Bun.deepEquals(act(event), act(from), true))
        throw new Diverged(
          `tenant event ${i + 1} differs from source event ${i + 1}: ` +
            `tenant ${describe(event)}; source ${describe(from)}`,
        );
    }

    const appended: RecordedEvent[] = [];
    for (const event of source.slice(held.length)) appended.push(await target.events.record(event));

    let nodes = 0;
    let edges = 0;
    for (const event of appended) {
      await applyDelta(target.graph, event);
      for (const change of event.changes) {
        if (change.change === "NodeCreated") nodes++;
        else if (change.change === "EdgeCreated") edges++;
      }
    }
    return { present: held.length, appended, nodes, edges };
  });
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { db: { type: "string" }, tenant: { type: "string" } },
  });
  const url = process.env.LABKIT_DB_URL;
  if (!values.db || !values.tenant || !url) {
    console.error(
      "usage: LABKIT_DB_URL=<url> bun scripts/db/sync-record.ts --db <local record dir> --tenant <slug>",
    );
    process.exit(2);
  }
  const dir = resolve(values.db);
  const tenant = values.tenant;

  // `connectDb(dir)` would read LABKIT_DB_URL before `dir` and open the target instead.
  const local = await connectTo({
    backend: "pglite",
    dataDir: dataDirFor(dir),
    from: "--db",
    askedFor: dir,
  });
  let source: readonly RecordedEvent[];
  try {
    const ctx = await resolveTenantContext(local.db, local.tx, SOURCE_TENANT);
    await scopeToTenant(local.db, ctx);
    source = await pgEventLog(local.db, ctx).all();
  } finally {
    await local.close();
  }
  console.log(`${dir} (tenant ${SOURCE_TENANT}): ${source.length} events read`);

  const central = await connectTo({ backend: "postgres", url, askedFor: null });
  try {
    const ctx = await resolveTenantContext(central.db, central.tx, tenant);
    await scopeToTenant(central.db, ctx);
    const synced = await syncEvents(source, {
      events: pgEventLog(central.db, ctx),
      graph: new TenantGraph(ctx, central.db, central.tx),
    });
    const database = url.replace(/\/\/[^@]*@/, "//");
    console.log(
      `${database} (tenant ${tenant}): ${synced.present} events already present, ` +
        `${synced.appended.length} appended`,
    );
    console.log(`projected ${synced.nodes} nodes and ${synced.edges} edges`);
  } catch (err) {
    if (!(err instanceof Diverged)) throw err;
    console.error(`labkit: ${err.message}; nothing was appended`);
    process.exitCode = 1;
  } finally {
    await central.close();
  }
}
