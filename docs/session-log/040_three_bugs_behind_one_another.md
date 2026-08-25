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

## Open

Nothing from this work. `docs/TASKS.md` has no actionable items left.

Two things named across entries 034-039 and still unbuilt, neither queued:
`docs/cli.md` generated from `src/cli/program.ts`'s command surface in the shape
of `docs/mcp-tools.md`, and shell completions from the same surface.

## Next

PR #29 awaits review.

`docs/TASKS.md` is empty of actionable work for the first time in this run of
sessions. The next thing is the domain modelling the user has been deferring to
— PJ-008 §3's index table is where the open rows are.
