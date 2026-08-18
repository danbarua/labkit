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
Computation, Task — see `docs/project-journal/001_git_init.md`) lives in
**one Apache AGE graph per tenant** (`docs/project-journal/003_review_domain_tenancy.md`,
`docs/project-journal/004_tenancy_implementation_plan.md`), running inside
PGlite via `pglite-age`. There is no fixed graph name — every tenant's graph
is named `labkit_t${tenantId}` (e.g. `labkit_t1`), resolved via
`resolveTenantContext()` (`src/db/tenant.ts`) into a `TenantContext`. All
graph access should go through `new TenantGraph(ctx, db)`
(`src/db/graph.ts`) — this document is what that class, and the migrations
in `./drizzle/`, were written against.

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
| `MERGE` | Match-or-create — **avoid for relationships** in this codebase, see gotchas below |
| `SET n.prop = value` | Mutate a property on an already-matched node |
| `WHERE` | Filter after a `MATCH`, e.g. `WHERE n.name = $name` |
| `RETURN` | Required to get rows back to SQL — a bare `MATCH`/`CREATE`/`SET` with no `RETURN` still executes, just returns zero rows |
| `WITH` | Chain query stages, e.g. aggregate then filter |
| `[:TYPE*1..5]` | Single-type variable-length path, N to M hops |

## AGE Beyond Cypher (SQL ↔ Cypher composition)

From the manual's "AGE Beyond Cypher" section — confirmed against the live
docs, not assumed:

- **Cypher in a CTE has no restrictions.** `WITH x AS (SELECT * FROM
  cypher('labkit_t1', $$ ... $$) AS (n agtype)) SELECT * FROM x`.
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
  ... $$) AS g1(...) JOIN cypher('g2', $$ ... $$) AS g2(...) ON ...` — this
  is how a cross-tenant admin query *could* work if one were ever needed,
  though nothing in LabKit does this today (tenant isolation is the point).

## SQL In Cypher

A `LANGUAGE sql` Postgres function can be called from inside a Cypher
clause — only void/scalar-returning functions, **not** set-returning ones.
LabKit's natural-id generator is exactly this pattern:

```sql
CREATE OR REPLACE FUNCTION labkit_next_natural_id(label text, prefix text)
RETURNS text LANGUAGE sql AS $$
  SELECT prefix || '_' || nextval('labkit_' || lower(label) || '_natural_id_seq')::text;
$$;
```

```cypher
CREATE (n:Computation {
  kind: $kind,
  natural_id: labkit_next_natural_id('computation'::text, 'COMP'::text)
})
RETURN n
```

**The `::text` casts on the literal arguments are required, not
decorative** — see the gotcha below. This composition (function call inside
a Cypher `CREATE` property map) is confirmed working against `pglite-age`
and is exactly what `TenantGraph.createNode()` does.

## How graphs are stored

`SELECT create_graph('labkit_t1')` creates a Postgres **namespace** (schema)
named `labkit_t1`, containing parent tables `_ag_label_vertex`/
`_ag_label_edge`. Every vertex/edge label — `create_vlabel`/`create_elabel`
(LabKit always pre-creates these at tenant-provisioning time, see
`src/db/tenant.ts`'s `provisionTenantGraph()`) — becomes its own real
Postgres table inheriting from those parents, visible in
`ag_catalog.ag_label`. `ag_catalog.drop_label(graph_name, label, false)`
drops one (the third argument is documented as a `cascade`/force flag but
pglite-age rejects `true` with "force option is not supported yet" — pass
`false`).

Confirmed via `information_schema.columns`:

- A **vertex** label's table (e.g. `labkit_t1."Question"`) has exactly two
  columns: `id` (the internal graphid) and `properties` (agtype).
- An **edge** label's table (e.g. `labkit_t1."USES"`) has exactly four:
  `id`, `start_id`, `end_id` (all `graphid`), and `properties` (agtype).

This means **plain SQL DDL can target a label's table directly** — no need
to go through `cypher()` for indexes, constraints, or bulk reads:

```sql
-- Vertex: functional unique index on a property — Postgres actually
-- enforces this (confirmed: a duplicate natural_id via Cypher SET raises a
-- real "duplicate key value violates unique constraint" error).
CREATE UNIQUE INDEX ON "labkit_t1"."Question"
  ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)));

