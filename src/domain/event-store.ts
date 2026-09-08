/**
 * The durable event sink.
 */

import { and, asc, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { LabKitDB } from "../db/backend";
import { ormOver, unwrapped } from "../db/orm";
import { labkitEvents } from "../db/schema";
import type { RecordedAttribution, DomainEvent, EventFilter, EventSink } from "./events";

/** The row shape, as drizzle hands it back — derived from the table, not restated. */
type EventRow = typeof labkitEvents.$inferSelect;

const toEvent = (r: EventRow): DomainEvent => {
  const attribution: RecordedAttribution = {
    attribution_label: r.attribution_label,
    attribution_id: r.attribution_id,
    // Read back as-is, including `null`. The column is nullable for exactly
    // one population -- rows written before the grade existed -- and coercing
    // that to a value here would invent the fact the column exists to record.
    attribution_how: r.attribution_how as RecordedAttribution["attribution_how"],
    git_hash: r.git_hash,
  };
  return {
    // `seq` is a `bigserial`, which `pg` hands back as a **string** and a raw
    // PGlite as a **number** (measured 2026-08-26). No narrowing is needed
    // here: the column is declared `mode: "number"` and drizzle applies that
    // mapper on both backends.
    seq: r.seq,
    at: r.at,
    attribution,
    operation: r.operation,
    subject: r.subject,
    changes: r.changes as DomainEvent["changes"],
    command: r.command as DomainEvent["command"],
    reconstructedFrom: r.reconstructed_from,
  };
};

/**
 * An `EventSink` backed by `public.labkit_event`, scoped to one tenant.
 */
export function pgEventLog(db: LabKitDB, tenantId: number): EventSink {
  const orm = ormOver(db);

  const select = (filter: EventFilter): Promise<readonly DomainEvent[]> =>
    unwrapped(async () => {
      const conditions = [eq(labkitEvents.tenant_id, tenantId)];
      if (filter.since !== undefined) conditions.push(gt(labkitEvents.seq, filter.since));
      if (filter.by !== undefined) conditions.push(eq(labkitEvents.attribution_id, filter.by));
      if (filter.operation !== undefined)
        conditions.push(eq(labkitEvents.operation, filter.operation));
      if (filter.reconstructed !== undefined)
        conditions.push(
          filter.reconstructed
            ? isNotNull(labkitEvents.reconstructed_from)
            : isNull(labkitEvents.reconstructed_from),
        );
      // Subject *or* created. "What happened to this record" has to include the
      // act that brought it into existence, and for most verbs that act names
      // something else as its subject. jsonb containment is the `@>` this needs,
      // so the GIN index on `changes` is the one doing the work.
      if (filter.touching !== undefined) {
        const touching = filter.touching;
        const created = JSON.stringify([{ change: "NodeCreated", id: touching }]);
        const clause = or(
          eq(labkitEvents.subject, touching),
          sql`${labkitEvents.changes} @> ${created}::jsonb`,
        );
        if (clause) conditions.push(clause);
      }

      // `$dynamic()` because the limit is optional and a drizzle builder is
      // otherwise single-use: without it the two branches would each need their
      // own copy of the query.
      const query = orm
        .select()
        .from(labkitEvents)
        .where(and(...conditions))
        .orderBy(asc(labkitEvents.seq))
        .$dynamic();
      const rows = await (filter.limit === undefined ? query : query.limit(filter.limit));
      return rows.map(toEvent);
    });

  return {
    record: (event) =>
      unwrapped(async () => {
        const rows = await orm
          .insert(labkitEvents)
          .values({
            tenant_id: tenantId,
            at: event.at,
            operation: event.operation,
            subject: event.subject,
            // Copied: `DomainEvent.changes` is `readonly` and drizzle's insert
            // type is not.
            changes: [...event.changes],
            attribution_label: event.attribution.attribution_label,
            attribution_id: event.attribution.attribution_id,
            attribution_how: event.attribution.attribution_how,
            git_hash: event.attribution.git_hash,
            reconstructed_from: event.reconstructedFrom,
            // `jsonb` takes the value, not a string: the driver serialises it.
            // Hand-rolled SQL had to `JSON.stringify` here and a double-encoded
            // payload is the classic way that goes wrong.
            command: event.command,
          })
          .returning({ seq: labkitEvents.seq });
        // `seq` is the one field the caller could not have supplied -- the
        // store assigns it. Everything else on the returned event is what was
        // just written, not a second read of the row. `rows[0]!`: a single
        // insert always returns exactly one row.
        return { ...event, seq: rows[0]!.seq };
      }),
    all: () => select({}),
    select,
  };
}
