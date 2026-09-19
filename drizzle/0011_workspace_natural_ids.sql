-- lock-strategy: online
-- One natural-id sequence per workspace, in the workspace's own schema.
--
-- There were fifteen sequences, one per label, all in `public`. Two workspaces
-- in one database drew from the same counters, so a tenant's numbering had
-- holes wherever another tenant had minted, and no tenant's ids could be
-- streamed into a second database from a checkpoint without colliding.
--
-- The sequences themselves are created by `provisionTenantGraph`, which owns
-- everything else in a workspace schema. This migration replaces the function
-- that reads them. The old per-label sequences in `public` are left in place:
-- an existing record's ids were minted from them and must not be re-minted,
-- and dropping a sequence nothing reads costs nothing to defer.
-- The old function has the same signature — (text, text) — and Postgres
-- refuses to rename an input parameter in CREATE OR REPLACE, so it is dropped
-- first rather than replaced. Nothing reads it between these two statements:
-- a migration runs in one transaction.
DROP FUNCTION IF EXISTS public.labkit_next_natural_id(text, text);
--> statement-breakpoint

CREATE FUNCTION public.labkit_next_natural_id(workspace text, prefix text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_id bigint;
BEGIN
  -- `format(%I)` quotes the identifier: `workspace` is `tenants.graph_name`,
  -- a generated column, and never caller input — but a function that builds a
  -- name should say so in the call rather than in a comment somewhere else.
  EXECUTE format('SELECT nextval(%L)', format('%I.labkit_natural_id_seq', workspace))
    INTO next_id;
  RETURN prefix || '_' || next_id::text;
END;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.labkit_next_natural_id(text, text) TO labkit_app;
