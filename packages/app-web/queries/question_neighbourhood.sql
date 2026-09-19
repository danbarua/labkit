LOAD 'age';
SET search_path = ag_catalog, "$user", public;

-- That is expected: a variable-length path is returned by AGE as a JSON-like array. 
-- To preserve individual graph edges, expand each path’s relationships and return endpoint–edge–endpoint triples:
SELECT *
FROM ag_catalog.cypher('labkit_t1', $$
  MATCH p = (q:Question {natural_id: 'Q_5'})-[*1..6]-(n)
  UNWIND relationships(p) AS rel
  RETURN startNode(rel), rel, endNode(rel)
$$) AS (
  source agtype,
  relationship agtype,
  target agtype
);