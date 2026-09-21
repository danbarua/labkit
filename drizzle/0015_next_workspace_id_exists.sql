-- lock-strategy: online
-- Creates `labkit_next_workspace_id` if the record does not have it.
--
-- 0011 was edited after it had already run: it first shipped creating
-- `labkit_next_natural_id`, and was later changed to create
-- `labkit_next_workspace_id`. Drizzle selects migrations by timestamp, so the
-- amended text never re-runs, and a record that applied the first version has
-- the old name while the code calls the new one. 0013's `ALTER FUNCTION` on it
-- then fails with 42883 and the record cannot be opened.
CREATE OR REPLACE FUNCTION public.labkit_next_workspace_id(workspace text, prefix text)
RETURNS text
LANGUAGE plpgsql
SET search_path = ag_catalog, public
AS $fn$
DECLARE
  next_id bigint;
BEGIN
  EXECUTE format('SELECT nextval(%L)', format('%I.labkit_natural_id_seq', workspace))
    INTO next_id;
  RETURN prefix || '_' || next_id::text;
END;
$fn$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.labkit_next_workspace_id(text, text) TO labkit_app;
--> statement-breakpoint

-- `labkit_prop` takes `agtype`, so its own `search_path` must find `ag_catalog`.
ALTER FUNCTION public.labkit_prop(ag_catalog.agtype, text)
SET search_path = ag_catalog, public;
