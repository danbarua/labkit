# PJ-002: src/db/schema.ts

## Initial Tech Stack

### Dependencies
bun, typescript, pglite + Apache AGE, drizzle-orm

### Deliverable
typescript test suite demonstrating:
- in-memory database initialisation + schema migrations
- CRUD across the domain graph, exercised against the MVP acceptance queries from PJ-001

---

## The relational/graph split

PJ-001 lists fourteen core entities. Only one of them, `Project`, is genuinely
relational: it's the sole entity that never appears as an edge endpoint in
PJ-001's "Graph of Interest," and none of the MVP acceptance queries traverse
through it — it's the tenant boundary every graph node hangs a `project_id`
property off of, not a participant in provenance.

Everything else — Question, LineOfEnquiry, EvidenceUnit, Evidence, Claim,
Decision, Criterion, CriterionEvaluation, Gate, Review, Artefact, Computation,
Task — is a node in an Apache AGE graph. Provenance, support/challenge, and
invalidation propagation are the entire point of this domain; forcing them
into FK tables would just reimplement graph traversal as recursive CTEs.
`schema.ts` stayed a genuine Drizzle schema for `projects`; `graph.ts` became
the graph half (node/edge label constants, per-label TypeScript property
interfaces, and thin `cypher()`/`createNode()`/`createEdge()` helpers).

### Judgment calls made along the way

- **`LineOfEnquiry`, not the legacy code's `Investigation`.** PJ-001's core
  entity list is authoritative; the old `investigations` table/type predates
  this domain model and was dropped.
- **An amendment is a `Decision` with a `SUPERSEDES` edge to an earlier
  `Decision`, not its own entity type** — per PJ-001's own framing ("an
  amendment is really a decision with a specific relation").
- **`USES` (EvidenceUnit → Computation), not `EXECUTES_AS_PART_OF`** — PJ-001
  offered both directions as options; `USES` matches the worked example in
  its "Evidence / Evidence Units" section.
- **Invalidation propagation follows only the edges that represent "depends
  on this evidence"** — `RECORDED_IN`, `SUPPORTS`, `BASED_ON`, `REQUIRES` —
  deliberately excluding `PRODUCES`/`USES`, which are provenance of how the
  evidence came to exist, not things that get invalidated retroactively just
  because its durable record was. A first draft used a blind undirected
  `MATCH (a)-[*1..3]-(x)` traversal from the artefact; that's wrong because it
  also sweeps in the `Computation` and `Question` that led to the evidence,
  which is the wrong direction for "what breaks." The final queries use
  explicit directed `MATCH`/`OPTIONAL MATCH` chains instead.

## AGE syntax gotchas found empirically (against `pglite-age`)

None of these are documented failure modes in the upstream Apache AGE manual
— they were found by writing small probe scripts against
`new PGlite({ extensions: { age } })` before committing to any test/helper
code, since `pglite-age` is a WASM build of AGE and can't be assumed to match
stock AGE's parser exactly:

- **No whole-map property parameter.** `CREATE (n:Label $props)` fails with
  `properties in a CREATE clause as a parameter is not supported`. The
  working form expands each key individually:
  `CREATE (n:Label {k1: $k1, k2: $k2, ...})`, with `$k1`/`$k2` bound via the
  `cypher()` call's third argument (a JSON object passed as agtype, referenced
  by name inside the query text — never string-interpolated). `graph.ts`'s
  `createNode`/`createEdge` build this property-clause string automatically.
- **No multi-type variable-length edges.** `[:RECORDED_IN|SUPPORTS*1..4]`
  raises a hard parser error (`syntax error at or near "|"`). A single-type
  variable-length edge (`[:SUPERSEDES*1..5]`, used for walking a decision's
  full amendment chain) works fine, as do undirected variable-length paths
  with no type restriction (`-[*1..3]-`) — the type-alternation syntax
  specifically is what's missing.
- **`OPTIONAL MATCH`, parameterized `cypher()` calls, and `SET create_graph`
  idempotency all work as expected** — `SELECT create_graph($1)` throws if
  the graph already exists, so bootstrap code checks
  `ag_catalog.ag_graph` for existence first rather than relying on an
  `IF NOT EXISTS` that AGE doesn't provide.
- **Raw agtype results are not directly JSON.** A `RETURN n` for a vertex
  comes back as a string like `{"id": ..., "label": ..., "properties":
  {...}}::vertex` — the `::vertex`/`::edge` suffix has to be stripped before
  `JSON.parse` will accept it. `graph.ts`'s `parseAgtype()` does this once so
  no caller has to.

## `bun test` exits 99 after PGlite teardown

Confirmed pre-existing and unrelated to this work: a bare `new PGlite()` with
a single trivial query, run under `bun test` with no other code involved,
reproduces the same non-zero exit code on an otherwise all-green run. This is
`bun test` + PGlite's WASM teardown interacting, not a LabKit bug — the user
confirmed this is known Bun/PGlite behavior. Worth remembering when wiring up
CI, since a naive `bun test && ...` chain will treat a fully passing suite as
a failure.
