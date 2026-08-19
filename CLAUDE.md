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
touching `src/db/`, skim 001 (domain model), 003 (tenancy review), 004-007
(current persistence design) rather than inferring intent from code alone.
Before touching `src/domain/`, skim 008 (the interaction corpus the service
layer is built against), 009 (the first scenario built from it), 010 (a
cold-context review of both), and 011 (the control chain under scenario
pressure). 012 is the implementing agent's own perspective — opinion rather
than decision, and explicitly arguable.

## Commands

```sh
bun install                    # install dependencies
bun test                       # run all tests
bun test tests/domain-graph.test.ts   # run one test file
bun test tests/scenarios/       # run the PJ-008 acceptance scenarios
npx depcruise src tests --output-type err   # layering rules (errors) + cycles
bun run dev:dependency-cruiser  # regenerate dependency-graph.svg
bun run typecheck              # tsc --noEmit
bun run check:migrations       # lints drizzle/*.sql for destructive DDL
bun run check:pglite-concurrency  # regression check for a known pglite-socket bug — see "Testing patterns"
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

`src/db/` is layered, not a hub — each module has one job, and the
dependency direction is enforced by `bun run dev:dependency-cruiser`
(renders `dependency-graph.svg`; `npx depcruise src tests --output-type err`
for violations only):

| module | job |
| --- | --- |
| `client.ts` | `LabKitDB` (the connection seam) + `bootstrapSession` |
| `agtype.ts` | agtype parsing, identifier validation, Cypher clause/quoting helpers |
| `cypher.ts` | `CypherRunner` + column decoders — typed Cypher execution |
| `domain.ts` | what LabKit's entities *are*: labels, `*Props`, `NODE_TYPES`, `EDGE_SCHEMA` |
| `graph.ts` | `TenantGraph` — the domain-typed verbs |
| `provisioning.ts` | per-tenant graph schema reconciliation |
| `tenant.ts` | resolving a slug to a `TenantContext` |

`domain.ts` imports nothing from `src/db/`; it's pure types and data, read by
both `graph.ts` (to type and validate writes) and `provisioning.ts` (to decide
what to create). `NODE_TYPES` is one entry per node label carrying its
natural-id `prefix`, its CQRS `viewColumns`, and its optional `validate` — the
four parallel per-label tables it replaced are not coming back. Its
`viewColumns` are constrained to `keyof NodePropsByLabel[L]`, so a view column
that drifts from its `*Props` interface is a typecheck failure.

All graph access goes through `TenantGraph` (`src/db/graph.ts`), constructed
per-tenant as `new TenantGraph(ctx, db)`. Never touch AGE directly:

- `query(cypher, columns, params)` — the read surface. `columns` is
  `{ returnedName: decoder }` (`vertexProps`, `edgeProps`, `vertex`, `edge`,
  `path`, `scalar`, `agtypeValue`, `optional` — all from `src/db/cypher.ts`).
  That one declaration produces both the SQL `AS` clause AGE requires and the
  row type, so callers never hand-write `"(n agtype)"` or call `parseAgtype`
  themselves. Params are bound as agtype, never interpolated.
- `createNode(label, props)` — `label` selects the property shape via
  `NodePropsByLabel`, so passing another label's props is a compile error.
  Stamps a short natural ID (`COMP_123`, prefix from `NODE_TYPES[label].prefix`)
  in the same round trip; strips AGE's internal graphid before returning. That
  graphid must never reach a caller outside this file.
- `createEdge(fromId, edge, toId)` — resolves both endpoints' labels from
  their natural-id prefix, validates the `(fromLabel, edge, toLabel)`
  combination against the authoritative `EDGE_SCHEMA` table, and is
  idempotent: calling it twice with the same three values is a no-op, not a
  duplicate edge (enforced by a real `UNIQUE (start_id, end_id)` Postgres
  index per edge label — see "AGE-specific gotchas" below).
- `closeDecision(id)` — the only sanctioned way to set `Decision.is_open`/
  `closed_at`; `NODE_TYPES.Decision.validate` enforces the same invariant at
  creation.

There is deliberately no raw-string escape hatch on `TenantGraph`. If a query
needs a shape the decoders don't cover, add a decoder to `src/db/cypher.ts`
rather than reintroducing one.

`TenantContext` (`{ tenantId, graphName }`) comes from
`resolveTenantContext(db, slug)` (`src/db/tenant.ts`) — the CLI/MCP/bootstrap
boundary resolves a tenant once; below that boundary, every function takes a
resolved context, there is no "tenant omitted" mode.

## The domain service layer (`src/domain/`)

Two different things are called "domain", deliberately. `src/db/domain.ts` is
the domain *as expressed in graph structure* — labels, edge schema, property
shapes. `src/domain/` is the domain *as it matters to a researcher*:

```
src/db/        knows nodes and edges
src/domain/    knows research actions
(MCP, later)   knows researcher/agent language
```

`ResearchSession` (`src/domain/session.ts`) is **verb-first**. There is
deliberately no `createClaim()`/`createEvidence()` — those are persistence
operations wearing domain names, and exposing them pushes ontology knowledge
back up to the caller. One verb may write many nodes and edges:
`recordAnalysis()` writes a computation, an evidence unit, an output artefact,
and one evidence plus one claim per conclusion.

**Verbs are added when a scenario needs them, not in anticipation.** The
current set is what PJ-008's S-11 required. Return types are derived
one-per-bullet from a scenario's "Afterward" questions rather than designed —
if a bullet has no natural home in the types, the API is wrong, not the
bullet.

`src/domain/events.ts` is the temporal seam: every state-changing verb flows
through one choke point that stamps it from an injected `Clock`. The durable
sink is deliberately still an interface (PJ-009 §3). The rule that keeps it
honest:

> Events explain *how state changed*. The graph explains *what the current
> research state is*.

Don't answer a "what is true now" question from the event log.

Two layering rules are enforced as `dependency-cruiser` **errors**, not
conventions — `npx depcruise src tests --output-type err`:

- `tests/scenarios/` may not import `src/db`. A scenario asserts a
  researcher's intent can be carried out through research verbs alone; if it
  needs the persistence layer, that's a finding to record, not something to
  route around. `tests/helpers/` is exempt (harness, not caller).
- `src/db` may not import `src/domain`, so the graph model can't come to
  depend on today's verbs.

### Changing the graph model

New labels and edges are earned by a scenario, not designed up front. The bar
PJ-009 set, and the reason `CONSUMES` cleared it while inference supersession
did not:

1. A service query must return a **wrong answer** without the relationship —
   demonstrated by running the test against the old traversal, not argued
   from an ugly query path.
2. An **empty** result is not a wrong one (PJ-011 §5). It is *unanswerable*,
   which is true of any question the model has never been asked, and any
   missing feature manufactures one. Only a confidently incorrect answer
   shows the model claiming something it cannot support.
3. The new edge needs a **reader, not just a writer**. An edge that is
   written and never queried is the dead-code shape PJ-007 found in
   `buildAsClause`.
4. A predicted gap that fails to materialise is a **result**. PJ-008's §3
   ledger keeps such rows — see row B, and row A, which PJ-008 called its
   strongest single prediction and which S-3 refuted.
5. When two models both fit, **record both and pick neither** (row V). Do not
   ship API for an undecided model either: a speculative verb written to
   probe row V was removed rather than left in place.

Prefer structure in the **query** over structure in the **stored model**.
S-3's four gate states and per-criterion itemisation are computed, not
stored, so there is no `Gate.status` field to maintain and no value anyone
can set to "passed". Stored shape is where change gets expensive; queries are
free to be wrong and re-run.

**Do not cull unused labels or edges during domain discovery** (PJ-011 §6).
Every label is provisioned into every tenant up front, so declared-but-never-
walked structure is a computable map of where the model has untested claims —
`CHALLENGES` sitting empty is the only durable record that the model claims
evidence can challenge a claim and nothing ever has. A cull would need to
distinguish *ruled out by the corpus* from *not yet reached by it*.

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

`provisionTenantGraph()` and `dropTenantGraph()` (`src/db/provisioning.ts`)
are the only exports there. The class that does the work,
`TenantGraphProvisioner`, is **module-private** on purpose — it takes no lock
and opens no transaction itself, so `provisionTenantGraph()` is the only
entry point. Tests exercise reconciliation through `resolveTenantContext()`,
the same path production uses, never by calling internals directly.

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

`pglite-age` is a genuine compile of Apache AGE's own C source (pinned at
branch `PG18`, tag `v1.7.0-rc0`), not a reduced WASM-only subset — see the
skill doc's "Overview" for how that's established and PJ-006 for why it
mattered. Working gotchas:

- **`MERGE` for relationships is broken** — creates an edge with
  `start_id`/`end_id` both `0`, never actually connecting the two nodes
  (WASM/pglite-age-specific, not stock AGE — see the skill doc).
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
- **Always schema-qualify explicitly** — `ag_catalog.` for AGE catalog
  functions, `src/db/schema.ts`'s `LABKIT_SCHEMA` constant for LabKit's own
  `tenants` table and natural-id functions. Don't rely on `search_path`
  ordering to resolve an unqualified name.

## Testing patterns

Two kinds of test, with different rules.

**Acceptance scenarios** (`tests/scenarios/`) are PJ-008 corpus entries built
as executable conversations. They may import only `src/domain` — never
`src/db` (enforced; see "The domain service layer"). `tests/helpers/scenario.ts`
is the harness that hands them a ready session target.

Every "Afterward" answer is asserted **twice**: once from the value the
operation returned, once from a query issued afterwards. "Afterward" means
reconstructible from durable state, not present in a return value the caller
happened to keep — `scenario.current()` exists to open a second reader over
the same graph for exactly this.

Scenario conversations must not name a node or edge label in a Researcher or
Agent line. Needing one means the vocabulary leaked and the scenario is
failing its own premise (PJ-008 §2).

**Everything else** (`tests/*.test.ts`) tests the persistence layer directly
and may import `src/db` freely. `tests/reconciliation.test.ts` covers
additive provisioning of a *new* edge label against an already-provisioned
tenant, through `resolveTenantContext()` — the production path — never
provisioning internals.

`tests/helpers/db.ts`'s `setupTestDb()` spins up one `PGlite` instance,
runs migrations, and starts a `PGLiteSocketServer` once per file, in
`beforeAll`. Application-code test files (`tests/domain-graph.test.ts`,
`tests/agtype.test.ts`) never import `@electric-sql/pglite`/`pglite-age`/
`pglite-pgvector` themselves — they only ever see a `LabKitDB`-shaped
`pg.Client`, the same production talks through.

**Each test opens its own fresh connection** (`testDb.openClient()` in
`beforeEach`, closed in `afterEach`) — never share one connection across a
whole file. `@electric-sql/pglite-socket` has a confirmed, open upstream
concurrency bug
([electric-sql/pglite#1046](https://github.com/electric-sql/pglite/issues/1046) —
see the postgres-age skill's "Upstream filing" and PJ-006): two connections
racing, where one errors, can permanently corrupt the connection(s)
involved. Corruption stays contained to the connection that hit it, so a
fresh connection per test contains the blast radius even though the
underlying bug isn't fixed. `scripts/check-pglite-concurrency.sh`
(`bun run check:pglite-concurrency`) regression-checks this — see the
script's header for its (inverted) exit-code meaning.

A test that needs to exercise "a query loses a race and hits a constraint
violation" should do it deterministically — mock the DB layer to inject the
error at the right point (see `domain-graph.test.ts`'s `createEdge treats a
23505 from the CREATE step as success` test) — not via `Promise.all()`
against two live connections, which this backend can't reliably support.

`afterEach` drops every AGE graph and truncates every remaining table
outside `pg_catalog`/`information_schema`/`ag_catalog`/`drizzle` with
`RESTART IDENTITY CASCADE`, via a dedicated admin connection kept open for
the whole file. This resets `tenants.id` every test but deliberately does
*not* reset the natural-id sequences (`drizzle/0002_natural_ids.sql`) —
those are standalone `SEQUENCE`s, and natural ids are scoped globally per
entity-type (PJ-004 decision #3), not per-tenant or per-test. Don't assert
a specific natural-id value across more than one test in the same file for
this reason — assert on the prefix/shape instead.

`tests/leader-election.test.ts` races three concurrent `connectDb()` calls
against a shared `.labkit-test-tmp` directory to prove the PGlite backend's
election/socket-sharing actually works. It's a live, unresolved instance of
the pglite-socket bug above (see PJ-006) — flaky, and not fixable the way
the other tests were, since it deliberately needs genuine concurrent
connections to prove what it proves.
