# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LabKit is a research control plane: it tracks provenance, justification, and
dependency propagation for a research process (why a computation was run,
what evidence resulted, what claims/decisions depend on it, what remains
unresolved) — not an experiment-telemetry system (W&B/MLflow own metrics,
run logs, sweeps). See `docs/project-journal/001_git_init.md` for the full
domain rationale and boundary tests.

The domain model lives across a chain of project-journal entries
(`docs/project-journal/00N_*.md`) that read newest-first for "what's true
now" — each records *why* a decision was made, not just what changed. Before
touching `src/db/`, skim 001 (domain model), 003 (tenancy review), 004/005
(current persistence design) rather than inferring intent from code alone.

## Commands

```sh
bun install                    # install dependencies
bun test                       # run all tests
bun test tests/domain-graph.test.ts   # run one test file
bun run typecheck              # tsc --noEmit
bun run check:migrations       # lints drizzle/*.sql for destructive DDL
bun run db:generate            # drizzle-kit generate, after editing src/db/schema.ts
bun run db:generate:custom --name=<name>   # empty hand-written migration (for AGE DDL drizzle-kit can't diff)
bun examples/full-lifecycle.ts # runnable end-to-end smoke test of the persistence layer
```

There is no lint script yet. `bun run build` compiles `src/cli.ts` to a
binary — `src/cli.ts`/`src/index.ts` are currently stubs, not a working CLI.

`bun test` exits with a non-zero code even when every test passes — this is
a known `bun test` + PGlite WASM teardown interaction, not a failure signal.
Read the actual pass/fail counts in the output, don't trust the exit code.

## Architecture: two persistence halves, deliberately not one

The domain has ~14 entities (Question, LineOfEnquiry, EvidenceUnit,
Evidence, Claim, Decision, Criterion, CriterionEvaluation, Gate, Review,
Artefact, Computation, Task). Only **`Tenant`** (`src/db/schema.ts`) is a
relational Drizzle table — it's the persistence/isolation boundary, not a
scientific entity (see PJ-003 for why `Tenant`, not `Project`). Every other
entity is a node in **one Apache AGE graph per tenant**, because provenance
traversal and dependency propagation are the actual point of this domain —
forcing them into FK tables would just reimplement graph traversal as
recursive CTEs.

All graph access goes through `TenantGraph` (`src/db/graph.ts`), constructed
per-tenant as `new TenantGraph(ctx, db)`. Never touch AGE directly:

- `createNode(label, props)` — stamps a short natural ID (`COMP_123`, prefix
  from `NATURAL_ID_PREFIX`) in the same round trip; strips AGE's internal
  graphid before returning. That graphid must never reach a caller outside
  this file.
- `createEdge(fromId, edge, toId)` — resolves both endpoints' labels from
  their natural-id prefix, validates the `(fromLabel, edge, toLabel)`
  combination against the authoritative `EDGE_SCHEMA` table, and is
  idempotent: calling it twice with the same three values is a no-op, not a
  duplicate edge (enforced by a real `UNIQUE (start_id, end_id)` Postgres
  index per edge label — see "AGE-specific gotchas" below).
- `closeDecision(id)` — the only sanctioned way to set `Decision.is_open`/
  `closed_at`; a `NODE_VALIDATORS` check also enforces the same invariant at
  creation.
- `cypher(query, asClause, params)` — the low-level escape hatch when you
  need a raw traversal; still scoped to `ctx.graphName`, still takes params
  as a bound object, never string-interpolated.

`TenantContext` (`{ tenantId, graphName }`) comes from
`resolveTenantContext(db, slug)` (`src/db/tenant.ts`) — the CLI/MCP/bootstrap
boundary resolves a tenant once; below that boundary, every function takes a
resolved context, there is no "tenant omitted" mode.

## Tenant provisioning is reconciliation, run every time

There's no `ALTER GRAPH` DDL the way there's `ALTER TABLE` — evolving a
tenant's AGE graph structure (new label, new edge, new index, new view) is
the application's job. `resolveTenantContext()` calls
`provisionTenantGraph()`, which — inside one transaction guarded by a
transaction-scoped `pg_advisory_xact_lock(tenantId)` — unconditionally
ensures the graph, every `NODE_LABELS`/`EDGE_LABELS` entry, every natural-id
index, every edge-uniqueness index, and every per-tenant CQRS view exist.
This runs on *every* `resolveTenantContext()` call, deliberately, not gated
behind a version check — an earlier version added a `schema_version` gate as
a performance optimization and it was reverted (PJ-005) because it silently
stopped tenant resolution from self-healing drift. Don't reintroduce that
kind of gate without a measured cost driving it.

