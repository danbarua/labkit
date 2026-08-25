# 040: three bugs behind one another

**Session wrap, 2026-08-25, on `fix/binary-migrations`.** Not a decision record
— the asset-embedding design is argued in `src/db/migrations.ts` and
`src/db/extensions.ts`.

Range is exactly this session: baseline `0099d5b`, the merge of PR #28, closed
with `close-entry.sh` when that merged.

## Goal

`docs/TASKS.md` Task 1: the compiled binary could not migrate a database that
did not exist yet.

## Changed

One commit, open as **PR #29**.

**`c7186a1` — the compiled binary works.**

- `src/db/migrations.ts` **new** — the SQL as text imports; rebuilds the
  `MigrationMeta[]` `readMigrationFiles` would have returned, byte-identically.
  Throws by name if the journal and the imports disagree in either direction.
- `src/db/migrate.ts` — drizzle's `migrate()` with its first statement replaced.
- `src/db/extensions.ts` **new** — `bundlePath` for AGE and pgvector, plus
  PGlite's `pgliteWasmModule` / `initdbWasmModule` / `fsBundle`. The two
  tarballs are materialised to a temp file; everything else is read in place.
- `src/db/backend.ts` — takes its extensions and assets from there.
- `src/db/sql-modules.d.ts` **new** — `*.sql`, `*.tar.gz`, `*.wasm`, `*.data`.
- `tests/migrations.test.ts` **new** — deep-compares the embedded builder
  against `readMigrationFiles` over the same folder.
- `scripts/smoke-binary.sh` **new** (`bun run check:binary`).
- `docs/TASKS.md` — Task 1 deleted. The queue now holds only the
  deliberately-not-being-done list.
- `CLAUDE.md`, `package.json`.

**`fc3e007` — the upstream context**, after Dan asked whether we could really be
the first team bundling bun + PGlite + drizzle. We are not, and it is not fixed:
pglite#414 and bun#15032 are the same `ENOENT … /$bunfs/root/pglite.data`, open
since Bun 1.1.33 and labelled outside the maintainers' control. Cited in
`src/db/extensions.ts` and CLAUDE.md so the next reader does not re-derive it.

**`ef941bb` — cull pgvector.** Two references under `src/`, nothing else: no
column, no query, no `CREATE EXTENSION`. It cost a dependency, an embedded
tarball, and half of `streamable()`'s reason to exist. Confirmed against the
container, which does not offer `vector` at all. Dated records keep their
finding; only live statements moved.

**`395749f` — `docs/db-layering-plan.md`**, for review, nothing built. The
`src/db/` map, the superuser/application split, the lock-not-socket connection
model, drizzle via `pg-proxy`, RLS, a five-step sequence and four open
questions. It says to delete itself when the work lands.

**`430bfdb`, `c8901cd`** and this commit are the entry.

Working tree clean.

## Verified

- `bun run check` — **all 16 pass, exit 0**. Suite time unchanged at ~63s, so
  loading the assets eagerly cost nothing measurable.
- **A full lifecycle through the binary**: open, observe, analyse, promote,
  close, then `known`, `happened` and `--json` from a *second process* against
  the same directory — which is what proves the ledger was written and nothing
  re-applied.
- **Watched to fail**: removing one entry from `EMBEDDED` makes `check:binary`
  name the missing tag and reddens all three migration tests.
- Each of the three bugs was confirmed fixed by rebuilding and re-running, not
  by inspection.

**Measured for the plan, all today, none quoted from memory:**

- **72ms** for a full acquire → query → release cycle; **67ms** warm open;
  **1031ms** cold; **2ms** no-op migrate. These are what make killing the socket
  viable.
- **What happens when the primary dies**: the secondary takes an uncaught
  `'error'` event from `pg` — `Connection terminated unexpectedly`, the same
  string CLAUDE.md attributes to teardown races — and the process is gone before
  a `catch` runs. Stale lock reclaimed correctly for new processes.
- **RLS on both backends.** Superusers bypass it unconditionally and `FORCE` is
  not enough; under a non-superuser role, PGlite showed only the scoped tenant
  and real Postgres showed 5 of 6 then 1 of 6, refusing a cross-tenant insert.
- **`pg-proxy` is a callback, not a socket** — drizzle over a raw in-process
  PGlite, one invocation, zero sockets, correct typed result.
- **The full CLI lifecycle against real Postgres 18.1 + AGE 1.7.0**, with the
  embedded migrations applied out-of-band. First time the CLI has ever been run
  against Postgres.
- **Drizzle's documented advice was tested, not argued about.** Its docs say to
  copy `drizzle/` alongside the build output. A binary built that way, with
  `migrationsFolder` resolved next to `process.execPath`, finds the folder
  correctly and then dies on `pglite.data` — so it fixes at most one of the
  three.

## Open

Nothing broken. `docs/TASKS.md` has no actionable items left.

**What this did *not* touch, and what Dan named as the next real job**:
`src/domain/event-store.ts` still builds its `WHERE` clause by array-push and
`$${params.push(v)}` — the one place in the codebase that assembles SQL rather
than Cypher, and not tenant-aware by type. Meanwhile `labkitEvents` is a fully
declared `pgTable` in `src/db/schema.ts` with **zero readers**: `grep` finds its
own definition and an `$inferSelect` type and nothing else. The table drizzle
would need already exists and the event store ignores it.

**The plan is unreviewed and nothing in it is built.** Four questions are open
in it deliberately: the barrel, the `client.ts` name, where transaction
ownership lives, and how the isolation tests survive session-scoped tenancy.
Three more are named as out of scope, including deriving the tenant slug from the
project path.

**Migrations are not hand-rolled**, which is worth stating because the change
looks like it. `dialect.migrate()` is drizzle's — its ledger, transaction and
skip logic, untouched — and the SQL is still drizzle-kit's under `drizzle/`.
What was replaced is `readMigrationFiles`: ten lines reading a journal and
hashing a file, held to drizzle's own output by `tests/migrations.test.ts`.

Two things named across entries 034-039 and still unbuilt, neither queued:
`docs/cli.md` generated from `src/cli/program.ts`'s command surface in the shape
of `docs/mcp-tools.md`, and shell completions from the same surface.

## Next

PR #29 awaits review.

`docs/db-layering-plan.md` awaits review. Its four open questions want answers
before step 1; the sequence after that is naming and cruft, then killing the
socket, then the pipeline, then RLS, then the four SQL sites.

`docs/TASKS.md` is empty of actionable work for the first time in this run of
sessions; the domain modelling behind PJ-008 §3's open rows is still the larger
thing waiting.
