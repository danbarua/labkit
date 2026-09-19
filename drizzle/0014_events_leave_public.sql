-- lock-strategy: online
-- allow-destructive: events live in the tenant's schema as `domain_event`. This moves any
-- rows still in `public.labkit_event` and drops it.
DO $mv$
DECLARE t record;
BEGIN
  FOR t IN SELECT id, graph_name FROM public.tenants LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = t.graph_name);

    -- 0.7.459 to 0.7.472 called it `labkit_event` in the workspace too.
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND c.relname = 'labkit_event' AND n.nspname = t.graph_name
    ) THEN
      EXECUTE format('ALTER TABLE %I.labkit_event RENAME TO domain_event', t.graph_name);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND c.relname = 'domain_event' AND n.nspname = t.graph_name
    ) THEN
      EXECUTE format(
        'CREATE TABLE %I.domain_event (LIKE public.labkit_event INCLUDING DEFAULTS INCLUDING INDEXES)',
        t.graph_name);
      EXECUTE format(
        'ALTER TABLE %I.domain_event ADD CONSTRAINT domain_event_tenant_id_tenants_id_fk
           FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)', t.graph_name);
      EXECUTE format('ALTER TABLE %I.domain_event ENABLE ROW LEVEL SECURITY', t.graph_name);
      EXECUTE format(
        'CREATE POLICY domain_event_tenant_isolation ON %I.domain_event FOR ALL TO labkit_app
           USING (tenant_id = current_setting(''labkit.tenant_id'')::int)
           WITH CHECK (tenant_id = current_setting(''labkit.tenant_id'')::int)', t.graph_name);
    END IF;

    EXECUTE format('ALTER TABLE %I.domain_event ALTER COLUMN seq DROP DEFAULT', t.graph_name);

    EXECUTE format(
      'INSERT INTO %I.domain_event
         SELECT e.* FROM public.labkit_event e
          WHERE e.tenant_id = $1
            AND NOT EXISTS (SELECT 1 FROM %I.domain_event w WHERE w.seq = e.seq)',
      t.graph_name, t.graph_name) USING t.id;

    -- One counter serves both the event number and the ids an act mints, so it has to clear
    -- whatever was just moved in. Absent on a record that has not been provisioned since
    -- 0.7.457 — `ensureNaturalIdSequence` creates it, after this runs, and seeds it from
    -- these same rows.
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'S' AND c.relname = 'labkit_natural_id_seq' AND n.nspname = t.graph_name
    ) THEN
      EXECUTE format(
        'SELECT setval(%L, m.high, true)
           FROM (SELECT max(seq) AS high FROM %I.domain_event) m
          WHERE m.high IS NOT NULL
            AND m.high >= (SELECT last_value FROM %I.labkit_natural_id_seq)',
        t.graph_name || '.labkit_natural_id_seq', t.graph_name, t.graph_name);
    END IF;
  END LOOP;
END;
$mv$;--> statement-breakpoint

DROP TABLE public.labkit_event;
--> statement-breakpoint

-- 0013's function writes to the old name.
CREATE OR REPLACE FUNCTION public.labkit_record_event(workspace text, tenant integer, payload jsonb)
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
    'INSERT INTO %I.domain_event
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
$fn$;
