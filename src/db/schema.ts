import * as p from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Single source of truth for the schema LabKit's own vanilla SQL objects
 * (the `tenants` table, the natural-id sequences/functions in
 * drizzle/0002_natural_ids.sql) live in — hardcoded to Postgres's default
 * `public` for now, named in exactly one place so every raw-SQL call site
 * (src/db/tenant.ts, src/db/graph.ts) can schema-qualify explicitly instead
 * of relying on session `search_path` ordering. That ordering already
 * produced one real surprise: unqualified `CREATE FUNCTION` statements in
 * 0002 land in `ag_catalog` (not `public`), because migration 0001's `SET
 * search_path = ag_catalog, "$user", public` is still the active session
 * setting when 0002 runs — confirmed via `pg_proc`/`pg_namespace`. If
 * LabKit ever needs more relational tables per tenant (schema-per-tenancy,
 * as opposed to today's single shared `public.tenants`), this is the one
 * constant that would change.
 *
 * NOT applied to the `tenants` table declaration below via `pgSchema()` —
 * drizzle-orm hard-rejects `pgSchema("public")` at runtime ("If you want to
 * use 'public' schema, just use pgTable() instead"), so `tenants` stays a
 * plain `pgTable()`. This constant exists for the raw-SQL call sites, which
 * aren't subject to that restriction.
 */
export const LABKIT_SCHEMA = "public";

/**
 * `tenants` is the only core domain entity that is genuinely relational: it
 * never appears as an edge endpoint in the LabKit graph of interest
 * (docs/project-journal/001_git_init.md) and none of the MVP acceptance
 * queries traverse through it. It's the persistence/isolation boundary, not
 * a scientific entity — see docs/project-journal/003_review_domain_tenancy.md
 * for why this is `Tenant`, not `Project` (a repository/workspace concept,
 * mutable and orthogonal to tenant identity), and
 * docs/project-journal/004_tenancy_implementation_plan.md for the rest of
 * the tenancy design.
 *
 * Every core domain entity (Question, LineOfEnquiry, EvidenceUnit, Evidence,
 * Claim, Decision, Criterion, CriterionEvaluation, Gate, Review, Artefact,
 * Computation, Task) is a node in this tenant's own Apache AGE graph — one
 * graph per tenant, not one global graph with a repeated `tenant_id`
 * property. See src/db/tenant.ts for graph provisioning, src/db/graph.ts
 * for the `TenantGraph` query/mutation surface, tests/domain-graph.test.ts
 * for the acceptance-criteria traversals, and ./drizzle/ for the migrations
 * (drizzle-kit-generated for this table, hand-written `--custom` for the
 * one-time AGE extension bootstrap and the global natural-id machinery,
 * applied together via src/db/migrate.ts's runMigrations()).
 */
export const tenants = p.pgTable("tenants", {
    id: p.serial().primaryKey(),
    // User-facing short name (e.g. "labkit"). NEVER used to derive
    // graph_name directly — a user-controlled string must not become an AGE
    // graph identifier (PJ-003 §5).
    slug: p.text().notNull().unique(),
    display_name: p.text().notNull(),
    // Single source of truth: derived from the trusted internal `id`, not a
    // second value an application could accidentally desync from it.
    // "labkit_t1", not "labkit_t<uuid>" — boring, hyphen-free, debuggable.
    graph_name: p.text().notNull().generatedAlwaysAs(sql`'labkit_t' || id`),
    created_at: p.timestamp().defaultNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
