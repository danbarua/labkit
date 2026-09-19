-- lock-strategy: online
-- One natural-id sequence per workspace, in the workspace's own schema.
--
-- There were fifteen sequences, one per label, all in `public`. Two workspaces
-- in one database drew from the same counters, so a tenant's numbering had
-- holes wherever another tenant had minted, and no tenant's ids could be
-- streamed into a second database from a checkpoint without colliding.
--
-- The sequences themselves are created by `provisionTenantGraph`, which owns
-- everything else in a workspace schema. This migration adds the function that
-- reads them.
--
-- A new name rather than a replacement, and nothing is dropped. The old
-- function has the same signature and a different meaning — its first argument
-- is a label, this one's is a workspace — so replacing it would make a code
-- rollback call the new body with a label and look for a schema named
-- `question`. Both exist; the name says which is which; the old one and the
-- per-label sequences it reads go in a later migration once nothing calls
-- them.
CREATE FUNCTION public.labkit_next_workspace_id(workspace text, prefix text)
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

GRANT EXECUTE ON FUNCTION public.labkit_next_workspace_id(text, text) TO labkit_app;
