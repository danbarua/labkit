-- lock-strategy: online
--
-- Custom (hand-edited from `drizzle-kit generate`): the row-level-security
-- role, its policy, and the grants that make the role usable.
--
-- The one `ALTER TABLE` here is `ENABLE ROW LEVEL SECURITY`, a catalog flip
-- rather than a rewrite: no table scan, no data touched. It still takes ACCESS
-- EXCLUSIVE, so it queues behind a long-running transaction on this table and
-- blocks readers while it waits — set a `lock_timeout` if this ever runs
-- against a database that is not brand new.
--
-- **What this buys, stated honestly.** A session connects as a superuser,
-- loads AGE, resolves its tenant, and only then steps down to `labkit_app`
-- with its tenant pinned to a session GUC (src/db/scoped.ts). From that point
-- a query that forgets its tenant filter returns that tenant's rows anyway, and
-- one that writes another tenant's row is refused. It is a **safety** boundary,
-- not a security one: the session can `RESET ROLE` back to superuser. Bugs do
-- not issue `RESET ROLE`; that is the whole of the claim.
--
-- **Why not a login role.** Measured 2026-08-26: `LOAD 'age'` is refused to a
-- non-superuser (`access to library "age" is not allowed`, 42501), and without
-- the library the `agtype` type does not resolve, so every Cypher query fails —
-- reads included. Stepping down after `bootstrapSession` keeps the library
-- loaded for the session. A deployment wanting a genuine login boundary would
-- need `ALTER ROLE labkit_app SET session_preload_libraries = 'age'`; noted,
-- not built, not measured.
--
-- **`CREATE ROLE` is guarded, and drizzle-kit will not do that for you.** A
-- role is cluster-scoped while drizzle's migration ledger is per-database, so a
-- second LabKit database in the same cluster hits "role already exists" on its
-- first migration. `bun run test:pg` creates `labkit_tests` beside whatever
-- else is in the container, which makes this the normal case rather than the
-- exotic one. The generated line was `CREATE ROLE "labkit_app";`.
--
-- **`NOSUPERUSER`** is the point rather than a detail: a superuser bypasses RLS
-- unconditionally, and `FORCE ROW LEVEL SECURITY` is not enough to stop it
-- (measured). `NOLOGIN` because nothing connects as this role — it is only ever
-- stepped into.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'labkit_app') THEN
    CREATE ROLE labkit_app NOLOGIN NOSUPERUSER;
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "labkit_event" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "labkit_event_tenant_isolation" ON "labkit_event";
--> statement-breakpoint
CREATE POLICY "labkit_event_tenant_isolation" ON "labkit_event" AS PERMISSIVE FOR ALL TO "labkit_app" USING (tenant_id = current_setting('labkit.tenant_id')::int) WITH CHECK (tenant_id = current_setting('labkit.tenant_id')::int);
--> statement-breakpoint

-- The grants. Drizzle does not manage these at all, so they are hand-written,
-- and they are the half that decides whether the role can do anything: without
-- them the step down succeeds and the next query fails on permissions.
--
-- `tenants` is SELECT-only and has **no policy**: it must be readable to turn a
-- slug into a tenant *before* the tenant is known, which is the boundary this
-- scheme starts at. It is written only by the superuser session above the step
-- down.
--
-- Per-tenant graph schemas are **not** here. They are created at runtime by
-- `provisionTenantGraph()`, so their grants are reconciled there, on every
-- resolve — the same self-healing property PJ-005 argued for, and the reason a
-- label added next year needs no migration.
GRANT USAGE ON SCHEMA public TO labkit_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA ag_catalog TO labkit_app;
--> statement-breakpoint
GRANT SELECT ON public.tenants TO labkit_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labkit_event TO labkit_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO labkit_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.labkit_next_natural_id(text, text) TO labkit_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.labkit_prop(agtype, text) TO labkit_app;
