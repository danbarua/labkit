# Outstanding work

**A queue, not a record.** Only actionable items live here — a finished item is
**deleted**, not struck through; git history is the record. What the model knows
lives in PJ-008 §3's index table; standing facts and gates live in CLAUDE.md.
Neither is restated here — see CLAUDE.md, "The one rule about documents".

---

## 1. The compiled binary cannot migrate

`bun run build` produces `bin/labkit`, and against a database that does not
exist yet it dies with `Can't find meta/_journal.json file`. `runMigrations()`
(`src/db/migrate.ts`) locates `drizzle/` with
`new URL("../../drizzle", import.meta.url)`, and inside a `bun build --compile`
bundle that URL is `/$bunfs/root/…`, where the folder is not.

**Measured 2026-08-25 against both entry points** — the old `src/cli.ts` built
as a binary fails identically — so it predates the CLI split and was never
caused by it. It has simply never been run: `bun run dev` and `bun test` both
read `drizzle/` off disk and work.

Two shapes of fix, neither chosen: embed the journal and the SQL as imported
strings so the bundle carries them, or ship `drizzle/` beside the binary and
resolve relative to `process.execPath`. The first makes the binary
self-contained and makes a migration a code change; the second keeps migrations
as data and makes the binary a two-file artefact.

Not urgent — nothing ships the binary — but `bun run build` currently exits 0
on something that cannot work, which is the shape CLAUDE.md warns about.

## Deliberately not being done

Here so nobody re-discovers them as gaps.

- **Bitemporality.** Record-time versus belief-time is real and unrepresentable,
  and no source obligation requires it. `Decision.decided_at` is record time.
- **An instant on `EvidenceUnit`.** Would let `whatWasKnown()` split `open` into
  worked-on and untouched. Nothing has needed it.
