import * as p from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
    // Tracks the last `GRAPH_SCHEMA_VERSION` (src/db/graph.ts) this tenant's
    // graph was reconciled against — NOT a migration history, just a marker
    // so `provisionTenantGraph` can skip re-checking ~50 idempotent DDL
    // statements on every connection once a tenant is already current.
    // How an actual incompatible graph-schema migration (e.g. renaming a
    // label, reshaping a property) gets carried out is deliberately left
    // for later — this column is the groundwork for that, not the answer
    // to it (docs/project-journal/005_provisioning_reconciliation.md).
    schema_version: p.integer().notNull().default(0),
    created_at: p.timestamp().defaultNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
