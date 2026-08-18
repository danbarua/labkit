# PJ-005: Provisioning reconciliation and edge-uniqueness review response

**Status: implemented (2026-08-18), revised same day after a follow-up
review.** Response to a review of `main@3faeade` (PJ-004's implementation),
which found one blocking and one medium-severity gap in that round's
per-tenant graph provisioning. A second review of the fix (`main@408afd4`)
then caught that the first fix's own performance optimization
(`tenants.schema_version`) undermined the guarantee it had just built — see
"No version gate" below. That optimization was removed, not patched.

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

`src/db/tenant.ts`'s `provisionTenantGraph()` (the only exported entry
point — see below) now unconditionally runs `reconcileTenantGraph()`, which
independently ensures each resource exists and is current:

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
every existing tenant the next time `resolveTenantContext()` is called for
it, not just brand-new tenants.

"Ensures ... exists" deliberately does not mean "matches the current schema
exactly" — indexes are checked by name (`IF NOT EXISTS`), not compared by
definition, and labels are checked for existence, not arbitrary structural
equivalence. This is groundwork for evolving *additive* graph structure, not
full structural reconciliation. A change that isn't purely additive —
removing/reordering a view column (`CREATE OR REPLACE VIEW` can't do
either), renaming a label, reshaping a property that already has data — has
no story here and isn't claimed to.

### 2. No version gate — reconciliation runs every time, unconditionally

**Revised after a follow-up review of the first version of this change.**
The first cut added a `tenants.schema_version` column and a
`GRAPH_SCHEMA_VERSION` constant, skipping the `reconcileTenantGraph()` pass
entirely when a tenant's stored version already matched — intended purely as
a performance optimization (avoid ~50 idempotent checks on every connection
once a tenant is current).

The review caught that this quietly broke the property the whole change was
for: `resolveTenantContext()` — the actual production path — would stop
self-healing drift the moment the stored version matched, even though the
tests demonstrating repair called the internal reconciliation function
directly, bypassing that gate entirely. So the shipped code proved
"reconciliation logic can repair drift" without actually proving "tenant
resolution repairs drift," which is the property that matters. The version
field also introduced obligations nobody had asked for yet: every
structural change has to remember to bump the constant, nothing catches a
forgotten bump, and an older process encountering a *newer* stored version
had no defined behavior at all.

None of that was justified by a measured cost — there was no evidence the
~50-check pass was actually expensive. Removed entirely rather than
patched: `tenants.schema_version` and `GRAPH_SCHEMA_VERSION` are both gone.
`provisionTenantGraph()` now just runs `reconcileTenantGraph()` unconditionally,
every time, inside the same transaction + advisory-lock it already had:

```text
resolve tenant row
    ↓
acquire per-tenant advisory lock (transaction-scoped)
    ↓
reconcile expected additive structure, unconditionally
    ↓
return TenantContext
```

`reconcileTenantGraph()` itself is no longer exported — it acquires no lock
and starts no transaction of its own, so a second, untestable-vs-production
route into it would have been exactly the kind of "tests exercise something
production doesn't" gap that caused this revision. `provisionTenantGraph()`
is the only way to reach it, and tests reconcile the same way production
does: by calling `resolveTenantContext()` again after breaking something.

If the reconciliation pass ever shows up as a measured cost (startup
latency, connection-pool pressure), the fix at that point should be
evaluated against the actual observed problem — a structural fingerprint,
a real migration/versioning mechanism, or something else — not reintroduced
as a manually-maintained integer with no defined behavior at rest.

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
`(from, edge, to)` both succeed without producing two edges. That second
test doesn't instrument which call actually hit the `23505` path versus
which won the pre-check — either is a legitimate outcome of the race — only
that the end state (exactly one edge) is correct regardless of interleaving,
which is the guarantee that actually matters.

## Judgment calls

- **Reconciliation runs every `ensure*` check unconditionally, on every
  `resolveTenantContext()` call, with no version gate or diff-first
  optimization.** See "No version gate" above — this was tried the other
  way first and reverted after review. Each individual `ensure*` call is
  already cheap and idempotent (an existence check plus, at most, one DDL
  statement); optimize this only in response to a measured cost, not a
  hypothetical one.
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
