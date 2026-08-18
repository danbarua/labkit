# PJ-005: Provisioning reconciliation and edge-uniqueness review response

**Status: implemented (2026-08-18).** Response to a review of `main@3faeade`
(PJ-004's implementation), which found one blocking and one medium-severity
gap in that round's per-tenant graph provisioning.

## Context

PJ-004 moved AGE graph structure (labels, indexes, views) out of static
migrations and into `provisionTenantGraph()`, run at tenant-resolution time.
As shipped, that function only acted when a tenant's graph didn't exist at
all:

```ts
const existing = await db.query(`SELECT 1 FROM ag_catalog.ag_graph WHERE name = $1`, [graphName]);
if (existing.rows.length === 0) {
  // create everything
}
```

That's idempotent for *today's* schema but not reconciling — the moment a
new label, edge, or view gets added to the codebase, every tenant whose
graph was already provisioned would never see it. Since PJ-004 deliberately
made per-tenant provisioning the schema-evolution mechanism (there's no
`ALTER GRAPH` DDL in Postgres/AGE the way there's `ALTER TABLE` — structure
has to be managed at the application layer, one `create_vlabel`/`create_elabel`
call at a time), an all-or-nothing gate defeats that mechanism's entire
purpose.

Separately, `TenantGraph.createEdge()`'s idempotency (PJ-004 decision #7,
revised after `MERGE` was found broken) relied on an app-level
check-then-`CREATE`, which is genuinely racy under concurrent callers — and
`directPostgresBackend` (the backend where concurrent callers are a real
scenario, not PGlite's single-writer architecture) was already shipped, not
hypothetical future work. The code comment at the time said "a future
direct-Postgres backend would need this revisited," which undersold how
already-real the gap was.

## Changes

### 1. Reconciliation, not a single existence gate

`src/db/tenant.ts`'s `provisionTenantGraph()` is now a thin, version-gated
wrapper around `reconcileTenantGraph()`, which independently ensures each
resource exists and matches the current schema:

```text
ensure graph exists
    ↓
ensure every NODE_LABELS vertex label exists
    ↓
ensure every EDGE_LABELS edge label exists
    ↓
ensure every label's natural-id UNIQUE index exists
    ↓
ensure every edge label's (start_id, end_id) UNIQUE index exists
    ↓
ensure every label's CQRS view exists and is current
```

Each step is its own idempotent function (`ensureGraph`, `ensureVertexLabel`,
`ensureEdgeLabel`, `ensureNaturalIdIndex`, `ensureEdgeUniqueIndex`,
`ensureView`) — a codebase change that adds a new label or edge now reaches
every existing tenant on their next reconcile pass, not just brand-new
tenants.

`reconcileTenantGraph()` is exported and callable directly (not only
reachable through the version gate below), specifically so reconciliation
behavior is testable on its own terms:
`tests/domain-graph.test.ts`'s "provisioning reconciliation" block drops a
view, an index, and an entire label (simulating "this tenant predates a
schema change"), then confirms a bare `reconcileTenantGraph()` call restores
each one.

### 2. `tenants.schema_version` — groundwork, not a migration system

Running all ~50 idempotent `ensure*` checks on every single
`resolveTenantContext()` call is correct but wasteful once a tenant is
already current. `tenants` gained a `schema_version` column (default `0`);
`graph.ts` gained `GRAPH_SCHEMA_VERSION` (currently `1`), bumped by hand
whenever `NODE_LABELS`/`EDGE_LABELS`/`NODE_VIEW_COLUMNS`/`EDGE_SCHEMA`
changes structurally. `provisionTenantGraph()` compares the two (read inside
the advisory-lock transaction, not before it) and only runs
`reconcileTenantGraph()` when the tenant is behind, then stamps the new
version.

**This is explicitly not a migration system.** It answers "has this tenant
seen the current schema," which is necessary groundwork for a real migration
mechanism but not one itself — `ensureView`'s `CREATE OR REPLACE VIEW`, for
instance, can add columns but can't remove or reorder them (a real Postgres
restriction); a schema change that needs to do either has no story yet.
How LabKit actually migrates a tenant's graph through an incompatible
structural change (renaming a label, reshaping a property that already has
data) is deliberately left undecided, per the direction that this round lay
groundwork rather than solve that problem now.

### 3. Edge-relationship uniqueness is now DB-enforced

Spiked and confirmed: AGE materializes every edge label as a real Postgres
table with exactly `id`, `start_id`, `end_id`, `properties` columns — the
same physical-storage fact PJ-002 already relied on for vertex labels. A
plain `UNIQUE (start_id, end_id)` index per edge label table is exactly the
domain invariant `TenantGraph.createEdge()` already claimed
(`(fromId, edge, toId)` is a unique key for a relationship), now actually
enforced by Postgres rather than resting on app-level discipline. Confirmed
it blocks a duplicate `CREATE` with a real `23505 duplicate key value
violates unique constraint` error, on both PGlite and (by the same
mechanism) a real Postgres backend.

`createEdge()`'s check-then-`CREATE` app-level logic is kept as the fast
path (avoids a wasted round trip in the common, non-racing case), with the
`CREATE` step now wrapped to catch exactly `23505` and treat it as the same
successful no-op the pre-check would have produced — closing the race the
pre-check alone couldn't. `tests/domain-graph.test.ts`'s "edge uniqueness is
DB-enforced, not just app-checked" block proves this two ways: a duplicate
`CREATE` that bypasses `createEdge()`'s own pre-check entirely still fails
at the database, and two concurrent `createEdge()` calls for the same
`(from, edge, to)` both succeed without producing two edges (one of them
provably takes the `23505`-catch path, not the pre-check's early-return).

## Judgment calls

- **Reconciliation runs every `ensure*` check unconditionally when a tenant
  is behind, rather than diffing to run only what's missing.** Each
  individual `ensure*` call is already cheap and idempotent (an existence
  check plus, at most, one DDL statement), so the "diff first" optimization
  wasn't worth the added complexity — the real cost `schema_version` exists
  to avoid is re-running this whole pass on *every connection*, not
  shaving statements off a pass that's already only happening on a version
  bump.
- **`ensureView`'s `CREATE OR REPLACE VIEW` limitation (can't remove/reorder
  columns) is accepted, not worked around.** Forcing a real solution here
  (drop-and-recreate, with whatever downstream consequences that has for
  anything depending on the view) would be solving the "how do we actually
  migrate a tenant's graph" problem this round explicitly deferred. Noted in
  code and here so it doesn't get rediscovered as a surprise.
- **Natural-id uniqueness and edge-relationship uniqueness use the same
  `agtype_access_operator`/direct-column pattern but are visibly two
  different mechanisms** (a functional index on an expression vs. a plain
  column-pair index) — not unified into one abstraction, because they're
  not actually the same shape of problem (one is about a property value,
  the other about a physical edge's endpoints) and forcing a shared
  abstraction over two genuinely different mechanisms would have cost more
  than the two straightforward index-creation functions it replaced.
