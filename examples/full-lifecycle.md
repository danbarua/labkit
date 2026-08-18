# Full-lifecycle checklist

`full-lifecycle.ts` is a runnable smoke test of LabKit's persistence layer
end to end. Run it with:

```sh
bun examples/full-lifecycle.ts
```

It writes real state to `<projectRoot>/.labkit/pglite` (gitignored) — safe to
run repeatedly, `getOrCreateProject` and the natural-id generator are both
idempotent-or-incrementing by design.

## Spike outcomes this script's design depends on

Resolved during implementation (2026-08-17), recorded here so the next
change to the natural-id/CQRS machinery in `drizzle/0002_natural_ids.sql`
starts from confirmed facts, not assumptions:

- [x] **Function-in-Cypher-CREATE**: works, but only with explicit `::text`
  casts on literal arguments (`labkit_next_natural_id('computation'::text,
  'COMP'::text)`) — without the cast, Postgres can't resolve a `(text,
  text)` overload against Cypher's `agtype`-typed string literals.
- [x] **View-over-label-table property shape**: a label's `properties`
  column round-trips cleanly through `(properties::text)::jsonb ->> 'key'`
  — no `::vertex`/`::edge`-suffix stripping needed (that suffix is only on
  a full vertex/edge composite returned by `cypher()`, not a bare
  `properties` column read directly off the table).
- [x] **Label-table column shape**: confirmed via `information_schema.columns`
  — exactly two columns, `id` (graphid) and `properties` (agtype).
- [x] **Natural-id uniqueness**: DB-enforced via a functional `UNIQUE INDEX`
  on `ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)`
  — confirmed a duplicate `natural_id` set via Cypher `SET` raises a real
  Postgres `duplicate key value violates unique constraint` error, not just
  relying on `nextval()`'s atomicity as an unenforced assumption.

## Scenarios another agent should try next

Beyond what `full-lifecycle.ts` already exercises:

- **Second project, natural ids keep incrementing globally.** Run the
  script twice with a different project name (edit the
  `getOrCreateProject` call) and confirm the second run's `Computation`
  gets `COMP-2`, not another `COMP-1` — natural ids are scoped globally per
  entity-type, not per-project (decided 2026-08-17).
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
- **Real Postgres backend.** Set `LABKIT_DB_URL` to a real Postgres
  connection string with `age`/`vector` installed, run
  `bunx drizzle-kit migrate` (or equivalent) against it out-of-band first
  (per the 2026-08-17 decision to defer in-process migration locking for
  this backend), then run this script — confirm `directPostgresBackend`
  (src/db/backend.ts) round-trips correctly against a non-PGlite Postgres.
  This is unverified — `pglite-age` and stock AGE have already been found
  to diverge on a couple of syntax points (see the postgres-age skill's
  gotchas section), so don't assume this path works until it's actually
  been run once.
