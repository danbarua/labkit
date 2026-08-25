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

**`430bfdb`** and this commit are the entry.

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

The next job is the one Dan named: sort out the DB abstractions so `LabKitDB`
keeps its raw-SQL `query()` **and** offers drizzle for dynamic query building
and type coercion, then move `src/domain/event-store.ts` onto it. The
`labkitEvents` table is already declared and unread, so that is where to start.

`docs/TASKS.md` is empty of actionable work for the first time in this run of
sessions; the domain modelling behind PJ-008 §3's open rows is still the larger
thing waiting.