-- Edge: plain UNIQUE(start_id, end_id) — encodes "at most one edge of this
-- type between these two nodes" directly, confirmed to block a duplicate
-- CREATE with a real 23505 error. This is what TenantGraph.createEdge()'s
-- concurrency safety actually rests on, not its app-level pre-check alone.
CREATE UNIQUE INDEX ON "labkit_t1"."USES" (start_id, end_id);

-- Reading straight off a vertex table, no cypher() call needed. The
-- `(properties::text)::jsonb` round-trip is cleaner than agtype's own
-- operators for this — see labkit_prop() in drizzle/0002_natural_ids.sql.
SELECT (properties::text)::jsonb ->> 'natural_id' AS natural_id
FROM "labkit_t1"."Question";
```

Each tenant's CQRS read-side views (`src/db/tenant.ts`'s `ensureView()`, one
per label, e.g. `"labkit_t1".question`) use exactly this pattern — no
`cypher()` call, no `::vertex`-suffix parsing, just ordinary
schema-qualified SQL, scoped per tenant so there's never a naming collision
between tenants' views.

**Provisioning is reconciliation, not a one-time gate.** `create_graph`/
`create_vlabel`/`create_elabel`/index/view creation all happen via
`src/db/tenant.ts`'s `provisionTenantGraph()` (called from every
`resolveTenantContext()`, unconditionally — no version check, see PJ-005),
which independently ensures each resource exists — not gated behind a
single "does the graph already exist" check. That distinction matters
because there's no `ALTER GRAPH` DDL the way there's `ALTER TABLE`: evolving
an already-provisioned tenant's graph structure is the application's job,
and an all-or-nothing gate would mean a tenant provisioned before a new
label/edge/view shipped never sees
it. See docs/project-journal/005_provisioning_reconciliation.md.

## LabKit-specific gotchas

Hard-won, found by writing throwaway probe scripts against
`new PGlite({ extensions: { age } })` before committing to any real code —
none of these are documented AGE limitations, they're specific to
`pglite-age`'s WASM build:

- **`MERGE` for a relationship between two already-matched nodes is broken.**
  `MATCH (a...), (b...) MERGE (a)-[:EDGE]->(b)` runs without error and
  returns what looks like a valid edge, but the created edge's
  `start_id`/`end_id` are both `0` — it never actually connects `a` and
  `b` (confirmed: `id(a)`/`id(b)` resolve correctly, but the edge is
  unreachable from either node afterward). `TenantGraph.createEdge()`
  therefore does NOT use `MERGE` — it does an explicit `MATCH` for an
  existing `(from, edge, to)` edge first and only `CREATE`s if absent, with
  a `UNIQUE (start_id, end_id)` index per edge label (see "How graphs are
  stored" above) as the actual concurrency-safety backstop: a losing
  concurrent `CREATE` hits a `23505` error that `createEdge()` catches and
  treats as success, rather than relying on the pre-check alone. If a future
  AGE/pglite-age upgrade fixes `MERGE`, it would be the more idiomatic (and
  marginally cheaper) choice — re-spike before switching; the `UNIQUE`
  index stays regardless, it's the real correctness guarantee either way.
- **No whole-map `CREATE` property parameter.** `CREATE (n:Label $props)`
  fails with `properties in a CREATE clause as a parameter is not
  supported`. Expand each key individually:
  `CREATE (n:Label {k1: $k1, k2: $k2, ...})` — see `propPattern()` in
  `src/db/graph.ts`.
- **No multi-type variable-length edges.** `[:A|B*1..3]` raises a hard
  parser error (`syntax error at or near "|"`). A single-type
  variable-length edge (`[:SUPERSEDES*1..5]`) works fine, as does an
  unrestricted-type undirected path (`-[*1..3]-`) — it's specifically the
  type-alternation syntax inside `[...]` that's unsupported.
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
- **`create_graph()`/`create_vlabel()`/`create_elabel()` have no `IF NOT EXISTS`.**
  Each errors if already present — `ensureGraph`/`ensureVertexLabel`/
  `ensureEdgeLabel` (`src/db/tenant.ts`) each check `ag_catalog.ag_graph`/
  `ag_catalog.ag_label` for existence first. The whole reconcile pass runs
  inside a transaction guarded by `pg_advisory_xact_lock(tenantId)` so two
  processes provisioning the same tenant concurrently can't interleave
  partial provisioning.
- **`LOAD`/`SET search_path` are session-scoped**, not schema state — every
  connecting process must call them itself (`bootstrapSession()` in
  `src/db/graph.ts`), they can't be migrated or provisioned away.

## LabKit query cookbook

Straight from `tests/domain-graph.test.ts` — each answers one of the
journal's MVP acceptance-criteria questions. All addressed by natural id,
never AGE's internal graphid, and all implicitly scoped to one tenant's
graph (`graph.cypher(...)` closes over `ctx.graphName`).

**"What evidence and computation support this claim?"**
```cypher
MATCH (:Claim {natural_id: $claimId})<-[:SUPPORTS]-(e:Evidence)
MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
MATCH (u)-[:USES]->(comp:Computation)
RETURN e, comp
```

**"If this artefact is invalidated, what breaks?"** — follows only the
edges meaning "depends on this evidence" (`RECORDED_IN`/`SUPPORTS`/
`BASED_ON`/`REQUIRES`), deliberately not `PRODUCES`/`USES`/`ADDRESSES`
(provenance of how the evidence came to exist, not something invalidated
retroactively). "Affected" is not the same as "unsupported" — this
traversal answers "what needs reconsideration," not "what is now false":
```cypher
MATCH (a:Artefact {natural_id: $artefactId})
OPTIONAL MATCH (a)<-[:RECORDED_IN]-(e:Evidence)
OPTIONAL MATCH (e)-[:SUPPORTS]->(claim:Claim)
OPTIONAL MATCH (decision:Decision)-[:BASED_ON]->(e)
OPTIONAL MATCH (loe:LineOfEnquiry)-[:REQUIRES]->(e)
RETURN claim, decision, loe
```

**"Is this line of enquiry still open?"** — no resolving `Decision` means
still open. Note there is no `Question.is_open` property to contradict this
— openness is fully derived from the absence of a `RESOLVES` edge:
```cypher
MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $loeId})
OPTIONAL MATCH (d:Decision)-[:RESOLVES]->(q)
RETURN q, d
```

**"Why was this computation run, even though it produced no Evidence?"** —
the failed/planned-inquiry case: `EvidenceUnit -[:ADDRESSES]-> LineOfEnquiry`
survives even when the computation never produces evidence:
```cypher
MATCH (:Computation {natural_id: $compId})<-[:USES]-(:EvidenceUnit)-[:ADDRESSES]->(loe:LineOfEnquiry)
RETURN loe
```

**"What's the full amendment history of this decision?"**
```cypher
MATCH (:Decision {natural_id: $id})-[:SUPERSEDES*1..5]->(x:Decision)
RETURN x
```

**"What does this criterion evaluation gate?"** — the corrected chain
(`Gate`, not `Criterion`, is what gates the downstream object — see
`EDGE_SCHEMA` in `src/db/graph.ts` for the full rationale):
```cypher
MATCH (:Criterion {natural_id: $critId})-[:EVALUATED_AS]->(:CriterionEvaluation {outcome: 'pass'})-[:TRIGGERS]->(:Gate)-[:GATES]->(comp:Computation)
RETURN comp
```

## References

- [Overview](https://age.apache.org/age-manual/master/intro/overview.html)
- [Graphs — create_graph, create_vlabel/elabel, how graphs are stored](https://age.apache.org/age-manual/master/intro/graphs.html)
- [Clauses](https://age.apache.org/age-manual/master/clauses/match.html) (MATCH, CREATE, MERGE, SET, RETURN, ...)
- [AGE Beyond Cypher — Overview](https://age.apache.org/age-manual/master/advanced/advanced_overview.html)
- [AGE Beyond Cypher — CTE/JOIN/expression composition](https://age.apache.org/age-manual/master/advanced/advanced.html)
- [SQL In Cypher](https://age.apache.org/age-manual/master/advanced/sql_in_cypher.html)
- `docs/project-journal/001_git_init.md` — the domain model this graph implements
- `docs/project-journal/002_schema_dot_ts.md` — the first implementation's write-up
- `docs/project-journal/003_review_domain_tenancy.md` — the tenancy/domain review
- `docs/project-journal/004_tenancy_implementation_plan.md` — this implementation's plan
