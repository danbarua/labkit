import * as p from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * The schema LabKit's own SQL objects live in: the `tenants` table and the natural-id sequences.
 * Named once so every raw-SQL call site qualifies explicitly rather than trusting `search_path`.
 *
 * Per-tenant data is not here. A workspace's graph and its event log both live in the tenant's
 * own schema, named by `TenantContext.graphName` — see `workspaceEvents` below.
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
 * The columns of an event log.
 *
 * A fresh object each call, not a shared literal: drizzle binds a column builder to the
 * table that consumes it, so handing the same builders to two tables rebinds the first
 * one's columns.
 */
const eventColumns = () =>
  ({
    /**
     * The stream's order, and the reason it is a number rather than `at`.
     *
     * No column default: `labkit_record_event` takes the workspace's next number and writes
     * it here, and into the id of every record the act creates.
     */
    seq: p.bigint({ mode: "number" }).primaryKey(),
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
     * `AttributionHow` in `packages/core-domain/events.ts` for what each means and why there are three.
     */
    attribution_how: p.text(),
    /**
     * The commit this act ran against. Null means it was not captured — never a hex stand-in.
     */
    git_hash: p.text(),
    /**
     * What the act was read off, when it was not performed. Nullable, and the absence means
     * nobody said — see `CommandContext` in `packages/core-domain/events.ts`.
     */
    reconstructed_from: p.text(),
    /**
     * The command the caller issued, verbatim.
     */
    command: p.jsonb().notNull(),
  }) as const;

/**
 * The indexes and the policy, over whichever table consumed the columns above.
 */
const eventExtras = (t: Record<keyof ReturnType<typeof eventColumns>, p.PgColumn>) => [
  // The stream, per tenant. Every read is tenant-scoped, so every index is.
  p.index("domain_event_tenant_seq_idx").on(t.tenant_id, t.seq),
  // "What happened to this record" -- the only lookup keyed by a handle.
  p.index("domain_event_tenant_subject_idx").on(t.tenant_id, t.subject),
  // "What has this agent been doing", in order.
  p.index("domain_event_tenant_agent_idx").on(t.tenant_id, t.attribution_id, t.seq),
  /**
   * Rows belong to the tenant the session is scoped to, and to no other.
   */
  p.pgPolicy("domain_event_tenant_isolation", {
    as: "permissive",
    for: "all",
    to: labkitApp,
    using: sql`tenant_id = current_setting('labkit.tenant_id')::int`,
    withCheck: sql`tenant_id = current_setting('labkit.tenant_id')::int`,
  }),
];

export type LabkitEvent = ReturnType<typeof workspaceEvents>["$inferSelect"];

/** One table object per workspace schema; the same object on every later call. */
const perWorkspace = new Map<string, ReturnType<typeof buildWorkspaceEvents>>();

const buildWorkspaceEvents = (schema: string) =>
  p.pgSchema(schema).table("domain_event", eventColumns(), eventExtras);

/**
 * `<workspace>.domain_event` — where a tenant's events live.
 *
 * The **one** exception to the rule at the top of this file: the schema here is the tenant's,
 * not `LABKIT_SCHEMA`, and it is bound per call rather than statically. `search_path` is still
 * not trusted — drizzle qualifies every reference with the name passed in.
 */
export function workspaceEvents(schema: string) {
  const existing = perWorkspace.get(schema);
  if (existing) return existing;
  const table = buildWorkspaceEvents(schema);
  perWorkspace.set(schema, table);
  return table;
}
