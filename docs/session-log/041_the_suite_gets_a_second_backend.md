# 041: the suite gets a second backend

**Session wrap, 2026-08-26, on `fix/binary-migrations`.** Not a decision record
— the argument for two backends is in `tests/helpers/db.ts`'s header and
`scripts/test-postgres.sh`'s.

Baseline `a5f1fa6`, where entry 040 was closed. One commit, on **PR #29**.

## Goal

Dan asked whether to add an optional bun task running the test suite against the
docker container. Answer: yes, and it landed.

## Changed

**`4013f78` — `bun run test:pg`.**

- `scripts/test-postgres.sh` **new** — starts `docker-compose.yml`'s `db`
  service if it is not up, waits on `pg_isready`, sets `LABKIT_DB_URL` and runs
  `bun test`. Leaves the container running, since the next run then costs
  nothing.
- `tests/helpers/db.ts` — branches on `LABKIT_DB_URL`. Under PGlite,
  `openClient()` stays a labelled view onto the one shared session; under
  Postgres it is a real connection that `close()` really closes. Exports
  `usingPostgres()`.
- `src/db/migrate.ts` — `runMigrationsOnPostgres` beside `runMigrations`, both
  over one `applyEmbedded` and the same `embeddedMigrations()`. Deliberately
  **not** wired into `directPostgresBackend`: with no lock and N processes
  connecting, migrating on connect would be a race, and PJ-004 makes it an
  out-of-band step. A test run is a legitimate instance of one.
- `tests/connection-lock.test.ts` — `describe.skipIf(usingPostgres())`.
- `tests/mcp-stdio.test.ts` — a `childEnv()` that strips `LABKIT_DB_URL` from
  the servers it spawns.
- `package.json`, `CLAUDE.md`.

Working tree clean; pushed.

## Verified

- **`bun run test:pg` — 360 pass, 4 skip, 0 fail, 1763 assertions, 56.4s,
  exit 0.** First run, no triage needed. First time the suite has ever run
  against a real Postgres. The four skips are the lockfile tests.
- **`bun run check` — all 16 pass, exit 0**, so the default PGlite path is
  unchanged: 364 pass, 0 fail, 52.0s.
- The container is `apache/age:release_PG18_1.7.0` from the checked-in
  `docker-compose.yml`. Measured through the full stack before writing anything:
  migrations via the node-postgres dialect **22ms**, `resolveTenantContext`
  **74ms cold / 5ms warm**, a Cypher round trip through `TenantGraph`, and **two
  genuinely concurrent connections** — which is the capability PGlite does not
  have and the reason this exists.

## Open

Nothing broken.

**The suite ignored `LABKIT_DB_URL` entirely before this**, which is worth
recording because it was invisible: `tests/helpers/db.ts` constructed
`new PGlite(...)` directly and never went through `connectDb`, so setting the
variable and running `bun test` did nothing at all and said nothing about it.

**Two opt-outs, both deliberate.** `tests/connection-lock.test.ts` skips because
its subject is the PGlite lockfile and a real Postgres is its own arbiter —
running it there would prove the lock works while exercising a path deployment
never takes. `tests/mcp-stdio.test.ts` strips the variable from its children
because each is given a private temporary directory and `LABKIT_DB_URL` **wins
over one** (`src/db/connect.ts`), so without the strip those servers would have
written into the shared container while the test believed it was isolated.

**`reset()` truncates every table outside four system schemas**, so
`LABKIT_DB_URL` must name a throwaway database. Said in the script header and in
CLAUDE.md; not enforced anywhere, because nothing can tell a throwaway database
from a real one.

**Nothing runs `test:pg` for you** — no CI, no hook, and `bun run check` does
not include it. That is the trade for it needing docker, and the `test:` prefix
rather than `check:` is what keeps it out of the derived list without an
exclusion.

Four of the layering plan's six steps remain: the pipeline, RLS, the four
raw-SQL sites, and the tenancy-isolation suite.

## Next

Step 3 of `docs/db-layering-plan.md`: `scoped()` beside `traced()` in
`src/db/trace.ts`'s decorator shape, transaction ownership moved out of
`src/db/graph.ts`'s `inTransaction` to the top of the pipeline, and drizzle
mounted through `drizzle-orm/pg-proxy` over `LabKitDB.query`.

From here on, both `bun run check` and `bun run test:pg` are worth running
before each step lands — steps 4 to 6 are about roles, tenancy and isolation,
which is exactly the ground only the Postgres backend can settle.
