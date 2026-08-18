-- Custom migration: Apache AGE graph bootstrap. drizzle-kit has no model of
-- Cypher/AGE catalog objects and can never diff this — it is hand-maintained.
-- See docs/project-journal/002_schema_dot_ts.md and
-- .claude/skills/postgres-age/SKILL.md for the syntax this depends on.
--
-- One-time setup only. Per-session concerns (LOAD 'age', SET search_path)
-- live in src/db/graph.ts's bootstrapSession(), called by every connecting
-- process — they can't be migrated away since they're session-scoped state.

CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS age;
--> statement-breakpoint
LOAD 'age';
--> statement-breakpoint
SET search_path = ag_catalog, "$user", public;
--> statement-breakpoint

-- create_graph() errors if the graph already exists (no IF NOT EXISTS in
-- AGE) — safe here because drizzle's migration ledger already guarantees
-- this file runs at most once per database.
SELECT create_graph('labkit');
--> statement-breakpoint

-- Vertex labels. Pre-created (rather than left to be created implicitly by
-- the first `CREATE (n:Label)`) so migration 0002's indexes have a table to
-- attach to before any application traffic arrives. Verbatim from
-- src/db/graph.ts's NODE_LABELS.
SELECT create_vlabel('labkit', 'Question');
--> statement-breakpoint
SELECT create_vlabel('labkit', 'LineOfEnquiry');
--> statement-breakpoint
SELECT create_vlabel('labkit', 'EvidenceUnit');
--> statement-breakpoint
SELECT create_vlabel('labkit', 'Evidence');
--> statement-breakpoint
SELECT create_vlabel('labkit', 'Claim');
--> statement-breakpoint
SELECT create_vlabel('labkit', 'Decision');
--> statement-breakpoint
SELECT create_vlabel('labkit', 'Criterion');
--> statement-breakpoint
SELECT create_vlabel('labkit', 'CriterionEvaluation');
--> statement-breakpoint
SELECT create_vlabel('labkit', 'Gate');
--> statement-breakpoint
SELECT create_vlabel('labkit', 'Review');
--> statement-breakpoint
SELECT create_vlabel('labkit', 'Artefact');
--> statement-breakpoint
SELECT create_vlabel('labkit', 'Computation');
--> statement-breakpoint
SELECT create_vlabel('labkit', 'Task');
--> statement-breakpoint

-- Edge labels. Verbatim from src/db/graph.ts's EDGE_LABELS.
SELECT create_elabel('labkit', 'MOTIVATES');
--> statement-breakpoint
SELECT create_elabel('labkit', 'REQUIRES');
--> statement-breakpoint
SELECT create_elabel('labkit', 'SUPPORTS');
--> statement-breakpoint
SELECT create_elabel('labkit', 'CHALLENGES');
--> statement-breakpoint
SELECT create_elabel('labkit', 'USES');
--> statement-breakpoint
SELECT create_elabel('labkit', 'PRODUCES');
--> statement-breakpoint
SELECT create_elabel('labkit', 'RECORDED_IN');
--> statement-breakpoint
SELECT create_elabel('labkit', 'EVALUATED_AS');
--> statement-breakpoint
SELECT create_elabel('labkit', 'TRIGGERS');
--> statement-breakpoint
SELECT create_elabel('labkit', 'GATES');
--> statement-breakpoint
SELECT create_elabel('labkit', 'CHANGES');
--> statement-breakpoint
SELECT create_elabel('labkit', 'BASED_ON');
--> statement-breakpoint
SELECT create_elabel('labkit', 'RESOLVES');
--> statement-breakpoint
SELECT create_elabel('labkit', 'NARROWS');
--> statement-breakpoint
SELECT create_elabel('labkit', 'DEFERS');
--> statement-breakpoint
SELECT create_elabel('labkit', 'SUPERSEDES');
--> statement-breakpoint
SELECT create_elabel('labkit', 'EVALUATES');
--> statement-breakpoint
SELECT create_elabel('labkit', 'IMPLEMENTS');
--> statement-breakpoint
