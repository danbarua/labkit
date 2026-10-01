-- lock-strategy: online
-- The HAL read functions stop naming what the record no longer holds: no handle prefix maps to
-- `Review`, and no node is filtered on a `retracted` property.
--
-- Signatures are unchanged, so the grants from migrations 0017 and 0019 still apply.
CREATE OR REPLACE FUNCTION public.labkit_get_label_for_handle(
  p_natural_id text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ag_catalog, public
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
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.labkit_get_entity_as_hal(
  p_graph_name text,
  p_natural_id text,
  p_depth integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ag_catalog, public
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
  links_by_path jsonb := '{}'::jsonb;
  parent_links jsonb;
  link_items jsonb;
  link_object jsonb;
  links jsonb;
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

  root_label := public.labkit_get_label_for_handle(p_natural_id);

  FOR walk_row IN EXECUTE format($sql$
    WITH RECURSIVE
    root AS (
      SELECT
        trim(both '"' FROM natural_id::text) AS id,
        properties_text::text AS properties_text
      FROM ag_catalog.cypher(
        %L::name,
        $$MATCH (n:%s)
          WHERE n.natural_id = %L
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
        edge_properties::text AS edge_properties,
        trim(both '"' FROM target_id::text) AS target_id,
        regexp_replace(target_type::text, '^\["([^"]+)"\]$', '\1') AS target_type,
        target_properties::text AS target_properties
      FROM ag_catalog.cypher(
        %L::name,
        $$
          MATCH (a)-[r]->(b)
          RETURN
            a.natural_id,
            labels(a)::text,
            properties(a)::text,
            type(r),
            properties(r)::text,
            b.natural_id,
            labels(b)::text,
            properties(b)::text
        $$
      ) AS edge(
        source_id ag_catalog.agtype,
        source_type ag_catalog.agtype,
        source_properties ag_catalog.agtype,
        relation  ag_catalog.agtype,
        edge_properties ag_catalog.agtype,
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
        edge_properties,
        'out'::text AS dir,
        target_type AS node_type,
        target_properties AS node_properties
      FROM edge_rows

      UNION ALL

      SELECT
        target_id,
        source_id,
        relation,
        edge_properties,
        'in'::text,
        source_type,
        source_properties
      FROM edge_rows
    ),

    walk(node_id, parent_id, relation, edge_properties, dir, depth, path, node_type, node_properties) AS (
      SELECT
        id,
        NULL::text,
        NULL::text,
        '{}'::jsonb,
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
        CASE
          WHEN e.edge_properties IS NULL OR e.edge_properties = 'None' THEN '{}'::jsonb
          ELSE e.edge_properties::jsonb
        END,
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
    SELECT node_id, parent_id, relation, edge_properties, dir, depth, path, node_type, node_properties
    FROM walk
    ORDER BY depth DESC, path
  $sql$, p_graph_name, root_label, p_natural_id, p_graph_name, root_label, p_depth + 1)
  LOOP
    -- Every relation gets a link, at the point its child is discovered: whether that child ends up
    -- embedded (depth <= p_depth) or is only a boundary stub (depth = p_depth + 1), and whether or
    -- not the edge carries properties. A parent's direct children are always uniformly one kind or
    -- the other, so one map serves both without collision.
    IF walk_row.parent_id IS NOT NULL THEN
      relation_key := lower(
        CASE walk_row.dir
          WHEN 'out' THEN walk_row.relation || ':' || walk_row.node_type
          ELSE walk_row.node_type || ':' || walk_row.relation
        END
      );
      parent_key := array_to_string(walk_row.path[1:array_length(walk_row.path, 1) - 1], E'\x1f');
      link_object := jsonb_build_object(
        'href', '/graph/' || walk_row.node_id,
        'dir', walk_row.dir,
        'type', walk_row.node_type
      );
      IF walk_row.edge_properties IS NOT NULL AND walk_row.edge_properties <> '{}'::jsonb THEN
        link_object := link_object || jsonb_build_object('props', walk_row.edge_properties);
      END IF;
      parent_links := COALESCE(links_by_path -> parent_key, '{}'::jsonb);
      link_items := COALESCE(parent_links -> relation_key, '[]'::jsonb);
      parent_links := jsonb_set(
        parent_links,
        ARRAY[relation_key],
        link_items || jsonb_build_array(link_object),
        true
      );
      links_by_path := jsonb_set(links_by_path, ARRAY[parent_key], parent_links, true);
    END IF;

    IF walk_row.depth <= p_depth THEN
      path_key := array_to_string(walk_row.path, E'\x1f');
      embedded := COALESCE(embedded_by_path -> path_key, '{}'::jsonb);
      links := jsonb_build_object(
        'self', jsonb_build_object(
          'href', '/graph/' || walk_row.node_id,
          'type', walk_row.node_type
        )
      ) || COALESCE(links_by_path -> path_key, '{}'::jsonb);

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
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.labkit_get_collection_as_hal(
  p_tenant_id integer,
  p_label text,
  p_offset integer,
  p_limit integer,
  p_depth integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ag_catalog, public
AS $function$
DECLARE
  graph_name text;
  page_row record;
  items jsonb := '[]'::jsonb;
  seen integer := 0;
  has_more boolean := false;
  links jsonb;
BEGIN
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'offset must be non-negative';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'limit must be between 1 and 200';
  END IF;

  IF p_depth IS NULL OR p_depth < 0 OR p_depth > 6 THEN
    RAISE EXCEPTION 'depth must be between 0 and 6';
  END IF;

  SELECT t.graph_name INTO graph_name FROM public.tenants t WHERE t.id = p_tenant_id;
  IF graph_name IS NULL THEN
    RAISE EXCEPTION 'no tenant %', p_tenant_id;
  END IF;

  -- A vertex label is a table in the graph's schema that inherits `_ag_label_vertex`. Read from
  -- `pg_catalog`, which every role can, because the role the API runs as cannot read `ag_label`.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_inherits i ON i.inhrelid = c.oid
    JOIN pg_catalog.pg_class parent ON parent.oid = i.inhparent
    WHERE n.nspname = graph_name
      AND c.relname = p_label
      AND parent.relnamespace = n.oid
      AND parent.relname = '_ag_label_vertex'
  ) THEN
    RAISE EXCEPTION 'no label % in graph %', p_label, graph_name;
  END IF;

  -- One more row than the page needs, so `has_more` is known without a separate COUNT(*) scan.
  FOR page_row IN EXECUTE format($sql$
    SELECT id FROM (
      SELECT trim(both '"' FROM r.id::text) AS id
      FROM ag_catalog.cypher(
        %L::name,
        $$MATCH (n:%s)
          RETURN n.natural_id$$
      ) AS r(id ag_catalog.agtype)
    ) t
    ORDER BY length(id), id
    LIMIT %s OFFSET %s
  $sql$, graph_name, p_label, p_limit + 1, p_offset)
  LOOP
    seen := seen + 1;
    IF seen > p_limit THEN
      has_more := true;
      EXIT;
    END IF;
    items := items || jsonb_build_array(public.labkit_get_entity_as_hal(graph_name, page_row.id, p_depth));
  END LOOP;

  links := jsonb_build_object(
    'self', jsonb_build_object(
      'href', format('/collections/%s?limit=%s&offset=%s', p_label, p_limit, p_offset)
    )
  );
  IF p_offset > 0 THEN
    links := links || jsonb_build_object(
      'prev', jsonb_build_object(
        'href', format('/collections/%s?limit=%s&offset=%s', p_label, p_limit, greatest(p_offset - p_limit, 0))
      )
    );
  END IF;
  IF has_more THEN
    links := links || jsonb_build_object(
      'next', jsonb_build_object(
        'href', format('/collections/%s?limit=%s&offset=%s', p_label, p_limit, p_offset + p_limit)
      )
    );
  END IF;

  RETURN jsonb_build_object(
    '_links', links,
    'offset', p_offset,
    'limit', p_limit,
    'count', jsonb_array_length(items),
    '_embedded', jsonb_build_object(p_label, items)
  );
END;
$function$;
