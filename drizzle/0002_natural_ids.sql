-- Custom migration: JIRA-style natural/display IDs (e.g. "COMP_123") for
-- every graph node. Global, tenant-independent — natural IDs are allocated
-- globally across all tenants (PJ-003 §12, reaffirmed in
-- docs/project-journal/004_tenancy_implementation_plan.md decision #3),
-- so these sequences/functions live here as one-time setup, not inside
-- per-tenant provisioning. Per-label UNIQUE indexes and CQRS views DO live
-- per-tenant (src/db/tenant.ts's provisionTenantGraph()) since they target
-- each tenant's own schema-qualified label tables.
--
-- Underscore separator (decision #4, 2026-08-18): "COMP_123", not
-- "COMP-123" — avoids a hyphen<->underscore mapping step for user-facing
-- IDs elsewhere in the stack.
--
-- Schema-qualified explicitly as `public.*` (src/db/schema.ts's
-- LABKIT_SCHEMA), not left to `search_path` resolution — confirmed via
-- pg_proc/pg_namespace that the earlier, unqualified version of this file
-- was silently landing in `ag_catalog`, not `public`: migration 0001's
-- `SET search_path = ag_catalog, "$user", public` is still the active
-- session setting when this migration runs, and Postgres resolves an
-- unqualified CREATE to the first schema in that path. Worked by accident
-- (bootstrapSession() always sets the same search_path at runtime), but
-- these are LabKit's own objects, not AGE's — they don't belong in AGE's
-- namespace.
--
-- Verified empirically against pglite-age (see
-- docs/project-journal/002_schema_dot_ts.md and the postgres-age skill):
--   * A `LANGUAGE sql` scalar function CAN be called from inside a Cypher
--     CREATE property map, but only when the literal arguments are
--     explicitly cast (`'question'::text`) — AGE otherwise types Cypher
--     string literals as `agtype` and no `(agtype, agtype)` overload exists.
--   * The properties column on a label's underlying table round-trips
--     through `(properties::text)::jsonb` cleanly with ordinary jsonb `->>`.

CREATE SEQUENCE IF NOT EXISTS public.labkit_question_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public.labkit_lineofenquiry_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public.labkit_evidenceunit_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public.labkit_evidence_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public.labkit_claim_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public.labkit_decision_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public.labkit_criterion_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public.labkit_criterionevaluation_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public.labkit_gate_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public.labkit_review_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public.labkit_artefact_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public.labkit_computation_natural_id_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public.labkit_task_natural_id_seq;
--> statement-breakpoint

-- Generic generator: one function instead of thirteen near-identical ones.
-- `label` must be the lowercased NodeLabel (matches the sequence names
-- above); `prefix` is the short display prefix from graph.ts's
-- NATURAL_ID_PREFIX. Both args are always literals supplied by graph.ts,
-- never caller/user input. The `nextval(...)` target is schema-qualified
-- for the same reason the CREATE SEQUENCE statements above are — this
-- function body itself resolves unqualified names against whatever
-- search_path is active at CALL time (not fixed at creation), so leaving
-- it unqualified would keep working today only by relying on
-- bootstrapSession() always setting `ag_catalog` first.
CREATE OR REPLACE FUNCTION public.labkit_next_natural_id(label text, prefix text)
RETURNS text
LANGUAGE sql
AS $$
  SELECT prefix || '_' || nextval('public.labkit_' || lower(label) || '_natural_id_seq')::text;
$$;
--> statement-breakpoint

-- Small extraction helper so per-tenant CQRS views (provisioned at runtime,
-- not here) don't each repeat the agtype -> jsonb round-trip. Returns NULL
-- for a key the node doesn't have (matches the optional-property semantics
-- in graph.ts's *Props interfaces).
CREATE OR REPLACE FUNCTION public.labkit_prop(properties agtype, key text)
RETURNS text
LANGUAGE sql
AS $$
  SELECT (properties::text)::jsonb ->> key;
$$;
