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

Application code above the persistence layer talks to `src/domain/` (research
actions) rather than to `TenantGraph` directly; this document stays relevant
there only for understanding what those actions compile down to. New labels
and edges are earned by an acceptance scenario returning a wrong answer
without them — see PJ-009.

`pglite-age` is a genuine compile of Apache AGE's own C source under
Emscripten/WASM, not a reduced/reimplemented subset — `electric-sql/postgres-pglite`
(a Postgres core fork) pins AGE as a real git submodule at
`github.com/apache/age` branch `PG18`, commit
`806fa2ebdb300b3e76ef30cdba61803babbf2683`, tag `PG18/v1.7.0-rc0`, and its
`cypher_gram.y`/`cypher_clause.c`/`agtype.c`/`ag_catalog.c` etc. all match
stock AGE's source tree byte-for-byte (no `__PGLITE__`/`EMSCRIPTEN`/`WASM`
conditionals anywhere in it). The only WASM-specific lever is a build flag
(`SIZEOF_DATUM=4`) that AGE's own 1.7.0 Makefile already supports (its own
32-bit-`graphid` feature, PR #2286) — it switches `graphid` from
pass-by-value to pass-by-reference, the same accommodation Postgres core
makes for its own 8-byte types on 4-byte-`Datum` platforms. `docker-compose.yml`
runs a real Postgres 18 + AGE 1.7.0 container
(`apache/age:release_PG18_1.7.0`, no WASM) for comparing behavior directly
against this pinned version when a gotcha's platform-specificity is in
question — see "LabKit-specific gotchas" below, and PJ-006 for how this was
established.

Treat anything not already proven working in this repo's own tests as worth
a throwaway spike before trusting it — `pglite-age`/AGE 1.7.0-rc0 diverge
from the manual in known ways (below) and there could be more.

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
CREATE OR REPLACE FUNCTION public.labkit_next_natural_id(label text, prefix text)
RETURNS text LANGUAGE sql AS $$
  SELECT prefix || '_' || nextval('public.labkit_' || lower(label) || '_natural_id_seq')::text;
