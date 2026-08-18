-- Custom migration: one-time, global AGE extension bootstrap. This is
-- deliberately thin — per PJ-003/PJ-004, graph creation (create_graph,
-- create_vlabel/create_elabel, per-label indexes/views) is no longer a
-- fixed, deploy-time thing: it happens per tenant, at runtime, via
-- src/db/tenant.ts's provisionTenantGraph(). This migration only sets up
-- what every tenant graph needs regardless: the extension itself.

CREATE EXTENSION IF NOT EXISTS age;
--> statement-breakpoint
LOAD 'age';
--> statement-breakpoint
SET search_path = ag_catalog, "$user", public;
