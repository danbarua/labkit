---
name: postgres-age
description: |
  Offline reference for Apache AGE (the Postgres graph extension LabKit runs
  its domain graph on, via pglite-age) — core Cypher clauses, the SQL/Cypher
  composition patterns under "AGE Beyond Cypher" and "SQL In Cypher", how
  graphs are physically stored, and the specific syntax gotchas and query
  patterns this repo has already hit. Condensed from
  https://age.apache.org/age-manual/master/, not a copy-paste dump.
triggers:
  - "cypher"
  - "apache age"
  - "pglite-age"
  - "graph query"
  - "agtype"
---

# Apache AGE — LabKit reference

LabKit's provenance graph (Question, LineOfEnquiry, EvidenceUnit, Evidence,
Claim, Decision, Criterion, CriterionEvaluation, Gate, Review, Artefact,
Computation, Task — see `docs/project-journal/001_git_init.md`) lives in one
Apache AGE graph named `labkit`, running inside PGlite via `pglite-age`. All
of it should be reached through `src/db/graph.ts`'s helpers
(`cypher`, `createNode`, `createEdge`, `bootstrapSession`) — this document is
what those helpers, and the migrations in `./drizzle/`, were written against.

`pglite-age` is a WASM build of AGE, not the stock C extension. It has
already been found to diverge from the upstream manual in a few places (see
"LabKit-specific gotchas" below) — treat anything not already proven working
in this repo's own tests as worth a throwaway spike before trusting it.

## Core Cypher clauses

Only what this repo actually uses, or is a near neighbor likely to be needed
next:

| Clause | Use |
|---|---|
| `MATCH (n:Label {k: v})` | Find nodes/paths by label and exact property match |
| `OPTIONAL MATCH` | Left-join semantics — binds to `NULL` instead of dropping the row when nothing matches |
| `CREATE (n:Label {k: v})` | Create a node; `CREATE (a)-[:EDGE]->(b)` creates an edge between already-matched nodes |
| `SET n.prop = value` | Mutate a property on an already-matched node |
| `WHERE` | Filter after a `MATCH`, e.g. `WHERE n.name = $name` |
| `RETURN` | Required — a bare `MATCH`/`CREATE` returns nothing to SQL |
| `WITH` | Chain query stages, e.g. aggregate then filter |
| `[:TYPE*1..5]` | Single-type variable-length path, N to M hops |

## AGE Beyond Cypher (SQL ↔ Cypher composition)

From the manual's "AGE Beyond Cypher" section — confirmed against the live
docs, not assumed:

- **Cypher in a CTE has no restrictions.** `WITH x AS (SELECT * FROM
  cypher('labkit', $$ ... $$) AS (n agtype)) SELECT * FROM x`. This is the
  basis for turning a Cypher read into a plain SQL `VIEW`.
- **Cypher in a `JOIN` works for reads.** `CREATE`/`SET`/`REMOVE` Cypher
  clauses inside a `JOIN` are explicitly documented as unsafe — they
  interact badly with Postgres's transaction system. Wrap a write in a CTE
  first if it needs to sit inside a larger SQL statement.
- **Cypher can't sit in a scalar SQL expression directly**, only in a
  FROM-clause subquery. For a query known to return one row/column, use `=`
  against a `(SELECT a FROM cypher(...) ...)` subquery; for one column but
  possibly many rows, use `IN (...)`; for multiple columns/rows, use
  `EXISTS (...)`.
- **Multiple graphs can be joined in one statement**: `FROM cypher('g1', $$
  ... $$) AS g1(...) JOIN cypher('g2', $$ ... $$) AS g2(...) ON ...`.

LabKit doesn't currently need any of these beyond the CTE/view pattern — the
CQRS read-side views in `drizzle/0002_natural_ids.sql` use it, see below.

## SQL In Cypher

A `LANGUAGE sql` Postgres function can be called from inside a Cypher
clause — only void/scalar-returning functions, **not** set-returning ones.
LabKit's natural-id generator is exactly this pattern:

```sql
CREATE OR REPLACE FUNCTION labkit_next_natural_id(label text, prefix text)
RETURNS text LANGUAGE sql AS $$
  SELECT prefix || '-' || nextval('labkit_' || lower(label) || '_natural_id_seq')::text;
$$;
```

```cypher
CREATE (n:Computation {
  kind: $kind,
  natural_id: labkit_next_natural_id('computation'::text, 'COMP'::text)
})
RETURN n
```

**The `::text` casts on the literal arguments are required, not decorative**
— see the gotcha below. This exact composition (function call inside a
Cypher `CREATE` property map) was spiked and confirmed working against
`pglite-age` before being written into `src/db/graph.ts`'s `createNode()`.

## How graphs are stored

`SELECT create_graph('labkit')` creates a Postgres **namespace** (schema)
named `labkit`, containing parent tables `_ag_label_vertex`/`_ag_label_edge`.
Every vertex/edge label — `create_vlabel`/`create_elabel`, or implicitly the
first `CREATE (n:Label)` — becomes its own real Postgres table inheriting
from those parents, visible in `ag_catalog.ag_label`. Confirmed by inspecting
`information_schema.columns` for `labkit."Question"` after creating one:
exactly two columns, `id` (the internal graphid) and `properties` (agtype).

This means **plain SQL DDL can target a label's table directly** — no need
to go through `cypher()` for indexes, constraints, or bulk reads:

```sql
-- Functional unique index — Postgres actually enforces this (confirmed: a
-- duplicate natural_id via Cypher SET raises a real
-- "duplicate key value violates unique constraint" error).
CREATE UNIQUE INDEX ON labkit."Question"
  ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));

-- Reading straight off the table, no cypher() call needed. The
-- `(properties::text)::jsonb` round-trip is cleaner than agtype's own
-- operators for this — see labkit_prop() in drizzle/0002_natural_ids.sql.
SELECT (properties::text)::jsonb ->> 'natural_id' AS natural_id
FROM labkit."Question";
```

