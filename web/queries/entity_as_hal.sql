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
  p_depth integer DEFAULT 1
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
  boundary_links_by_path jsonb := '{}'::jsonb;
  links jsonb;
  link_items jsonb;
  relation_key text;
  root_properties jsonb;
  path_key text;
  parent_key text;
BEGIN
  IF p_depth IS NULL OR p_depth < 0 THEN
    RAISE EXCEPTION 'depth must be non-negative';
  END IF;

  IF p_depth > 6 THEN
    RAISE EXCEPTION 'maximum traversal depth is 6';
  END IF;

  IF p_natural_id !~ '^[A-Za-z0-9]+_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'Invalid natural_id: %', p_natural_id;
  END IF;

  root_label := public.derive_label_from_handle(p_natural_id);

  FOR walk_row IN EXECUTE format($sql$
    WITH RECURSIVE
    root AS (
      SELECT
        trim(both '"' FROM natural_id::text) AS id,
        properties_text::text AS properties_text
      FROM ag_catalog.cypher(
        'labkit_t1'::name,
        $$MATCH (n:%s)
          WHERE n.natural_id = %L
            AND n.retracted IS NULL
          RETURN n.natural_id, properties(n)::text$$
      ) AS node(
        natural_id ag_catalog.agtype,
        properties_text ag_catalog.agtype
      )
    ),

    edge_rows AS MATERIALIZED (
      SELECT
        trim(both '"' FROM source_id::text) AS source_id,
        regexp_replace(source_type::text, '^\["([^"]+)"\]$', '\1') AS source_type,
        source_properties::text AS source_properties,
        trim(both '"' FROM relation::text) AS relation,
        trim(both '"' FROM target_id::text) AS target_id,
        regexp_replace(target_type::text, '^\["([^"]+)"\]$', '\1') AS target_type,
        target_properties::text AS target_properties
      FROM ag_catalog.cypher(
        'labkit_t1'::name,
        $$
          MATCH (a)-[r]->(b)
          WHERE a.retracted IS NULL
            AND b.retracted IS NULL
          RETURN
            a.natural_id,
            labels(a)::text,
            properties(a)::text,
            type(r),
            b.natural_id,
            labels(b)::text,
            properties(b)::text
        $$
      ) AS edge(
        source_id ag_catalog.agtype,
        source_type ag_catalog.agtype,
        source_properties ag_catalog.agtype,
        relation  ag_catalog.agtype,
        target_id ag_catalog.agtype,
        target_type ag_catalog.agtype,
        target_properties ag_catalog.agtype
      )
    ),

    edges AS (
      SELECT
        source_id,
        target_id,
        relation,
        'out'::text AS dir,
        target_type AS node_type,
        target_properties AS node_properties
      FROM edge_rows

      UNION ALL

      SELECT
        target_id,
        source_id,
        relation,
        'in'::text,
        source_type,
        source_properties
      FROM edge_rows
    ),

    walk(node_id, parent_id, relation, dir, depth, path, node_type, node_properties) AS (
      SELECT
        id,
        NULL::text,
        NULL::text,
        NULL::text,
        0,
        ARRAY[id],
        %L::text,
        CASE
          WHEN properties_text IS NULL OR properties_text = 'None' THEN '{}'::jsonb
          ELSE properties_text::jsonb - 'natural_id'
        END
      FROM root

      UNION ALL

      SELECT
        e.target_id,
        w.node_id,
        e.relation,
        e.dir,
        w.depth + 1,
        w.path || e.target_id,
        e.node_type,
        CASE
          WHEN e.node_properties IS NULL OR e.node_properties = 'None' THEN '{}'::jsonb
          ELSE e.node_properties::jsonb - 'natural_id'
        END
      FROM walk w
      JOIN edges e ON e.source_id = w.node_id
      WHERE w.depth < %s
        AND NOT e.target_id = ANY(w.path)
    )
    SELECT node_id, parent_id, relation, dir, depth, path, node_type, node_properties
    FROM walk
    ORDER BY depth DESC, path
  $sql$, root_label, p_natural_id, root_label, p_depth + 1)
  LOOP
    IF walk_row.depth = p_depth + 1 THEN
      relation_key := lower(
        CASE walk_row.dir
          WHEN 'out' THEN walk_row.relation || ':' || walk_row.node_type
          ELSE walk_row.node_type || ':' || walk_row.relation
        END
      );
      parent_key := array_to_string(walk_row.path[1:array_length(walk_row.path, 1) - 1], E'\x1f');
      parent_embedded := COALESCE(boundary_links_by_path -> parent_key, '{}'::jsonb);
      link_items := COALESCE(parent_embedded -> relation_key, '[]'::jsonb);
      parent_embedded := jsonb_set(
        parent_embedded,
        ARRAY[relation_key],
        link_items || jsonb_build_array(
          jsonb_build_object(
            'href', '/graph/' || walk_row.node_id,
            'dir', walk_row.dir,
            'type', walk_row.node_type
          )
        ),
        true
      );
      boundary_links_by_path := jsonb_set(
        boundary_links_by_path,
        ARRAY[parent_key],
        parent_embedded,
        true
      );
    ELSE
      path_key := array_to_string(walk_row.path, E'\x1f');
      embedded := COALESCE(embedded_by_path -> path_key, '{}'::jsonb);
      links := jsonb_build_object(
        'self', jsonb_build_object(
          'href', '/graph/' || walk_row.node_id,
          'type', walk_row.node_type
        )
      );
      IF walk_row.depth = p_depth THEN
        links := links || COALESCE(boundary_links_by_path -> path_key, '{}'::jsonb);
      END IF;

      item := COALESCE(walk_row.node_properties, '{}'::jsonb)
        || jsonb_build_object(
          'id', walk_row.node_id,
          'type', walk_row.node_type,
          'dir', walk_row.dir,
          'depth', walk_row.depth,
          '_links', links
        );
      IF walk_row.depth < p_depth AND embedded <> '{}'::jsonb THEN
        item := item || jsonb_build_object('_embedded', embedded);
      END IF;

      IF walk_row.parent_id IS NULL THEN
        result := COALESCE(walk_row.node_properties, '{}'::jsonb)
          || jsonb_build_object(
            'id', walk_row.node_id,
            'type', walk_row.node_type,
            '_links', links || jsonb_build_object(
              'start', jsonb_build_object(
                'href', '/graph/' || walk_row.node_id,
                'type', walk_row.node_type
              )
            )
          );
        IF p_depth > 0 AND embedded <> '{}'::jsonb THEN
          result := result || jsonb_build_object('_embedded', embedded);
        END IF;
      ELSE
        relation_key := lower(
          CASE walk_row.dir
            WHEN 'out' THEN walk_row.relation || ':' || walk_row.node_type
            ELSE walk_row.node_type || ':' || walk_row.relation
          END
        );
        parent_key := array_to_string(walk_row.path[1:array_length(walk_row.path, 1) - 1], E'\x1f');
        parent_embedded := COALESCE(embedded_by_path -> parent_key, '{}'::jsonb);
        relation_items := COALESCE(parent_embedded -> relation_key, '[]'::jsonb);
        parent_embedded := jsonb_set(
          parent_embedded,
          ARRAY[relation_key],
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
    END IF;
  END LOOP;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Entity not found: %', p_natural_id;
  END IF;

  RETURN result;
END;
$function$;

ALTER FUNCTION public.entity_as_hal(text, integer)
SET search_path = ag_catalog;

