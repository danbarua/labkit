# Persistence

How LabKit stores things, and why it stores them in two halves. **Moved here
from `CLAUDE.md` on 2026-08-27, not rewritten** — it was about a fifth of that
file, it is reference rather than something an agent needs loaded before it
writes a line, and composing a fresh explainer beside prose that already said
this would have put one subsystem in two places. Suggested by `labkit-review`
in exactly those terms.

What deliberately stayed in `CLAUDE.md`: the **AGE gotchas**. Those are things
you need in context *before* writing a query, not things you go and read about.

The dated probe findings that were `docs/persistence-spikes.md` are the last
section here.

---

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

### The modules, and the direction they depend

`src/db/` is layered, not a hub — each module has one job, and the
dependency direction is enforced by `bunx depcruise src tests --output-type err`
(violations only; `bun run dev:dependency-cruiser` redraws
`docs/dependency-graph.mmd`):

| module | job |
| --- | --- |
| `backend.ts` | `LabKitDB` (the connection seam) + `bootstrapSession`, and the two backends that satisfy it |
| `connect.ts` | picks a backend and connects through it |
| `transactor.ts` | the transaction boundary, one per connection |
| `orm.ts` | drizzle, mounted **on** the seam via `pg-proxy` |
| `scoped.ts` | steps a session down to `labkit_app` with its tenant pinned |
| `agtype.ts` | agtype parsing, identifier validation, Cypher clause/quoting helpers |
| `cypher.ts` | `CypherRunner` + column decoders — typed Cypher execution |
| `domain.ts` | what LabKit's entities *are*: labels, `*Props`, `NODE_TYPES`, `EDGE_SCHEMA`, `INDEXED_PROPS` |
| `graph.ts` | `TenantGraph` — the domain-typed verbs |
| `provisioning.ts` | per-tenant graph schema reconciliation |
| `tenant.ts` | resolving a slug to a `TenantContext` |

**There is no barrel and no `client.ts`.** `src/db/index.ts` exported 11 names
of which 4 were ever imported through it, while 47 imports reached into
submodules directly — a file to keep in sync with something nothing depended on.
It is cheap to reintroduce later as an *enforced* boundary, which is the only
version of it worth having. `client.ts` held the seam and was named for a thing
it does not export: no client, just an interface with two permanent
implementations, which sent readers looking for the construction in the wrong
file. It is folded into `backend.ts`, beside `LabKitDBConnection` — a connection
and the thing you can do with one are the same subject. Every importer of
`LabKitDB` outside `backend.ts` is `import type`, so nothing pulls PGlite in by
depending on the seam.

`domain.ts` imports nothing from `src/db/`; it's pure types and data, read by
both `graph.ts` (to type and validate writes) and `provisioning.ts` (to decide
what to create). Its **string taxonomy** — `IndexedString`,
`Timestamp`, `IdentityString`, `ReadOnlyString<T>`, `Prose` — says what LabKit
*does* with each stored string, so a reader learns it from the declaration
instead of auditing every Cypher query. All five are plain aliases and constrain
nothing; the one with a machine consequence is `INDEXED_PROPS`, which
`provisionTenantGraph()` loops to build a non-unique functional index per
matched property, and which `check:prop-classes` holds to the annotations. Two
copies of one fact, kept because they fail silently in opposite directions — a
missing entry is a sequential scan nobody sees, a spurious one an index nobody
reads. Generating the table from the types is the honest end state. `NODE_TYPES` is one entry per node label carrying its
natural-id `prefix` and its optional `validate` — the four parallel per-label
tables it replaced are not coming back. It also carried `viewColumns` until the
per-tenant CQRS views were removed; see "No relational read side" below.

### TenantGraph is the only way in

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

### Transactions belong to the connection

A compound domain verb must run inside `graph.inTransaction(fn)` — everything
it writes commits together or none of it does. Earned by external review of
S-3c (PJ-020), by negative test in each case: `replaceAnalysis()` invalidates the superseded
output *before* recording the replacement, and since S-3c invalidating an output
withdraws the criterion evaluations that cited it, so a failure between the
halves left an earlier failure no longer deciding its check and no corrected
check in existence. `reverify()`, `replaceAnalysis()` and `recordAnalysis()` use
it, and so do `reinterpret()` and `amendDesign()` — every compound verb now
does. It is re-entrant by depth, so a composed verb does not nest `BEGIN`. Note
this is a transaction boundary, not an escape hatch: no caller gains the ability
to issue Cypher this class would not otherwise run.

