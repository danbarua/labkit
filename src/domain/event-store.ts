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
 */

import type { LabKitDB } from "../db/backend";
import { LABKIT_SCHEMA } from "../db/schema";
import type { AttributionContext, DomainEvent, EventFilter, EventSink, Operation } from "./events";

/** The row shape, as Postgres hands it back. */
interface EventRow {
  seq: string;
  at: string;
  operation: Operation;
  subject: string;
  created: string[];
  attribution_label: string;
  attribution_id: string;
  git_hash: string;
  detail: Record<string, unknown> | null;
}

const toEvent = (r: EventRow): DomainEvent => {
  const attribution: AttributionContext = {
    attribution_label: r.attribution_label,
    attribution_id: r.attribution_id,
    git_hash: r.git_hash,
  };
  return {
    // `bigserial` arrives as a string from `pg`, which is correct of it -- a
    // bigint does not fit a JS number in general. It does here, and will for
    // longer than this system will exist, so it is narrowed once at the seam
    // rather than pushed onto every caller.
    seq: Number(r.seq),
    at: r.at,
    attribution,
    operation: r.operation,
    subject: r.subject,
    created: r.created,
    ...(r.detail === null ? {} : { detail: r.detail }),
  };
};

/**
 * An `EventSink` backed by `public.labkit_event`, scoped to one tenant.
 *
 * **It takes the same `LabKitDB` the graph is using**, and that is the whole
 * atomicity story: `WriteSurface.emit` runs inside the verb's `inTransaction`,
 * so the INSERT below joins the transaction already holding that verb's writes.
 * An event and the writes it describes commit together or neither does. Hand it
 * a second connection and that silently stops being true.
 */
export function pgEventLog(db: LabKitDB, tenantId: number): EventSink {
  const select = async (filter: EventFilter): Promise<readonly DomainEvent[]> => {
    // Built positionally rather than interpolated: `operation` and `by` come
    // from an MCP caller, and this is the one place in the codebase that
    // assembles SQL rather than Cypher.
    const where = [`tenant_id = $1`];
    const params: unknown[] = [tenantId];
    const bind = (value: unknown): string => `$${params.push(value)}`;
    if (filter.since !== undefined) where.push(`seq > ${bind(filter.since)}`);
    if (filter.by !== undefined) where.push(`attribution_id = ${bind(filter.by)}`);
    if (filter.operation !== undefined) where.push(`operation = ${bind(filter.operation)}`);
    // Subject *or* minted. "What happened to this record" has to include the
    // act that brought it into existence, and for most verbs that act names
    // something else as its subject.
    if (filter.touching !== undefined) {
      const t = bind(filter.touching);
      where.push(`(subject = ${t} OR created @> ARRAY[${t}]::text[])`);
    }
    const limit = filter.limit === undefined ? "" : ` LIMIT ${bind(filter.limit)}`;
    const rows = await db.query<EventRow>(
      `SELECT seq, at, operation, subject, created, attribution_label, attribution_id, git_hash, detail
       FROM ${LABKIT_SCHEMA}.labkit_event
       WHERE ${where.join(" AND ")}
       ORDER BY seq${limit}`,
      params,
    );
    return rows.rows.map(toEvent);
  };

  return {
    async record(event) {
      await db.query(
        `INSERT INTO ${LABKIT_SCHEMA}.labkit_event
           (tenant_id, at, operation, subject, created, attribution_label, attribution_id, git_hash, detail)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          tenantId,
          event.at,
          event.operation,
          event.subject,
          event.created ?? [],
          event.attribution.attribution_label,
          event.attribution.attribution_id,
          event.attribution.git_hash,
          event.detail === undefined ? null : JSON.stringify(event.detail),
        ],
      );
    },
    all: () => select({}),
    select,
  };
}
