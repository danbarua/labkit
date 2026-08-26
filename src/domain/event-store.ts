/**
 * The durable event sink.
 *
 * `src/domain/events.ts` argued for years that the in-memory log was a decision
 * and not an unfinished edge, and it was right for as long as nothing needed to
 * read the stream: every historical question the scenarios ask is answered from
 * the graph, asserted with a provably empty log. What changed is attribution
 * (PJ-031) — every event carries who ran the command and against which commit,
 * and until now that reached the end of the process and stopped.
 *
 * **The rule this does not break.** *Events explain how state changed; the graph
 * explains what the current research state is.* Nothing here answers a "what is
 * true now" question, and `read.ts` still never consults the sink for one. The
 * only question it serves is *what happened*, which the graph genuinely cannot
 * answer.
 *
 * It lives under `src/domain/` rather than `src/db/` because `EventSink` does,
 * and because `src/db` may not import `src/domain` — dependency-cruiser enforces
 * that direction. Taking a `LabKitDB` is the allowed way round.
 *
 * **It used to build its `WHERE` clause by hand**, with an array of fragments
 * and a `bind()` closure doing `$${params.push(value)}` — the only place in the
 * codebase that assembled SQL rather than Cypher, on a table whose filters come
 * from an MCP caller. The graph side has had a typed surface since
 * `CypherRunner`; this is the relational half finally getting one. See
 * `src/db/orm.ts`.
 */

import { and, arrayContains, asc, eq, gt, or } from "drizzle-orm";
import type { LabKitDB } from "../db/backend";
import { ormOver, unwrapped } from "../db/orm";
import { labkitEvents } from "../db/schema";
import type { AttributionContext, DomainEvent, EventFilter, EventSink, Operation } from "./events";

/** The row shape, as drizzle hands it back — derived from the table, not restated. */
type EventRow = typeof labkitEvents.$inferSelect;

const toEvent = (r: EventRow): DomainEvent => {
  const attribution: AttributionContext = {
    attribution_label: r.attribution_label,
    attribution_id: r.attribution_id,
    git_hash: r.git_hash,
  };
  return {
    // `seq` is a `bigserial`, which `pg` hands back as a **string** and a raw
    // PGlite as a **number** (measured 2026-08-26). This used to be
    // `Number(r.seq)`, narrowing at the seam so no caller had to know. It is
    // gone because the column is declared `mode: "number"` and drizzle applies
    // that mapper on both backends -- which is one of the things moving to the
    // ORM buys, rather than an incidental tidy-up.
    seq: r.seq,
    at: r.at,
    attribution,
    // `text` in the schema, an `Operation` in the domain. The narrowing is
    // here because this is where a stored string re-enters the type system;
    // nothing else in the round trip can check it.
    operation: r.operation as Operation,
    subject: r.subject,
    created: r.created,
    ...(r.detail === null ? {} : { detail: r.detail as Record<string, unknown> }),
  };
};

/**
 * An `EventSink` backed by `public.labkit_event`, scoped to one tenant.
 *
 * **It takes the same `LabKitDB` the graph is using**, and that is the whole
 * atomicity story: `WriteSurface.emit` runs inside the verb's `inTransaction`,
 * so the INSERT below joins the transaction already holding that verb's writes.
 * An event and the writes it describes commit together or neither does. Hand it
 * a second connection and that silently stops being true. The ORM is built over
 * that same seam and inherits the property for free (`src/db/orm.ts`).
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
      // Subject *or* minted. "What happened to this record" has to include the
      // act that brought it into existence, and for most verbs that act names
      // something else as its subject. `arrayContains` is the `@>` this needs, so
      // the GIN index on `created` is still the one doing the work.
      if (filter.touching !== undefined) {
        const touching = filter.touching;
        const clause = or(
          eq(labkitEvents.subject, touching),
          arrayContains(labkitEvents.created, [touching]),
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
        await orm.insert(labkitEvents).values({
          tenant_id: tenantId,
          at: event.at,
          operation: event.operation,
          subject: event.subject,
          // Copied: `DomainEvent.created` is `readonly string[]` and drizzle's
          // insert type is not.
          created: [...(event.created ?? [])],
          attribution_label: event.attribution.attribution_label,
          attribution_id: event.attribution.attribution_id,
          git_hash: event.attribution.git_hash,
          // `jsonb` takes the value, not a string: the driver serialises it.
          // Hand-rolled SQL had to `JSON.stringify` here and a double-encoded
          // payload is the classic way that goes wrong.
          detail: event.detail ?? null,
        });
      }),
    all: () => select({}),
    select,
  };
}