**The boundary itself belongs to the connection, not to the graph**
(`src/db/transactor.ts`). `TenantGraph` owned it because it was the only citizen
of `src/db/` when `inTransaction` was written — not a decision, the only
available place. The event store writes down the same connection and drizzle
mounts on the same seam, and two objects issuing `BEGIN` down one connection are
in one transaction whether they know it or not; a second depth counter is how
they stop knowing. `LabKitDBConnection.tx` hands out the one, `TenantGraph`
takes it as a **required** constructor argument, and `graph.inTransaction`
delegates while keeping the one consequence only a graph knows about — clearing
its minted-id list when the outermost transaction settles.

Two traps, both found by the suite rather than by review:

- **Ask "am I the outermost?" before entering, not inside.** Within the
  transactor's closure the depth reads 1 for an outermost call *and* for one
  nested in it, so testing it there makes an inner call clear the minted ids
  before the outer verb's `emit` drains them — and the outer event then reports
  creating nothing.
- **Never default the transactor.** A `TenantGraph` that made its own would look
  identical and be wrong the moment a second graph appeared over the same
  connection, which is not hypothetical: `scenario.current()` builds exactly
  that. Same failure shape as a per-call surface defaulting its own event sink.

There is deliberately no raw-string escape hatch on `TenantGraph`. If a query
needs a shape the decoders don't cover, add a decoder to `src/db/cypher.ts`
rather than reintroducing one.

### The relational half

**The relational half has a typed surface too, now.** `ormOver(db)`
(`src/db/orm.ts`) mounts drizzle through `drizzle-orm/pg-proxy`, which takes a
*callback* rather than a client — `LabKitDB.query` with one more argument — so
the ORM sits **on** the seam beside `CypherRunner` instead of beside the
connection. It inherits tracing, whatever the session was scoped to, and the
open transaction, all for free; `drizzle(client)` would have inherited none of
them and nothing would have said so. There is no socket involved.

It replaced the only two places that assembled SQL by hand — `tenant.ts` and
`src/domain/event-store.ts`, four call sites, one of them building a `WHERE`
clause with `$${params.push(value)}` from MCP-supplied filters.

**`rowMode: "array"` is not optional and its absence is silent.** The proxy
driver decodes rows positionally; hand it objects and `select().from(t)` returns
**`[{}, {}]`** — right row count, no error — or dies inside an array column's
decoder with `undefined is not an object (evaluating 'value.map')`. That is why
the option is on the seam (`QueryOptions`) rather than left to each call site,
and why `directPostgresBackend` wraps its `pg.Client` instead of handing it
over: `pg.Client.query`'s third positional argument is a *callback*, so the
option has to travel in the config-object form. Forgetting to forward it in
`tests/helpers/db.ts` is how the failure above was met, twice.

One thing it buys beyond tidiness: **`bigserial` and `count(*)` come back as a
string from `pg` and a number from a raw PGlite**, and drizzle's column mappers
normalise that away. `event-store.ts` used to carry a `Number(r.seq)` for it.

`TenantContext` (`{ tenantId, graphName }`) comes from
`resolveTenantContext(db, slug)` (`src/db/tenant.ts`) — the CLI/MCP/bootstrap
boundary resolves a tenant once; below that boundary, every function takes a
resolved context, there is no "tenant omitted" mode.

## Tenant provisioning is reconciliation, run every time

There's no `ALTER GRAPH` DDL the way there's `ALTER TABLE` — evolving a
tenant's AGE graph structure (new label, new edge, new index) is
the application's job. `resolveTenantContext()` calls
`provisionTenantGraph()`, which — inside one transaction guarded by a
transaction-scoped `pg_advisory_xact_lock(tenantId)` — unconditionally
ensures the graph, every `NODE_LABELS`/`EDGE_LABELS` entry, every natural-id
index and every edge-uniqueness index exist.
This runs on *every* `resolveTenantContext()` call, deliberately, not gated
behind a version check — an earlier version added a `schema_version` gate as
a performance optimization and it was reverted (PJ-005) because it silently
stopped tenant resolution from self-healing drift. Don't reintroduce that
kind of gate without a measured cost driving it.