$$;
```

```cypher
CREATE (n:Computation {
  kind: $kind,
  natural_id: public.labkit_next_natural_id('computation'::text, 'COMP'::text)
})
RETURN n
```

(`public` here is `src/db/schema.ts`'s `LABKIT_SCHEMA` constant, spelled out
literally in these examples for readability — see "LabKit-specific
gotchas" below for why it's qualified at all.)

**The `::text` casts on the literal arguments are required, not
decorative** — see the gotcha below. This composition (function call inside
a Cypher `CREATE` property map) is confirmed working against `pglite-age`
and is exactly what `TenantGraph.createNode()` does.

## How graphs are stored

`SELECT ag_catalog.create_graph('labkit_t1')` creates a Postgres
**namespace** (schema) named `labkit_t1`, containing parent tables
`_ag_label_vertex`/`_ag_label_edge`. Every vertex/edge label —
`ag_catalog.create_vlabel`/`create_elabel` (LabKit always pre-creates these
at tenant-provisioning time, see `src/db/provisioning.ts`'s
`provisionTenantGraph()`) — becomes its own real Postgres table inheriting
from those parents, visible in `ag_catalog.ag_label`.
`ag_catalog.drop_label(graph_name, label, false)` drops one (the third
argument is documented as a `cascade`/force flag but rejects `true` with
"force option is not supported yet" — pass `false`; unconditional stock AGE
behavior, `age/src/backend/commands/label_commands.c:875`, not
pglite-age-specific). Always schema-qualify AGE catalog functions
explicitly (`ag_catalog.create_graph(...)`, not bare `create_graph(...)`)
rather than relying on `search_path` — see "LabKit-specific gotchas" below.

Via `information_schema.columns`:

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

Each tenant's CQRS read-side views (`src/db/provisioning.ts`'s `ensureView()`, one
per label, e.g. `"labkit_t1".question`) use exactly this pattern — no
`cypher()` call, no `::vertex`-suffix parsing, just ordinary
schema-qualified SQL, scoped per tenant so there's never a naming collision
between tenants' views.

**Provisioning is reconciliation, not a one-time gate.** `create_graph`/
`create_vlabel`/`create_elabel`/index/view creation all happen via
`src/db/provisioning.ts`'s `provisionTenantGraph()` (called from every
`resolveTenantContext()`, unconditionally — no version check, see PJ-005),
which independently ensures each resource exists — not gated behind a
single "does the graph already exist" check. That distinction matters
because there's no `ALTER GRAPH` DDL the way there's `ALTER TABLE`: evolving
an already-provisioned tenant's graph structure is the application's job,
and an all-or-nothing gate would mean a tenant provisioned before a new
label/edge/view shipped never sees
it. See docs/project-journal/005_provisioning_reconciliation.md.

## LabKit-specific gotchas

Root causes below are cited against the actual AGE 1.7.0-rc0/PG18 source
(`electric-sql/postgres-pglite`'s `age` submodule — see "Overview" above).
When something's not already proven working in this repo's own tests, spike
it in a throwaway script first — see PJ-006 for how these were found.

- **`MERGE` for a relationship between two already-matched nodes is broken.**
  `MATCH (a...), (b...) MERGE (a)-[:EDGE]->(b)` runs without error and
  returns what looks like a valid edge, but the created edge's
  `start_id`/`end_id` are both `0` — it never actually connects `a` and `b`.
  **WASM/pglite-age-specific**, not a stock-AGE bug — the identical query
  connects the nodes correctly against a real Postgres 18 + AGE 1.7.0
  container (`docker-compose.yml`). Most likely cause: AGE's
  `SIZEOF_DATUM=4` build (see "Overview") makes `graphid` pass-by-reference,
  and `cypher_merge.c`/`cypher_create.c`/`cypher_utils.c` show no use of the
  `DatumGetInt64`/`Int64GetDatum` accessors that requires on a
  4-byte-`Datum` platform. `TenantGraph.createEdge()` therefore does NOT
  use `MERGE` — it does an explicit `MATCH` for an existing `(from, edge,
  to)` edge first and only `CREATE`s if absent, with a `UNIQUE (start_id,
  end_id)` index per edge label (see "How graphs are stored" above) as the
  actual concurrency-safety backstop: a losing concurrent `CREATE` hits a
  `23505` error that `createEdge()` catches and treats as success, rather
  than relying on the pre-check alone. Re-spike before switching if a future
  upgrade claims to fix this; the `UNIQUE` index stays regardless, it's the
  real correctness guarantee either way.
- **No whole-map `CREATE` property parameter.** `CREATE (n:Label $props)`
  fails with `properties in a CREATE clause as a parameter is not
  supported` — unconditional stock AGE behavior
  (`age/src/backend/parser/cypher_clause.c:6407`), not a WASM quirk. Expand
  each key individually: `CREATE (n:Label {k1: $k1, k2: $k2, ...})` — see
  `buildPropertyClause()` in `src/db/agtype.ts`.
- **No edge-type alternation, at any length.** `[:A|B*1..3]` raises a hard
  parser error (`syntax error at or near "|"`), and so does the plain
  fixed-length `[:A|B]` — verified against pglite-age, Postgres `42601` /
  `cypher_yyerror`. The grammar production
  (`age/src/backend/parser/cypher_gram.y:1369`) accepts a single `label_opt`
  (`: label_name`); there is no `|`-alternation production at all, on any
  platform, so the variable-length part is incidental. Chain an
  `OPTIONAL MATCH` per type and coalesce in application code — see
  `conclusionsOf()`/`findingsBearing()` in `src/domain/session.ts`. A single-type
  variable-length edge (`[:SUPERSEDES*1..5]`) works fine, as does an
  unrestricted-type undirected path (`-[*1..3]-`) — it's specifically the
  type-alternation syntax inside `[...]` that doesn't exist.
- **Cypher string literals are typed `agtype`, not `text`.** Calling a
  `LANGUAGE sql` function with `(text, text)` parameters from inside Cypher
  fails with `function ... does not exist` unless the literal arguments are
  explicitly cast: `my_fn('literal'::text)`. Without the cast, Postgres has
  no `(agtype, agtype)` overload to resolve to.
- **Raw agtype from `cypher()` isn't directly JSON.** A `RETURN n` for a
  vertex comes back as a string like `{"id": ..., "label": ..., "properties":
  {...}}::vertex`, and a `::tag` can appear nested at any depth (e.g. a
  numeric property value gets its own `::numeric` tag). `parseAgtype()`
  (`src/db/agtype.ts`) is a real recursive-descent parser for this, not a
  strip-the-trailing-suffix regex — it also returns `bigint` for an
  internal graphid past `Number.MAX_SAFE_INTEGER` (LabKit's own tenant
  graphs hit this once a label's id reaches 32; see the file's own header
  comment). This does **not** apply to a bare `properties` column read
  directly off a label's table (see "How graphs are stored" above) — that
  round-trips through `(properties::text)::jsonb` with no suffix to strip.
- **`create_graph()`/`create_vlabel()`/`create_elabel()` have no `IF NOT EXISTS`.**
  Each errors if already present — `ensureGraph`/`ensureVertexLabel`/
  `ensureEdgeLabel` (`src/db/provisioning.ts`) each check `ag_catalog.ag_graph`/
  `ag_catalog.ag_label` for existence first. The whole reconcile pass runs
  inside a transaction guarded by `pg_advisory_xact_lock(tenantId)` so two
  processes provisioning the same tenant concurrently can't interleave
  partial provisioning.
- **`LOAD`/`SET search_path` are session-scoped**, not schema state — every
  connecting process must call them itself (`bootstrapSession()` in
  `src/db/client.ts`), they can't be migrated or provisioned away.
- **Never rely on `search_path` ordering to resolve an unqualified name —
  qualify explicitly.** `ag_catalog.` on every AGE catalog function
  (`ag_catalog.cypher(...)`, `ag_catalog.create_graph(...)`, etc. —
  `src/db/graph.ts`, `src/db/provisioning.ts`), and `src/db/schema.ts`'s
  `LABKIT_SCHEMA` constant (`"public"`, the single place that would change
  if LabKit ever moved to schema-per-tenancy for its own relational tables)
  on every LabKit-owned object: `${LABKIT_SCHEMA}.tenants`,
  `${LABKIT_SCHEMA}.labkit_next_natural_id(...)`,
  `${LABKIT_SCHEMA}.labkit_prop(...)`. Note `drizzle-orm` itself refuses
  `pgSchema("public")` at the query-builder level ("just use pgTable()
  instead") — `schema.ts`'s `tenants` table declaration stays a plain
  `pgTable()`; `LABKIT_SCHEMA` is for raw-SQL call sites only, which aren't
  subject to that restriction.

## Upstream filing — tracked, not yet filed

Findings from this review worth reporting to the relevant upstream project,
not yet submitted anywhere:

- **`apache/age` (branch `PG18`, currently pinned at `806fa2ebdb3`/tag
  `v1.7.0-rc0`):**
  - Whole-map `CREATE (n:Label $props)` rejection and the multi-type
    variable-length edge (`[:A|B*1..3]`) grammar gap above — both confirmed
    via literal source (`cypher_clause.c:6407`, `cypher_gram.y:1369`), worth
    a bug report or feature request regardless of the WASM angle, since they
    reproduce on any platform.
  - The Node.js driver (`drivers/nodejs`, reviewed separately from the C
    extension): a confirmed, reproduced bug where floats inside an array get
    pushed twice by `CustomAgTypeListener` (`AGTypeParse('[1.5, 2.5]')` →
    `["1.5", 1.5, "2.5", 2.5]`) — no test in that repo covers a float inside
    an array. Also: `queryCypher()`'s own docstring example shows `$name` as
    if it were a bound query parameter; that argument position is actually
    `columns: CypherColumn[]` (result-column naming) — the example would
    fail at runtime as written.
- **`electric-sql/pglite`:** three of LabKit's four gotchas above reproduce
  from stock AGE 1.7.0-rc0 regardless of platform (confirmed directly
  against `apache/age:release_PG18_1.7.0`) — nothing to file against pglite
  for those. `MERGE`'s `start_id`/`end_id`-both-zero bug is different and
  is worth filing, with `SIZEOF_DATUM=4`'s pass-by-reference `graphid`
  build as the strongest lead (see that gotcha) — the exact faulty code
  path in `cypher_merge.c`/`cypher_create.c`/`cypher_utils.c` hasn't been
  pinned down yet, which is the concrete next step before filing.
- **`@electric-sql/pglite-socket` — already filed upstream, still open:**
  [electric-sql/pglite#1046](https://github.com/electric-sql/pglite/issues/1046).
  Nothing AGE-specific — plain SQL reproduces it. Two connections issuing
  concurrent queries, where at least one errors (e.g. a `23505` unique
  violation), can permanently corrupt the connection(s) involved — a
  wire-protocol desync ("unexpected parseComplete message from backend"),
  or (per the issue's own root-cause analysis of
  `QueryQueueManager.processQueue()`) silently wrong rows, from one
  connection's extended-protocol batch clobbering another's unnamed
  prepared statement mid-flight — no transaction needed to trigger it.
  Corruption stays contained to the connection that hit it, which is why
  `tests/helpers/db.ts` opens a fresh connection per test rather than
  sharing one for a whole file; `scripts/check-pglite-concurrency.sh`
  regression-checks it (inverted exit code — see the script's header).
  Real production exposure, not just a test artifact:
  `pgliteLeaderElectionBackend`'s whole design is every secondary process
  hitting the primary's socket concurrently, which is exactly this trigger
  condition — `tests/leader-election.test.ts` is a live, unresolved
  instance of it, not fixable the same way the `TenantGraph` tests were
  (see PJ-006).

## LabKit query cookbook

Straight from `tests/domain-graph.test.ts` — each answers one of the
journal's MVP acceptance-criteria questions. All addressed by natural id,
never AGE's internal graphid, and all implicitly scoped to one tenant's
graph (`graph.query(...)` closes over `ctx.graphName`).

From TypeScript these run through `TenantGraph.query(cypher, columns, params)`,
where `columns` declares each `RETURN`ed name and its decoder — that single
declaration produces both the SQL `AS` clause AGE requires and the result
type, so none of the below needs a hand-written `"(e agtype, comp agtype)"`
or a `parseAgtype()` call:

```ts
const rows = await graph.query(
  `MATCH (:Claim {natural_id: $claimId})<-[:SUPPORTS]-(e:Evidence)
   MATCH (u:EvidenceUnit)-[:PRODUCES]->(e)
   MATCH (u)-[:USES]->(comp:Computation)
   RETURN e, comp`,
  { e: vertexProps<EvidenceProps>(), comp: vertexProps<ComputationProps>() },
  { claimId },
);
rows[0]!.e.statement; // typed; no kind-narrowing at the call site
```

Wrap a column in `optional(...)` when an `OPTIONAL MATCH` can leave it
unset — that puts the nullability in the type instead of a `!`. Decoders
live in `src/db/cypher.ts`.

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
`EDGE_SCHEMA` in `src/db/domain.ts` for the full rationale):
```cypher
MATCH (:Criterion {natural_id: $critId})-[:EVALUATED_AS]->(:CriterionEvaluation {outcome: 'pass'})-[:TRIGGERS]->(:Gate)-[:GATES]->(comp:Computation)
RETURN comp
```

**"What did this computation read, and what did it produce?"** — execution
lineage reads in both directions, `CONSUMES` in and `PRODUCES` out. Note the
two provenance levels: the `EvidenceUnit` produced the *scientific* output,
the `Computation` produced the *execution* output, and both edges exist:
```cypher
MATCH (c:Computation {natural_id: $compId})
OPTIONAL MATCH (c)-[:CONSUMES]->(input:Artefact)
OPTIONAL MATCH (c)-[:PRODUCES]->(output:Artefact)
RETURN input, output
```

**"What does this claim actually rest on?"** — via what the supporting
computation consumed, *not* via the enquiry. Going out through
`ADDRESSES`/`REQUIRES` instead answers "what observations is this enquiry
associated with", which returns the wrong answer once one enquiry carries two
analyses over different inputs (PJ-009 §4):
```cypher
MATCH (:Claim {name: $name})<-[:SUPPORTS]-(e:Evidence)<-[:PRODUCES]-(:EvidenceUnit)-[:USES]->(comp:Computation)
MATCH (comp)-[:CONSUMES]->(a:Artefact)
RETURN a
```

**"Which conditions govern this gate, including ones nobody has evaluated?"**
— the `OPTIONAL MATCH` is load-bearing twice: a criterion with no evaluation
must still come back as a row (absence is a state, not a missing entry), and
binding `g` in the first `MATCH` and reusing it in the second restricts
evaluations to *this* gate rather than every evaluation of that criterion:
```cypher
MATCH (c:Criterion)-[:GOVERNS]->(g:Gate {natural_id: $id})
OPTIONAL MATCH (c)-[:EVALUATED_AS]->(ev:CriterionEvaluation)-[:TRIGGERS]->(g)
RETURN c, ev
```
Dropping the `-[:TRIGGERS]->(g)` tail widens it to criterion scope — a
different and also useful question ("has this check ever been shown able to
fail?"), and a silent bug if you meant the first one. See PJ-011 §3.

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
- `docs/project-journal/005_provisioning_reconciliation.md` — provisioning reconciliation, why there's no version gate
- `docs/project-journal/006_agtype_client_and_concurrency_hardening.md` — AGE provenance, the in-house `agtype.ts` parser, schema-qualification, and the pglite-socket concurrency bug
- `docs/project-journal/007_db_layering_and_typed_cypher.md` — layering `src/db/`, the column-decoder query API, and the `NODE_TYPES` domain registry
- `docs/project-journal/008_user_story_mining.md` — the interaction corpus the graph model is now tested against, and its running ledger of design pressure
- `docs/project-journal/009_domain_service_layer_s11.md` — the domain service layer, and the bar a new label/edge has to clear to be added
- `docs/project-journal/010_cold_context_review.md` — cold-context review after the first scenario: what four unprimed reviewers could and couldn't reconstruct
- `docs/project-journal/011_control_chain_two_wrong_predictions.md` — the Criterion/Gate chain under scenario pressure, and why unused labels are not culled
- `docs/project-journal/012_implementers_perspective.md` — the implementing agent's read of what has and hasn't held up; opinion, not decision