Note this is a different (simpler) pattern than "wrap `cypher()` in a
VIEW" — LabKit's CQRS views (`labkit_questions`, `labkit_computations`, ...
in `drizzle/0002_natural_ids.sql`) select directly off the label tables for
exactly this reason: no `cypher()` call, no `::vertex`-suffix parsing, just
ordinary SQL.

## LabKit-specific gotchas

Hard-won, found by writing throwaway probe scripts against
`new PGlite({ extensions: { age } })` before committing to any real code —
none of these are documented AGE limitations, they're specific to
`pglite-age`'s WASM build:

- **No whole-map `CREATE` property parameter.** `CREATE (n:Label $props)`
  fails with `properties in a CREATE clause as a parameter is not
  supported`. Expand each key individually:
  `CREATE (n:Label {k1: $k1, k2: $k2, ...})` — see `propPattern()` in
  `src/db/graph.ts`.
- **No multi-type variable-length edges.** `[:A|B*1..3]` raises a hard
  parser error (`syntax error at or near "|"`). A single-type
  variable-length edge (`[:SUPERSEDES*1..5]`) works fine, as does an
  unrestricted-type undirected path (`-[*1..3]-`) — it's specifically the
  type-alternation syntax inside `[...]` that's unsupported. See the
  decision-amendment-chain test in `tests/domain-graph.test.ts`.
- **Cypher string literals are typed `agtype`, not `text`.** Calling a
  `LANGUAGE sql` function with `(text, text)` parameters from inside Cypher
  fails with `function ... does not exist` unless the literal arguments are
  explicitly cast: `my_fn('literal'::text)`. Without the cast, Postgres has
  no `(agtype, agtype)` overload to resolve to.
- **Raw agtype from `cypher()` isn't directly JSON.** A `RETURN n` for a
  vertex comes back as a string like `{"id": ..., "label": ..., "properties":
  {...}}::vertex` — strip the `::vertex`/`::edge` suffix before
  `JSON.parse`. `parseAgtype()` in `src/db/graph.ts` does this once so no
  caller has to. This does **not** apply to a bare `properties` column read
  directly off a label's table (see "How graphs are stored" above) — that
  round-trips through `(properties::text)::jsonb` with no suffix to strip.
- **`create_graph()` has no `IF NOT EXISTS`.** It errors if the graph
  already exists — check `ag_catalog.ag_graph` for existence first, or rely
  on the migration ledger to guarantee it only runs once (LabKit does the
  latter — see `drizzle/0001_age_bootstrap.sql`).
- **`LOAD`/`SET search_path` are session-scoped**, not schema state — every
  connecting process must call them itself (`bootstrapSession()` in
  `src/db/graph.ts`), they can't be migrated away like the one-time
  `CREATE EXTENSION`/`create_graph`/`create_vlabel`/`create_elabel` calls can.

## LabKit query cookbook

Straight from `tests/domain-graph.test.ts` — each answers one of the
journal's MVP acceptance-criteria questions.

**"What evidence and computation support this claim?"**
```cypher
MATCH (:Claim {name: $claimName})<-[:SUPPORTS]-(e:Evidence)
MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
MATCH (u)-[:USES]->(comp:Computation)
RETURN e, comp
```

**"If this artefact is invalidated, what breaks?"** — follows only the
edges meaning "depends on this evidence" (`RECORDED_IN`/`SUPPORTS`/
`BASED_ON`/`REQUIRES`), deliberately not `PRODUCES`/`USES` (provenance of
how the evidence came to exist, not something invalidated retroactively):
```cypher
MATCH (a:Artefact {logical_name: $name})
OPTIONAL MATCH (a)<-[:RECORDED_IN]-(e:Evidence)
OPTIONAL MATCH (e)-[:SUPPORTS]->(claim:Claim)
OPTIONAL MATCH (decision:Decision)-[:BASED_ON]->(e)
OPTIONAL MATCH (loe:LineOfEnquiry)-[:REQUIRES]->(e)
RETURN claim, decision, loe
```

**"Is this line of enquiry still open?"** — no resolving `Decision` means
still open:
```cypher
MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {name: $name})
OPTIONAL MATCH (d:Decision)-[:RESOLVES]->(q)
RETURN q, d
```

**"What's the full amendment history of this decision?"**
```cypher
MATCH (:Decision {reason: $reason})-[:SUPERSEDES*1..5]->(x:Decision)
RETURN x
```

**"What gate did this criterion evaluation trigger?"**
```cypher
MATCH (:Criterion {proposition: $prop})-[:EVALUATED_AS]->(ce:CriterionEvaluation {outcome: 'pass'})-[:TRIGGERS]->(g:Gate)
RETURN g
```

## References

- [Overview](https://age.apache.org/age-manual/master/intro/overview.html)
- [Graphs — create_graph, create_vlabel/elabel, how graphs are stored](https://age.apache.org/age-manual/master/intro/graphs.html)
- [Clauses](https://age.apache.org/age-manual/master/clauses/match.html) (MATCH, CREATE, SET, RETURN, ...)
- [AGE Beyond Cypher — Overview](https://age.apache.org/age-manual/master/advanced/advanced_overview.html)
- [AGE Beyond Cypher — CTE/JOIN/expression composition](https://age.apache.org/age-manual/master/advanced/advanced.html)
- [SQL In Cypher](https://age.apache.org/age-manual/master/advanced/sql_in_cypher.html)
- `docs/project-journal/001_git_init.md` — the domain model this graph implements
- `docs/project-journal/002_schema_dot_ts.md` — write-up of the gotchas above as they were found
