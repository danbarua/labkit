import * as p from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Single source of truth for the schema LabKit's own vanilla SQL objects (the `tenants` table,
 * the natural-id sequences/functions in drizzle/0002_natural_ids.sql) live in — hardcoded to
 * Postgres's default `public` for now, named in exactly one place so every raw-SQL call site
 * (src/db/tenant.ts, src/db/graph.ts) can schema-qualify explicitly instead of relying on
 * session `search_path` ordering.
 */
export const LABKIT_SCHEMA = "public";

/**
 * `tenants` is the only core domain entity that is genuinely relational: it never appears as an
 * edge endpoint in the LabKit graph of interest  and none
 * of the MVP acceptance queries traverse through it.
 */
export const tenants = p.pgTable("tenants", {
  id: p.serial().primaryKey(),
  // User-facing short name (e.g. "labkit"). NEVER derives `graph_name`
  // directly: a user-controlled string must not become an AGE graph identifier.
  slug: p.text().notNull().unique(),
  display_name: p.text().notNull(),
  // Single source of truth: derived from the trusted internal `id`, not a
  // second value an application could accidentally desync from it.
  // "labkit_t1", not "labkit_t<uuid>" — boring, hyphen-free, debuggable.
  graph_name: p.text().notNull().generatedAlwaysAs(sql`'labkit_t' || id`),
  created_at: p.timestamp().defaultNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;

/**
 * The role LabKit's own queries run as, and what it is honestly worth.
 */
export const APP_ROLE = "labkit_app";

/** The declaration `drizzle-kit` reads, over the name above. */
export const labkitApp = p.pgRole(APP_ROLE).existing();

/**
 * The durable event log — **the second LabKit-owned relational table**, and the first that is
 * per-tenant data rather than the tenancy boundary itself.
 */
export const labkitEvents = p
  .pgTable(
    "labkit_event",
    {
      /**
       * The stream's order, and the reason it is a sequence rather than `at`.
       */
      seq: p.bigserial({ mode: "number" }).primaryKey(),
      tenant_id: p
        .integer()
        .notNull()
        .references(() => tenants.id),
      /**
       * Verbatim what the `Clock` said — text, not `timestamptz`.
       */
      at: p.text().notNull(),
      operation: p.text().notNull(),
      /**
       * The natural id of what the operation was primarily about.
       */
      subject: p.text().notNull(),
      /**
       * Every change this act made to the graph, in the order it made them — `NodeCreated`,
       * `EdgeCreated` and `PropsChanged` records.
       */
      changes: p.jsonb().notNull().default([]),
      attribution_label: p.text().notNull(),
      attribution_id: p.text().notNull(),
      /**
       * How LabKit came by the name beside it — `observed`, `claimed` or `unattributed`. See
       * `AttributionHow` in `src/domain/events.ts` for what each means and why there are three.
       */
      attribution_how: p.text(),
      git_hash: p.text().notNull(),
      /**
       * The command the caller issued, verbatim.
       */
      command: p.jsonb().notNull(),
    },
    (t) => [
      // The stream, per tenant. Every read is tenant-scoped, so every index is.
      p.index("labkit_event_tenant_seq_idx").on(t.tenant_id, t.seq),
      // "What happened to this record" -- the only lookup keyed by a handle.
      p.index("labkit_event_tenant_subject_idx").on(t.tenant_id, t.subject),
      // "What has this agent been doing", in order.
      p.index("labkit_event_tenant_agent_idx").on(t.tenant_id, t.attribution_id, t.seq),
      /**
       * Rows belong to the tenant the session is scoped to, and to no other.
       */
      p.pgPolicy("labkit_event_tenant_isolation", {
        as: "permissive",
        for: "all",
        to: labkitApp,
        using: sql`tenant_id = current_setting('labkit.tenant_id')::int`,
        withCheck: sql`tenant_id = current_setting('labkit.tenant_id')::int`,
      }),
    ],
  )
  .enableRLS();

export type LabkitEvent = typeof labkitEvents.$inferSelect;
