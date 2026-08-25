# Full-lifecycle checklist

`full-lifecycle.sh` is a runnable smoke test of LabKit end to end. Run it with:

```sh
bash examples/full-lifecycle.sh
```

**Exit 0 means it worked and nothing else does.** It asserts on what came back,
not on whether the commands ran, and it is hermetic: `--db` points it at a fresh
temporary directory, removed on exit, so it can neither touch a working database
nor contend with one.

It replaced `full-lifecycle.ts`, which wrote by calling
`TenantGraph.createNode` directly — underneath the domain layer, so it exercised
the persistence machinery and said nothing about whether the research verbs were
usable, and it put nodes on the record that no verb had recorded making. Every
line of the shell version is a command a person could type.

The spike outcomes below are **dated records of 2026-08-17/18** and are about
the persistence layer, which is unchanged. They are why the machinery underneath
is shaped as it is; read them before touching tenancy, natural ids or
provisioning. Several sections mention the CQRS views, which were removed on
2026-08-19 (`af5a1d2`) — see CLAUDE.md's "No relational read side".

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

Beyond what `full-lifecycle.sh` already exercises:

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
- **Kill and restart the leader.** Start `full-lifecycle.sh`, and while it's
  mid-run (or right after) start a second process connecting to the same
  `projectRoot` — confirm one becomes primary, the other secondary, and
  both see the same data (this is what `tests/helloworld.test.ts` already
  covers with a controlled 3-way race; trying it with real staggered
  process starts is a stronger real-world check than a `Promise.all` in
  one test file).
- ~~**Real Postgres backend, via Docker.**~~ **Done (2026-08-18).**
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
