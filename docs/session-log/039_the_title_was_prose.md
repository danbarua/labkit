# 039: the title was prose

**Session wrap, 2026-08-25, on `fix/example-title`.** Not a decision record —
one nitpick, fixed.

Range is exactly this session: baseline `1eb60c5`, the merge of PR #27, closed
with `close-entry.sh` when that merged.

## Goal

The example transcript's own title was styled as prose while every section
heading under it was styled as a heading.

## Changed

One commit, open as **PR #28**.

**`0761a9c`** — `examples/full-lifecycle.sh`. `LabKit, by worked example` and
its `=====` rule move out of the prose heredoc into two `printf`s using the
heading colours. Six lines added, two removed.

Working tree clean.

## Verified

- `bun run example` — exit 0; the title renders `1;35` over a `35` rule where it
  was `96` over `96`.
- `NO_COLOR=1 bun run example` — exit 0, zero escape sequences.
- `bun run check` — all 15 pass.

## Open

Nothing. `docs/TASKS.md` has one item: the compiled binary that cannot migrate.

## Next

`docs/TASKS.md` Task 1 — the compiled binary that cannot migrate.
`runMigrations()` resolves `drizzle/` from `import.meta.url`, which inside a
`bun build --compile` bundle is `/$bunfs/root/…`. Two shapes of fix are written
there, neither chosen.

Still unbuilt and named in entries 034-038: `docs/cli.md` generated from
`src/cli/program.ts`'s command surface in the shape of `docs/mcp-tools.md`
(`scripts/render-tool-docs.ts` and `src/mcp/docs.ts` are the pattern), and shell
completions from the same surface.

PR #28 awaits review.
