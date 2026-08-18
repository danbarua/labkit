# Full-lifecycle checklist

`full-lifecycle.ts` is a runnable smoke test of LabKit's persistence layer
end to end. Run it with:

```sh
bun examples/full-lifecycle.ts
```

It writes real state to `<projectRoot>/.labkit/pglite` (gitignored) — safe to
run repeatedly, `resolveTenantContext` and the natural-id generator are both
idempotent-or-incrementing by design.

## Spike outcomes this script's design depends on

Resolved during implementation, recorded here so the next change to the
tenancy/natural-id/CQRS machinery starts from confirmed facts, not
assumptions:

- [x] **Function-in-Cypher-CREATE** (2026-08-17): works, but only with
  explicit `::text` casts on literal arguments
  (`labkit_next_natural_id('computation'::text, 'COMP'::text)`) — without
  the cast, Postgres can't resolve a `(text, text)` overload against
  Cypher's `agtype`-typed string literals.
- [x] **View-over-label-table property shape** (2026-08-17): a label's
  `properties` column round-trips cleanly through
  `(properties::text)::jsonb ->> 'key'` — no `::vertex`/`::edge`-suffix
  stripping needed (that suffix is only on a full vertex/edge composite
  returned by `cypher()`, not a bare `properties` column read directly off
  the table).
- [x] **Label-table column shape** (2026-08-17): confirmed via
  `information_schema.columns` — exactly two columns, `id` (graphid) and
  `properties` (agtype).
- [x] **Natural-id uniqueness** (2026-08-17): DB-enforced via a functional
  `UNIQUE INDEX` on
  `ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)`
  — confirmed a duplicate `natural_id` set via Cypher `SET` raises a real
  Postgres `duplicate key value violates unique constraint` error, not just
  relying on `nextval()`'s atomicity as an unenforced assumption.
- [x] **Generated column for `tenants.graph_name`** (2026-08-18): `text
  GENERATED ALWAYS AS ('labkit_t' || id) STORED` works under PGlite exactly
  as it would against real Postgres — confirmed via `drizzle-kit generate`'s
  output and a direct insert/select round trip.
- [x] **Advisory-lock-guarded transactional tenant provisioning** (2026-08-18):
  `BEGIN; SELECT pg_advisory_xact_lock($1); ...; COMMIT;` wrapping the full
  `create_graph`/`create_vlabel`/`create_elabel`/index/view sequence works
  under `pglite-age` — confirmed idempotent (a second `provisionTenantGraph`
  call for the same tenant is a no-op) and confirmed under real concurrency
  via `tests/helloworld.test.ts`'s 3-way leader-election race, each process
  provisioning a distinct new tenant.
- [ ] **`MERGE` for relationships — spiked and found BROKEN** (2026-08-18):
  `MATCH (a...), (b...) MERGE (a)-[:EDGE]->(b)` runs without error and
  returns what looks like a valid edge, but the created edge's
  `start_id`/`end_id` are both `0` — it never actually connects `a` and `b`.
  `TenantGraph.createEdge()` uses an explicit existence check + `CREATE`
  instead (see the postgres-age skill's gotchas section). Left unchecked
  here deliberately — it's the one item on this list that did NOT resolve
  the way it was expected to.
- [x] **Edge label tables have `id`/`start_id`/`end_id`/`properties`
  columns** (2026-08-18): confirmed via `information_schema.columns` for
  `"labkit_t1"."USES"` — the same "labels are real Postgres tables" fact
  PJ-002 already established for vertices, extended to edges. This is what
  made a real `UNIQUE (start_id, end_id)` index possible, closing the
  concurrent-`createEdge` race the check-then-`CREATE` fallback above
  couldn't on its own — see
  `docs/project-journal/005_provisioning_reconciliation.md`.
- [x] **`ag_catalog.drop_label(graph, label, false)`** (2026-08-18): drops a
  vertex or edge label. The documented third `cascade`/force argument
  rejects `true` under pglite-age ("force option is not supported yet") —
  pass `false`. Used to test provisioning reconciliation — re-resolving a
  tenant (`resolveTenantContext()`, the real production path, not an
  internal function called directly) restores a label that was dropped out
  from under it.

## Scenarios another agent should try next

Beyond what `full-lifecycle.ts` already exercises:

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
- **Kill and restart the leader.** Start `full-lifecycle.ts`, and while it's
  mid-run (or right after) start a second process connecting to the same
  `projectRoot` — confirm one becomes primary, the other secondary, and
  both see the same data (this is what `tests/helloworld.test.ts` already
  covers with a controlled 3-way race; trying it with real staggered
  process starts is a stronger real-world check than a `Promise.all` in
  one test file).
- **Real Postgres backend, via Docker (not a local AGE build).** Compiling
  Apache AGE from source against macOS's system Postgres has not been
  workable here — Docker is installed but not yet set up as the path around
  that. Apache AGE publishes an official image
  ([`apache/age`](https://hub.docker.com/r/apache/age) on Docker Hub,
  confirmed via the project's own README) that ships a compatible Postgres
  with the extension pre-built:

  ```sh
  docker pull apache/age
  docker run --name labkit-age \
    -p 5455:5432 \
    -e POSTGRES_USER=labkit \
    -e POSTGRES_PASSWORD=labkit \
    -e POSTGRES_DB=labkit \
    -d apache/age
  ```

  That image doesn't obviously bundle `pgvector` (unconfirmed either way —
  check before assuming) — since nothing in this codebase queries vector
  features yet, that's not blocking for this scenario, but note it if it
  comes up. Once the container is up:

  ```sh
  export LABKIT_DB_URL="postgres://labkit:labkit@localhost:5455/labkit"
  bunx drizzle-kit migrate   # out-of-band, per the 2026-08-17 decision to
                              # defer in-process migration locking for this backend
  bun examples/full-lifecycle.ts
  ```

  Confirm `directPostgresBackend` (`src/db/backend.ts`) round-trips
  correctly against a real (if containerized) Postgres, not PGlite. This is
  unverified — `pglite-age` and stock AGE have already been found to
  diverge on more than one syntax point now (including the `MERGE` bug
  above) — so don't assume the migrations or the tenancy/natural-id/CQRS
  machinery work against real AGE until this has actually been run once.
  If `MERGE` turns out to work correctly against real AGE, that's a signal
  `TenantGraph.createEdge()`'s check-then-create fallback is a
  `pglite-age`-only workaround, not a permanent design choice.