**No relational read side.** Every tenant used to get one SQL view per node
label, reconciled on each `resolveTenantContext()`. Nothing ever read them, and
nothing could: `TenantGraph` has no raw-SQL escape hatch, so every domain and
scenario read goes through `cypher()`. They were removed after eight scenarios
without a reader — 13 `CREATE OR REPLACE VIEW` statements per tenant per
resolution, plus a standing non-additive migration problem (a view's columns
can't be removed or reordered in place) held open for no consumer. This is not
a reversal of the no-cull policy: that policy protects unused *labels and
edges*, because a declared-but-unwalked edge is a claim about the domain. A view
claims nothing. The MCP/CLI read layer was the case for bringing them back and
it has since been built without them — every read goes through `cypher()` and
none wanted a relational projection. `git show 51b70d6:src/db/provisioning.ts`
has the implementation if one is ever earned;
`provisionTenantGraph()` and `dropTenantGraph()` (`src/db/provisioning.ts`)
are the only exports there. The class that does the work,
`TenantGraphProvisioner`, is **module-private** on purpose — it takes no lock
and opens no transaction itself, so `provisionTenantGraph()` is the only
entry point. Tests exercise reconciliation through `resolveTenantContext()`,
the same path production uses, never by calling internals directly.

"Ensures ... exists" means additive structure only: indexes are checked by
name (`IF NOT EXISTS`), labels by existence. There is deliberately no story
yet for a non-additive schema change (renaming a label, reshaping a
property that already has data) — see PJ-005's "Judgment calls."

## Connection/backend layering

`connectDb(projectRoot)` (`src/db/connect.ts`) picks a `DbBackend`
(`src/db/backend.ts`):

- **PGlite under an exclusive lock** (default): PGlite is single-writer and
  file-backed, so a process takes a PID lockfile, opens the file, does its
  work and gives both back. `runMigrations()` runs on every open — the no-op
  case is 2ms and the lock is held across it, so there is no concurrent-writer
  race. A process that finds the lock held **waits** rather than failing; the
  holder is 80-96ms away.
- **Direct Postgres** (`LABKIT_DB_URL` env var set): no lock, connects
  straight to a real Postgres, which is its own arbiter. Migrations are *not*
  run by this backend — that's an out-of-band deploy step by design (PJ-004).

### What replaced the leader election

**This replaced a leader election, and the reason is worth knowing before
anyone proposes bringing one back.** The winner of the lockfile race used to
open PGlite, start a `PGLiteSocketServer`, and connect *to itself* over
loopback TCP so every process — including the owner — talked to it as a
`pg.Client`. It was coherent and it bought nothing the use case needs: several
agents on one project cannot each hold a connection under it either, because
the first process in owns the file and the rest reach it only while that
process lives. Releasing between units of work was already forced. What the
socket added on top was a second failure mode — when the primary died, a
secondary's next query raised an **uncaught** `'error'` event from `pg` and
killed the process before any `catch` ran — and one upstream concurrency bug
([electric-sql/pglite#1046](https://github.com/electric-sql/pglite/issues/1046))
that the whole test suite was shaped around containing.

### Nothing holds the database between units of work

**So nothing holds the database between units of work, and `src/mcp/server.ts`
is where that matters.** An MCP server lives as long as its agent's session; if
it held the file for that long, nothing else could touch the project at all —
and the thing that most often wants it is **a person at a terminal**, running
`labkit known` or `labkit why` against the record an agent is currently writing.
Several agents at once is the rarer case and was the only one this paragraph
named until 2026-08-26.

It opens and closes around each tool call — 80-96ms warm, measured 2026-08-26
(open 70-85ms, migrate 2ms, tenant resolve 7-8ms, close 2ms) against a cold
open of 1067ms. Two overlapping calls serialise on the lock. **A process does
not skip its own lock**: two calls in one process read their own PID as alive
and the second waits, which is right, because the lock guards a `dataDir` and
one process opening it twice corrupts the file exactly as two would.

What keeps that server's process alive between calls is **the stdin
subscription, not a held connection** — measured under Bun 1.3.14, since the
comment that used to credit the connection would now be describing something
that no longer exists.

**Independently confirmed, on a second codebase.** Dan's `exo-ledger` runs the
design this replaced — a lockfile-elected daemon serving PGlite over the pg wire
protocol — and measured the arm LabKit could not, on the same machine: a client
connecting to a live daemon costs **1-7ms**, and the same unit of work costs
76-88ms through the socket against 81-87ms in-process. So the wire hop is free
at these shapes and the daemon buys a flat ~78ms per call and nothing else.
Their in-process open was 72-83ms cold-to-warm against LabKit's 70-85ms, which
is the same number twice from two codebases. Recorded because a measurement that
agrees from somewhere else is worth more than a repeat of your own.

## Row-level security, and what it is actually worth

A session connects as a **superuser**, and that is not laziness: `LOAD 'age'` is
refused to a non-superuser — `access to library "age" is not allowed`, SQLSTATE
42501, measured 2026-08-26 — and PGlite has no other way to get the library in.
So the order is fixed:

```
connect → bootstrapSession → migrate → resolveTenantContext → scopeToTenant → domain
```

`scopeToTenant` (`src/db/scoped.ts`) pins `labkit.tenant_id` with `set_config`
and then `SET ROLE labkit_app`. From that point a query on `public.labkit_event`
that forgets its tenant filter still returns only that tenant's rows, and one
that writes another tenant's row is refused with 42501.

### What the step-down is worth

**It is a safety boundary, not a security one.** The session can `RESET ROLE`
back to superuser. What it stops is a *query that forgot its filter*; what it
does not stop is a caller who means harm. Both halves of that matter — the word
"policy" invites a reader to assume the second.

**A real login boundary is closer than this said, and the correction is worth
knowing.** The refusal is of *issuing* `LOAD`, not of needing it. `docker/postgres`'s
base image runs `postgres -c shared_preload_libraries=age`, so AGE is in every
backend at server start; measured on it, a plain LOGIN role that never issues
`LOAD` resolves `agtype` and reads through Cypher fine. So the ingredients are a
preloading server plus a `bootstrapSession` that does not issue `LOAD` — not the
per-role `session_preload_libraries` this used to name. PGlite still needs the
step-down, having no preload and one superuser session. **Noted, not built**;
the write half of that probe was not re-verified after a grant gap in the probe
itself.

### Three things measured rather than assumed

Three things that are easy to get wrong here, all measured rather than assumed:

- **A superuser bypasses RLS unconditionally**, and `FORCE ROW LEVEL SECURITY`
  is not enough to stop it. A non-superuser role is required, which is the whole
  reason the step down exists.
- **`current_setting('labkit.tenant_id')` has no `missing_ok`, deliberately.** A
  scoped session that never had its tenant set raises 42704 on the first read.
  The soft form returns NULL and the policy then matches nothing, so the log
  reports that nothing has ever happened against a full table — the confidently
  wrong answer this repo goes furthest to avoid.
- **Grants live in `provisionTenantGraph()`, not in a migration.** A tenant's
  schema does not exist when the migrations run, and neither do the label tables
  a future release will add to it. `ALTER DEFAULT PRIVILEGES` covers what comes
  later and a blanket `GRANT … ON ALL TABLES` covers what came before; each
  misses what the other catches.

### Why the role and the grants are hand-written

**Which migration holds what is decided by one rule: drizzle cannot migrate what
it does not manage.** `drizzle/0002_natural_ids.sql` is *the* hand-written
migration — natural-id sequences and functions, and since 2026-08-26 the
`labkit_app` role and every `GRANT`, because drizzle models privileges not at
all (measured: the string `GRANT ` does not appear anywhere in drizzle-kit's
bundle). Everything drizzle *does* manage stays in files it generated and nobody
edits. The filename says which is which: generated migrations carry drizzle-kit's
random names, hand-written ones are named for what they do.

**`pgRole(...).existing()` is what keeps the generated file generated.**
`generatePgSnapshot` skips a role marked that way (`if (!role._existing)`), so
the RLS migration names the role in its policy and never emits a `CREATE ROLE`
that `0002` has already made, guarded. Two things that look like the right lever
and are not: `pgRole(name, { createRole: false })` is the Postgres `CREATEROLE`
*attribute*, and `entities.roles.exclude` is consumed only by drizzle-kit's
*introspection* path — `generatePgSnapshot` takes no config at all. The first
misreading is what produced a hand-edited generated migration in the first place.

**`ALTER DEFAULT PRIVILEGES IN SCHEMA public` in `0002` is why a new
tenant-aware table needs no privilege work.** `labkit_event` does not exist yet
at `0002` and so cannot be granted explicitly from there; default privileges
cover it and everything added after. Verified 2026-08-26 by creating a table and
asking `has_table_privilege`/`has_sequence_privilege` — both true with no grant
naming it. It holds only while one role runs every migration, which is true
today. One caveat found by trying it: a table with a foreign key generates an
`ALTER TABLE … ADD CONSTRAINT`, which `check:migrations` requires a
`-- lock-strategy:` line for — the check working, but one comment prepended by
hand.

`tests/tenancy-isolation.test.ts` is the reader. It drives `connectDb()`, the
real resolve and the real step-down, so a missing grant surfaces as a
permissions error rather than being supplied by the test — and it asserts
`current_user` is not a superuser, without which every other assertion in it
would pass against a session with no policy in force.

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

---

## Dated probe findings

Confirmed facts about Apache AGE, most of them established on 2026-08-17/18
while the persistence layer was being built. **A dated record**: each item says
when it was checked, so it cannot go stale — read it for what was true then, and
re-check before relying on it.

The heading carried the 2026-08-17/18 range until 2026-09-05, when a later
finding was added under it. The dates belong on the items, which have them.

Read it before changing tenancy, natural ids or provisioning.
`.claude/skills/postgres-age/SKILL.md` is the working reference for AGE; this is
the evidence under some of it.

Items mentioning the per-tenant CQRS views describe machinery that was removed
on 2026-08-19 — see CLAUDE.md's "No relational read side".

### What was confirmed

- **Function-in-Cypher-CREATE** (2026-08-17): works, but only with
  explicit `::text` casts on literal arguments
  (`labkit_next_natural_id('computation'::text, 'COMP'::text)`) — without
  the cast, Postgres can't resolve a `(text, text)` overload against
  Cypher's `agtype`-typed string literals.
- **View-over-label-table property shape** (2026-08-17): a label's
  `properties` column round-trips cleanly through
  `(properties::text)::jsonb ->> 'key'` — no `::vertex`/`::edge`-suffix
  stripping needed (that suffix is only on a full vertex/edge composite
  returned by `cypher()`, not a bare `properties` column read directly off
  the table).
- **Label-table column shape** (2026-08-17): confirmed via
  `information_schema.columns` — exactly two columns, `id` (graphid) and
  `properties` (agtype).
- **Natural-id uniqueness** (2026-08-17): DB-enforced via a functional
  `UNIQUE INDEX` on
  `ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)`
  — confirmed a duplicate `natural_id` set via Cypher `SET` raises a real
  Postgres `duplicate key value violates unique constraint` error, not just
  relying on `nextval()`'s atomicity as an unenforced assumption.
- **Generated column for `tenants.graph_name`** (2026-08-18): `text
  GENERATED ALWAYS AS ('labkit_t' || id) STORED` works under PGlite exactly
  as it would against real Postgres — confirmed via `drizzle-kit generate`'s
  output and a direct insert/select round trip.
- **Advisory-lock-guarded transactional tenant provisioning** (2026-08-18):
  `BEGIN; SELECT pg_advisory_xact_lock($1); ...; COMMIT;` wrapping the full
  `create_graph`/`create_vlabel`/`create_elabel`/index/view sequence works
  under `pglite-age` — confirmed idempotent (a second `provisionTenantGraph`
  call for the same tenant is a no-op) and confirmed under real concurrency
  via `tests/helloworld.test.ts`'s 3-way leader-election race, each process
  provisioning a distinct new tenant.
- **`MERGE` for relationships — spiked and found BROKEN** (2026-08-18):
  `MATCH (a...), (b...) MERGE (a)-[:EDGE]->(b)` runs without error and
  returns what looks like a valid edge, but the created edge's
  `start_id`/`end_id` are both `0` — it never actually connects `a` and `b`.
  `TenantGraph.createEdge()` uses an explicit existence check + `CREATE`
  instead (see the postgres-age skill's gotchas section). **The one item here
  that did not resolve the way it was expected to**, which is why it is the most
  useful one.
- **Edge label tables have `id`/`start_id`/`end_id`/`properties`
  columns** (2026-08-18): confirmed via `information_schema.columns` for
  `"labkit_t1"."USES"` — the same "labels are real Postgres tables" fact
  PJ-002 already established for vertices, extended to edges. This is what
  made a real `UNIQUE (start_id, end_id)` index possible, closing the
  concurrent-`createEdge` race the check-then-`CREATE` fallback above
  couldn't on its own — see
  `docs/project-journal/005_provisioning_reconciliation.md`.
- **`ag_catalog.drop_label(graph, label, false)`** (2026-08-18): drops a
  vertex or edge label. The documented third `cascade`/force argument
  rejects `true` under pglite-age ("force option is not supported yet") —
  pass `false`. Used to test provisioning reconciliation — re-resolving a
  tenant (`resolveTenantContext()`, the real production path, not an
  internal function called directly) restores a label that was dropped out
  from under it.

### Row-level security reaches Cypher, 2026-09-05

**A policy on a label table filters `MATCH`, on both backends.** Every AGE
label is a real Postgres table, and `ag_catalog.cypher()` executes as the
calling role rather than an elevated one — so a `CREATE POLICY` on
`"<graph>"."MOTIVATES"` hides rows from a traversal without any query knowing
about it.

Measured against a Question/LineOfEnquiry/MOTIVATES triple, with a policy
excluding rows whose `properties` carry `retracted`, read back through the
ordinary domain query as `labkit_app`:

| | |
| --- | --- |
| edges visible before the policy | 1 |
| edges visible after it, as `labkit_app` | 0 |
| rows as superuser | 1 |
| **node** labels, same policy, as `labkit_app` | 0 |
| writing an edge to a hidden node | refused: `target LOE_1 not found in tenant labkit_t1` |

Identical on PGlite and on `apache/age:release_PG18_1.7.0` with a genuine role
boundary — the two backends agree, which is what that arm exists to establish.

Four consequences, since each was checked rather than reasoned about:

- **Node labels and edge labels behave the same way.** Both are ordinary
  tables.
- **No read changes.** Not one `MATCH` was touched in either run. That is the
  difference between one policy per label and every clause in `src/domain/read/`
  growing a filter — the shape that reached six copies with
  `SUPPORTS`/`CHALLENGES`.
- **Writes fail safe.** Attaching to a hidden node is refused by the endpoint
  diagnosis `createEdge` already performs, with the message it already has.
- **The row survives.** An admin connection still sees it, so this hides rather
  than destroys.

**How strong the hiding is, exactly**: as strong as the step-down, which is a
*safety* boundary and not a security one — see "What the step-down is worth"
above, and #60. The probe ran as `labkit_app` through `SET ROLE`, and reached
the retracted row again by `RESET ROLE`, which any code in the process can do.
So a policy stops a traversal that should not see a retracted record; it does
not stop a caller who means to. For soft-delete that is the wanted behaviour —
an operator has to be able to read what was retracted — but it is a guardrail,
and calling it more would be the mistake #60 names about the step-down itself.
A login role, which cannot `RESET ROLE`, would make the same policy a real
boundary; that is #60's deferred work and it is per-backend, since PGlite has
one superuser session and no preload.

**What this does not establish**: that a *property change* can retract an edge.
`PropsChanged` is applied by `TenantGraph.setNodeProperty`, which addresses a
node by `natural_id`; edges have none and are addressed by their
`(from, label, to)` triple. Retracting a node is expressible today and
retracting an edge is not. Probed because #134 (`labkit undo`) proposed
soft-delete over deletion; whether node-only retraction is sufficient — every
pattern binding a hidden node already fails to match — was **not** measured.

### Not yet probed

Things a stronger check would establish and nothing currently does. Beyond what
`scripts/smoke-cli.sh` covers:

- **Second tenant, natural ids keep incrementing globally.** Run the script
  twice with a different tenant slug (edit the `resolveTenantContext` call)
  and confirm the second run's `Computation` gets `COMP_2`, not another
  `COMP_1` in a fresh sequence — natural ids are scoped globally per
  entity-type, not per-tenant (PJ-004 decision #3), even though each
  tenant's nodes live in a structurally disjoint graph.
- **Tenant isolation under real concurrency, not just a unit test.** Run two
  copies of a script resolving two different tenant slugs at the same time
  against the same `projectRoot` and confirm neither's data is visible to
  the other's `TenantGraph` — `tests/domain-graph.test.ts`'s "tenant
  isolation" describe block covers this within one process; a real
  multi-process version is a stronger check.
- **Invalidate an artefact, confirm propagation by natural id only.** Add
  an `Artefact` node, `RECORDED_IN`-link it to the `Evidence` this script
  creates, then run the invalidation-propagation query from
  `.claude/skills/postgres-age/SKILL.md`'s cookbook and confirm the
  returned `Claim`/`Decision`/`LineOfEnquiry` are addressable by
  `natural_id` alone — no raw graphid should ever need to appear in that
  output.
- **Kill and restart the leader.** Start `scripts/smoke-cli.sh`, and while it's
  mid-run (or right after) start a second process connecting to the same
  `projectRoot` — confirm one becomes primary, the other secondary, and
  both see the same data. **Nothing covers this in the suite**, and that is
  deliberate: `tests/connection-lock.test.ts` reaches each claim about the
  lockfile deterministically, having replaced a three-way `Promise.all` race
  that was the suite's flakiest file. Real staggered process starts are the
  check that race was standing in for, and they are a thing to do by hand.
**Real Postgres backend, via Docker — done (2026-08-18).**
  `docker-compose.yml` (repo root) runs `apache/age:release_PG18_1.7.0` —
  the exact AGE version/branch `pglite-age` itself is built from (see the
  postgres-age skill's "Overview"), not an arbitrary AGE release:

  ```sh
  docker compose up -d
  ```

  Confirmed against that container:
  - **`pgvector` is NOT bundled** in this image (`CREATE EXTENSION vector`
    fails: `extension "vector" is not available`) — no longer "unconfirmed
    either way." Not blocking today (nothing queries vector features yet),
    but a real gap to close before this image can stand in for a full
    direct-Postgres deployment.
  - **The full stack round-trips correctly**: migrations (0000/0002, with
    0001's `CREATE EXTENSION vector` statement skipped for the reason
    above), `resolveTenantContext`/`provisionTenantGraph`, `createNode`
    natural-id generation, `createEdge` idempotency (calling it twice still
    produces exactly one edge), the CQRS view read-side, and the
    schema-qualification fix (`labkit_next_natural_id`/`labkit_prop` land in
    `public`, confirmed via `pg_proc`/`pg_namespace`) — all verified via a
    one-off script using `drizzle-orm/node-postgres`'s migrator (not
    `runMigrations()`, which is PGlite-specific — see `src/db/migrate.ts`).
    There is still no real `db:migrate`-equivalent script wired up for
    `directPostgresBackend`; that remains the documented out-of-band-step
    gap (PJ-004), unaffected by this verification.
  - **`MERGE` for relationships works correctly here** — `start_id`/`end_id`
    come back properly populated, unlike under `pglite-age`. This confirms
    the `MERGE` bug is a genuine WASM/pglite-age-specific regression, not a
    stock-AGE limitation like the other three known gotchas (which *do*
    reproduce identically on this real container — see the postgres-age
    skill's "Upstream filing" section for the full breakdown and what's
    worth reporting where). `TenantGraph.createEdge()`'s check-then-`CREATE`
    fallback is confirmed to be a `pglite-age`-only workaround, not a
    permanent design choice — worth revisiting if a future `pglite-age`
    upgrade picks up a MERGE fix, though the `UNIQUE (start_id, end_id)`
    index stays regardless as the real concurrency guarantee.
