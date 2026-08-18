import * as p from "drizzle-orm/pg-core";

/**
 * `projects` is the only core domain entity that is genuinely relational:
 * it never appears as an edge endpoint in the LabKit graph of interest
 * (docs/project-journal/001_git_init.md) and none of the MVP acceptance
 * queries traverse through it. It's the tenant boundary every graph node
 * hangs a `project_id` property off of.
 *
 * Every other core entity (Question, LineOfEnquiry, EvidenceUnit, Evidence,
 * Claim, Decision, Criterion, CriterionEvaluation, Gate, Review, Artefact,
 * Computation, Task) is a graph node — provenance, support/challenge, and
 * invalidation propagation are the entire point of this domain, and forcing
 * them into FK tables would just reimplement graph traversal as recursive
 * CTEs. See src/db/graph.ts for node/edge shapes and example AGE queries,
 * tests/domain-graph.test.ts for the acceptance-criteria traversals, and
 * ./drizzle/ for the migrations (drizzle-kit-generated for this table,
 * hand-written `--custom` for the graph bootstrap/natural-id machinery,
 * applied together via src/db/migrate.ts's runMigrations()).
 */
export const projects = p.pgTable("projects", {
    id: p.uuid().primaryKey().defaultRandom(),
    name: p.text().notNull().unique(),
    created_at: p.timestamp().defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
