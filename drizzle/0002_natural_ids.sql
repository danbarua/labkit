-- **The hand-rolled migration.** Drizzle cannot migrate what it does not
-- manage, so everything drizzle has no model for lives here, in one file,
-- rather than being scattered as hand-edits into files drizzle generated. Two
-- kinds of thing qualify: the natural-id sequences and functions this file
-- was created for, and -- added 2026-08-26 -- the application role and every
-- GRANT, which drizzle models not at all (measured: the string `GRANT ` does
-- not appear anywhere in drizzle-kit's bundle).
--
-- That licence holds while LabKit is pre-deploy and databases are destroyed
-- and recreated freely. Once a real database exists this file stops being
-- amendable and new hand-written migrations get their own numbers. See the
-- "License to rewrite history" note in
-- docs/project-journal/004_tenancy_implementation_plan.md.
--
-- **The filename says who wrote it.** Generated migrations carry drizzle-kit's
-- random names (`0000_overrated_texas_twister`, `0003_tense_hawkeye`);
-- hand-written ones are named for what they do. A descriptive name on a file
-- you are about to hand-edit means you are editing the right kind of file.
--
-- Part one: JIRA-style natural/display IDs (e.g. "COMP_123") for
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
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Part two: the application role, and the privileges that make it usable.
-- ---------------------------------------------------------------------------
--
-- Here rather than beside the policy in the generated RLS migration, because
-- **drizzle manages neither.** The policy is drizzle's (it is declared on the
-- table in src/db/schema.ts and generated from it); the role is excluded from
-- drizzle-kit's management in drizzle.config.ts, and privileges are outside its
-- model entirely.
--
-- **Ledger position is doing real work here.** This file runs after 0000
-- (`tenants`) and 0001 (`agtype`), and before 0003 (`labkit_event`) and 0004
-- (the policy that names the role). So the role exists two migrations before
-- anything references it, and the objects granted below are exactly the ones
-- that exist by now.
--
-- **What this buys, stated honestly.** A session connects as a superuser, loads
-- AGE, resolves its tenant, and only then steps down to `labkit_app` with its
-- tenant pinned to a session GUC (src/db/scoped.ts). From that point a query
-- that forgets its tenant filter returns that tenant's rows anyway, and one
-- that writes another tenant's row is refused. It is a **safety** boundary, not
-- a security one: the session can `RESET ROLE` back to superuser. Bugs do not
-- issue `RESET ROLE`; that is the whole of the claim.
--
-- **Why not a login role.** Measured 2026-08-26: `LOAD 'age'` is refused to a
-- non-superuser (`access to library "age" is not allowed`, 42501), and without
-- the library the `agtype` type does not resolve, so every Cypher query fails --
-- reads included. Stepping down after `bootstrapSession` keeps the library
-- loaded for the session. A deployment wanting a genuine login boundary would
-- need `ALTER ROLE labkit_app SET session_preload_libraries = 'age'`; noted,
-- not built, not measured.
--
-- **`NOSUPERUSER`** is the point rather than a detail: a superuser bypasses RLS
-- unconditionally, and `FORCE ROW LEVEL SECURITY` is not enough to stop it
-- (measured). `NOLOGIN` because nothing connects as this role -- it is only ever
-- stepped into.
--
-- Guarded, because a role is **cluster-scoped** while this ledger is
-- per-database: a second LabKit database in one cluster would otherwise fail
-- here. `bun run test:pg` creates exactly that second database, so it is the
-- normal case and not the exotic one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'labkit_app') THEN
    CREATE ROLE labkit_app NOLOGIN NOSUPERUSER;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO labkit_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA ag_catalog TO labkit_app;
--> statement-breakpoint

-- `tenants` is SELECT-only and gets **no policy**: it has to be readable to turn
-- a slug into a tenant *before* the tenant is known, which is the boundary the
-- whole scheme starts at. It is written only by the superuser session above the
-- step down.
GRANT SELECT ON public.tenants TO labkit_app;
--> statement-breakpoint

-- The sequences and functions this file created, a few lines up.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO labkit_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.labkit_next_natural_id(text, text) TO labkit_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.labkit_prop(agtype, text) TO labkit_app;
--> statement-breakpoint

-- **And everything created after this point, which is the whole mechanism.**
-- `public.labkit_event` does not exist yet -- it arrives in 0003 -- so it
-- *cannot* be granted explicitly from here. Default privileges cover it, and
-- every table and sequence added in any later migration, with no further
-- statement. The ordering constraint forces the general solution.
--
-- **Verified rather than assumed, 2026-08-26**: a table created afterwards by
-- the migrating role reports `has_table_privilege('labkit_app', ..., 'SELECT,
-- INSERT,UPDATE,DELETE')` true, and its sequence
-- `has_sequence_privilege(..., 'USAGE,SELECT')` true, with no grant naming it.
--
-- So adding a tenant-aware table is: declare it with a `pgPolicy` in
-- src/db/schema.ts, run `bun run db:generate`, commit what comes out. **No
-- privilege work and no SQL to write.** One caveat, found by trying it rather
-- than by thinking about it: if the table has a foreign key, drizzle emits
-- `ALTER TABLE ... ADD CONSTRAINT`, and `bun run check:migrations` then wants a
-- `-- lock-strategy:` line on the generated file. That is the check working --
-- adding an FK really does take a lock and validate -- but it does mean one
-- comment gets prepended by hand, and a regenerate would lose it.
--
-- The one thing to know before relying on it: default privileges attach to the
-- role that **issues** them and apply to objects that role later creates. That
-- holds while one role runs every migration, which is true today (they run as
-- the connecting superuser). A deploy that migrated as a different role would
-- silently lose the coverage, and the tell would be a permissions error on a
-- table added later -- not here.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO labkit_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO labkit_app;
