-- lock-strategy: online
-- `labkit_get_collection_as_hal` pages the live nodes of one label as HAL+JSON, reusing
-- `labkit_get_entity_as_hal` per item so a collection's items carry exactly the same `_links`/
-- `_embedded`/`props` shape a caller already gets from the single-entity view, at the caller's own
-- `depth`.
--
-- The label a caller asks for is checked against what the tenant's own graph actually has
-- (`ag_catalog.ag_label`), never against a fixed vocabulary: two tenants can carry entirely
-- different label sets, and this function does not assume either one.
--
-- URLs are relative and pagination is the only thing embedded in them (`offset`/`limit`); turning
-- them absolute, substituting a label for its slug, and round-tripping a caller's other querystring
-- preferences are HTTP-layer concerns, done the same way the single-entity view already does them.
CREATE FUNCTION public.labkit_get_collection_as_hal(
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

  IF NOT EXISTS (
    SELECT 1 FROM ag_catalog.ag_label l
    JOIN ag_catalog.ag_graph g ON g.graphid = l.graph
    WHERE g.name = graph_name AND l.kind = 'v' AND l.name = p_label
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
          WHERE n.retracted IS NULL
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
      'href', format('/collections/%s?offset=%s&limit=%s', p_label, p_offset, p_limit)
    )
  );
  IF p_offset > 0 THEN
    links := links || jsonb_build_object(
      'prev', jsonb_build_object(
        'href', format('/collections/%s?offset=%s&limit=%s', p_label, greatest(p_offset - p_limit, 0), p_limit)
      )
    );
  END IF;
  IF has_more THEN
    links := links || jsonb_build_object(
      'next', jsonb_build_object(
        'href', format('/collections/%s?offset=%s&limit=%s', p_label, p_offset + p_limit, p_limit)
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
$function$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.labkit_get_collection_as_hal(integer, text, integer, integer, integer) TO labkit_app;
