LOAD 'age';

SET search_path = ag_catalog, "$user", public, labkit_t1;


CREATE OR REPLACE FUNCTION public.derive_label_from_handle(
  p_natural_id text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $function$
DECLARE
  node_label text;
BEGIN
  node_label := CASE split_part(p_natural_id, '_', 1)
    WHEN 'Q'     THEN 'Question'
    WHEN 'LOE'   THEN 'LineOfEnquiry'
    WHEN 'EU'    THEN 'EvidenceUnit'
    WHEN 'EV'    THEN 'Evidence'
    WHEN 'CLM'   THEN 'Claim'
    WHEN 'DEC'   THEN 'Decision'
    WHEN 'CRIT'  THEN 'Criterion'
    WHEN 'CEVAL' THEN 'CriterionEvaluation'
    WHEN 'GATE'  THEN 'Gate'
    WHEN 'REV'   THEN 'Review'
    WHEN 'ART'   THEN 'Artefact'
    WHEN 'COMP'  THEN 'Computation'
    WHEN 'TASK'  THEN 'Task'
    WHEN 'NOTE'  THEN 'Note'
    ELSE NULL
  END;

  IF node_label IS NULL THEN
    RAISE EXCEPTION 'Unrecognized natural id prefix in "%"', p_natural_id;
  END IF;

  RETURN node_label;
END;
$function$;


CREATE OR REPLACE FUNCTION public.entity_as_hal(
  p_natural_id text,
  p_depth smallint DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  result jsonb;
  root_label text;
  walk_row record;
  item jsonb;
  embedded_by_path jsonb := '{}'::jsonb;
  embedded jsonb;
  parent_embedded jsonb;
  relation_items jsonb;
  path_key text;
  parent_key text;
BEGIN
  IF p_depth IS NULL OR p_depth < 0 THEN
    RAISE EXCEPTION 'depth must be non-negative';
  END IF;

  IF p_natural_id !~ '^[A-Za-z0-9]+_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'Invalid natural_id: %', p_natural_id;
  END IF;

  root_label := public.derive_label_from_handle(p_natural_id);

  FOR walk_row IN EXECUTE format($sql$
    WITH RECURSIVE
    root AS (
      SELECT trim(both '"' FROM natural_id::text) AS id
      FROM ag_catalog.cypher(
        'labkit_t1'::name,
        $$MATCH (n:%s)
          WHERE n.natural_id = %L
            AND n.retracted IS NULL
          RETURN n.natural_id$$
      ) AS node(natural_id ag_catalog.agtype)
    ),

    edge_rows AS MATERIALIZED (
      SELECT
        trim(both '"' FROM source_id::text) AS source_id,
        trim(both '"' FROM relation::text) AS relation,
        trim(both '"' FROM target_id::text) AS target_id
      FROM ag_catalog.cypher(
        'labkit_t1'::name,
        $$
          MATCH (a)-[r]->(b)
          WHERE a.retracted IS NULL
            AND b.retracted IS NULL
          RETURN a.natural_id, type(r), b.natural_id
        $$
      ) AS edge(
        source_id ag_catalog.agtype,
        relation  ag_catalog.agtype,
        target_id ag_catalog.agtype
      )
    ),

    edges AS (
      SELECT source_id, target_id, relation, 'out'::text AS dir
      FROM edge_rows

      UNION ALL

      SELECT target_id, source_id, relation, 'in'::text
      FROM edge_rows
    ),

    walk(node_id, parent_id, relation, dir, depth, path) AS (
      SELECT id, NULL::text, NULL::text, NULL::text, 0, ARRAY[id]
      FROM root

      UNION ALL

      SELECT
        e.target_id,
        w.node_id,
        e.relation,
        e.dir,
        w.depth + 1,
        w.path || e.target_id
      FROM walk w
      JOIN edges e ON e.source_id = w.node_id
      WHERE w.depth < %s
        AND NOT e.target_id = ANY(w.path)
    )
    SELECT node_id, parent_id, relation, dir, depth, path
    FROM walk
    ORDER BY depth DESC, path
  $sql$, root_label, p_natural_id, p_depth)
  LOOP
    path_key := array_to_string(walk_row.path, E'\x1f');
    embedded := COALESCE(embedded_by_path -> path_key, '{}'::jsonb);

    item := jsonb_build_object(
      'id', walk_row.node_id,
      'dir', walk_row.dir,
      'depth', walk_row.depth,
      '_links', jsonb_build_object(
        'self', jsonb_build_object(
          'href', '/api/' || walk_row.node_id
        )
      ),
      '_embedded', embedded
    );

    IF walk_row.parent_id IS NULL THEN
      result := jsonb_build_object(
        'id', walk_row.node_id,
        '_links', jsonb_build_object(
          'self', jsonb_build_object(
            'href', '/api/' || walk_row.node_id
          ),
          'start', jsonb_build_object(
            'href', '/api/' || walk_row.node_id
          )
        ),
        '_embedded', embedded
      );
    ELSE
      parent_key := array_to_string(walk_row.path[1:array_length(walk_row.path, 1) - 1], E'\x1f');
      parent_embedded := COALESCE(embedded_by_path -> parent_key, '{}'::jsonb);
      relation_items := COALESCE(parent_embedded -> walk_row.relation, '[]'::jsonb);
      parent_embedded := jsonb_set(
        parent_embedded,
        ARRAY[walk_row.relation],
        relation_items || jsonb_build_array(item),
        true
      );
      embedded_by_path := jsonb_set(
        embedded_by_path,
        ARRAY[parent_key],
        parent_embedded,
        true
      );
    END IF;
  END LOOP;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Entity not found: %', p_natural_id;
  END IF;

  RETURN result;
END;
$function$;


-- test queries
SELECT public.entity_as_hal('Q_1'::TEXT, 6::SMALLINT)
UNION ALL
SELECT public.entity_as_hal('Q_5'::TEXT, 2::SMALLINT)
UNION ALL
SELECT public.entity_as_hal('Q_5'::TEXT, 3::SMALLINT)
UNION ALL
SELECT public.entity_as_hal('DEC_12'::TEXT, 4::SMALLINT);

SELECT public.entity_as_hal('EU_21'::TEXT, 4::SMALLINT);