The internal `reconcileTenantGraph()` is **not exported** — it holds no lock
itself, so `provisionTenantGraph()` is the only entry point. Tests exercise
reconciliation through `resolveTenantContext()`, the same path production
uses, never by calling internals directly.

"Ensures ... exists" means additive structure only: indexes are checked by
name (`IF NOT EXISTS`), views by `CREATE OR REPLACE` (can add columns, can't
remove/reorder them), labels by existence. There is deliberately no story
yet for a non-additive schema change (renaming a label, reshaping a
property that already has data) — see PJ-005's "Judgment calls."

## Connection/backend layering

`connectDb(projectRoot)` (`src/db/connect.ts`) picks a `DbBackend`
(`src/db/backend.ts`):

- **PGlite + leader election** (default): PGlite is single-writer, so
  multiple local processes race a PID lockfile; the winner opens the real
  PGlite file and serves it over `pglite-socket`'s Postgres wire protocol,
  everyone else (and the primary itself) talks to it as a plain `pg.Client`.
  Only the primary calls `runMigrations()`, exactly once, before serving.
- **Direct Postgres** (`LABKIT_DB_URL` env var set): no election, connects
  straight to a real Postgres. Migrations are *not* run by this backend —
  that's an out-of-band deploy step by design (see PJ-004).

`bootstrapSession(db)` (LOAD/search_path) must be called by every new
session regardless of backend — it's session-scoped Postgres state and
can't be migrated away, unlike the one-time `CREATE EXTENSION` bootstrap in
`drizzle/0001_age_bootstrap.sql`.

## Migrations

`drizzle/` mixes `drizzle-kit generate`-produced files (currently just
`0000`, the `tenants` table) with hand-written `--custom` ones (`0001`
extension bootstrap, `0002` global natural-id sequences/functions) in one
journal, applied together via `runMigrations()`
(`drizzle-orm/pglite/migrator`). Custom migration files use
`--> statement-breakpoint` between statements — required because PGlite's
prepared-statement protocol can't execute a file containing multiple
semicolon-separated statements in one call; `drizzle-kit generate --custom`
does not add these automatically, you must.

There is no persistent database yet (still pre-first-deploy). Until that
changes, migrations get edited/regenerated *in place* rather than stacked —
see the "License to rewrite history" note in
`docs/project-journal/004_tenancy_implementation_plan.md`. Once a real
database exists, that stops being true and this note should be updated.

## AGE-specific gotchas (see `.claude/skills/postgres-age/SKILL.md` for the full reference)

`pglite-age` (the WASM AGE build this project runs on) diverges from stock
AGE in ways worth knowing before writing new Cypher:

- **`MERGE` for relationships is broken** — creates an edge with
  `start_id`/`end_id` both `0`, never actually connecting the two nodes.
  `createEdge()` uses explicit `MATCH`-then-`CREATE` instead, backed by a
  real `UNIQUE (start_id, end_id)` index as the actual concurrency
  guarantee (a losing concurrent `CREATE` hits Postgres error `23505`,
  which `createEdge()` catches and treats as success).
- No whole-map `CREATE (n:Label $props)` — expand to `{k: $k, ...}` per key.
- No multi-type variable-length edges `[:A|B*1..3]` — chain explicit
  `MATCH`/`OPTIONAL MATCH`, or use a single-type `[:TYPE*1..5]`.
- Every AGE label (vertex or edge) is a real Postgres table
  (`ag_catalog.ag_label`), so plain SQL indexes/constraints/reads can target
  it directly — this is how natural-id uniqueness, edge uniqueness, and the
  per-tenant CQRS views all work, with no `cypher()` call involved.

## Testing patterns

Tests spin up `new PGlite({ extensions: { age, vector } })` in memory, call
`runMigrations(db)` + `bootstrapSession(db)` + `resolveTenantContext(db, "labkit")`
in `beforeEach` — this is the same bootstrap sequence a real connection goes
through, not a hand-rolled shortcut. `tests/leader-election.test.ts` races
three concurrent `connectDb()` calls against a shared `.labkit-test-tmp`
directory to prove the PGlite backend's election/socket-sharing actually
works, not just that the code compiles.
