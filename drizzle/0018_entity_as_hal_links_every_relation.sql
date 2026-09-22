-- lock-strategy: online
-- `labkit_get_entity_as_hal` links every relation, not only what an edge's own properties made
-- worth mentioning.
--
-- Before, a relation reached `_links` only at the boundary the walk stopped at, or if the API's
-- own edge-properties work landed first. Everywhere else, a related resource sat only in
-- `_embedded`, and `_links` said nothing about it -- HAL as a shortcut for the embed, not HAL
-- properly, where a link and its embed can both be there. Now every relation gets a `_links`
-- entry at every depth, embedded or boundary, with or without edge properties. `_embedded` still
-- says what it always said; `_links` now says the same thing everywhere, plus `props` when the
-- edge that reaches it carries any.
--
-- The two accumulators the walk kept, one for a boundary neighbour's link and one for what an
-- embedded neighbour's parent should show, collapse into one: a parent's direct children are
-- always uniformly boundary-only or embedded (the walk only ever extends one hop past `depth` to
-- record what lies beyond), so building both the same way loses nothing.
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
        edge_properties::text AS edge_properties,
        trim(both '"' FROM target_id::text) AS target_id,
        regexp_replace(target_type::text, '^\["([^"]+)"\]$', '\1') AS target_type,
        target_properties::text AS target_properties
      FROM ag_catalog.cypher(
        %L::name,
        $$
          MATCH (a)-[r]->(b)
          WHERE a.retracted IS NULL
            AND b.retracted IS NULL
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
$function$;

-- No new grant: the signature is unchanged, and `labkit_app` already has EXECUTE on it from
-- migration 0017.
