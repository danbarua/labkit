-- lock-strategy: online
-- The database assigns an act's number and stamps it into the act's own ids.
--
-- A write command stages its changes with a placeholder where a new record's
-- id goes -- `{{Q}}` for a Question, `{{LOE}}` for a line of enquiry. This
-- function takes the workspace's next number, rewrites every placeholder to
-- `<PREFIX>_<number>`, and inserts the row under that number. The caller never
-- supplies a key and never invents an id: it reads both back.
--
-- Substitution is per field, not over the serialised text: `id`, `from` and
-- `to` are the only places a handle appears in a change, and a regex over the
-- whole payload would also rewrite a researcher's prose.
--
-- Every function here carries its own `search_path`, so it works whatever the
-- caller's session is set to. Without it, a caller whose session has not put
-- `ag_catalog` on the path gets an error about a missing type or operator, and
-- the fix is in the session rather than anywhere near the failure.
CREATE FUNCTION public.labkit_resolve_handle(handle text, number bigint)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = ag_catalog, public AS $fn$
  SELECT CASE
    WHEN handle ~ '^\{\{[A-Z]+\}\}$'
      THEN substring(handle from '^\{\{([A-Z]+)\}\}$') || '_' || number::text
    ELSE handle
  END;
$fn$;--> statement-breakpoint

CREATE FUNCTION public.labkit_resolve_change(change jsonb, number bigint)
RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path = ag_catalog, public AS $fn$
  SELECT change
    || CASE WHEN change ? 'id'
         THEN jsonb_build_object('id', public.labkit_resolve_handle(change->>'id', number))
         ELSE '{}'::jsonb END
    || CASE WHEN change ? 'from'
         THEN jsonb_build_object('from', public.labkit_resolve_handle(change->>'from', number))
         ELSE '{}'::jsonb END
    || CASE WHEN change ? 'to'
         THEN jsonb_build_object('to', public.labkit_resolve_handle(change->>'to', number))
         ELSE '{}'::jsonb END;
$fn$;--> statement-breakpoint

CREATE FUNCTION public.labkit_record_event(workspace text, tenant integer, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql
SET search_path = ag_catalog, public AS $fn$
DECLARE
  number bigint;
  resolved_subject text;
  resolved_changes jsonb;
BEGIN
  EXECUTE format('SELECT nextval(%L)', format('%I.labkit_natural_id_seq', workspace))
    INTO number;

  resolved_subject := public.labkit_resolve_handle(payload->>'subject', number);

  SELECT coalesce(jsonb_agg(public.labkit_resolve_change(c, number) ORDER BY ord), '[]'::jsonb)
    INTO resolved_changes
    FROM jsonb_array_elements(coalesce(payload->'changes', '[]'::jsonb))
         WITH ORDINALITY AS t(c, ord);

  EXECUTE format(
    'INSERT INTO %I.labkit_event
       (seq, tenant_id, at, operation, subject, changes, attribution_label, attribution_id,
        attribution_how, git_hash, reconstructed_from, command)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', workspace)
  USING number, tenant, payload->>'at', payload->>'operation', resolved_subject,
        resolved_changes, payload->>'attribution_label', payload->>'attribution_id',
        payload->>'attribution_how', payload->>'git_hash', payload->>'reconstructed_from',
        payload->'command';

  RETURN jsonb_build_object('seq', number, 'subject', resolved_subject,
                            'changes', resolved_changes);
END;
$fn$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.labkit_resolve_handle(text, bigint) TO labkit_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.labkit_resolve_change(jsonb, bigint) TO labkit_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.labkit_record_event(text, integer, jsonb) TO labkit_app;
