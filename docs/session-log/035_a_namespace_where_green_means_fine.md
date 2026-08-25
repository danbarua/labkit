# 035: a namespace where green means fine

**Session wrap, 2026-08-25, on `chore/check-all`.** Not a decision record — the
rename's reasoning is in PR #24 and in `scripts/check-all.ts`'s header.

Range is exactly this session: baseline `049be9a`, the merge of PR #23, closed
with `close-entry.sh` before this work began.

## Goal

Give the pre-commit bar a single command, because `bun run` does not glob and
the bar was a list of conditionals held in a person's head.

## Changed

Open as **PR #24**.

**`5c3e816` — `bun run check`.**

- `scripts/check-all.ts` **new** — runs `bun test`, `typecheck`, `depcruise`
  and every `check:*`, output passed straight through, keeps going after a
  failure, prints a table with timings, exits 1 if any failed. The list is
  derived from `package.json`, so a `check:*` added later is picked up without
  editing this file. No exclusion list.
- `scripts/check-pglite-concurrency.{ts,sh}` → `probe-pglite-concurrency.{ts,sh}`,
  and `check:pglite-concurrency` → `probe:pglite-concurrency`. Its exit 0 means
  an upstream pglite-socket bug *still reproduces*; exit 1 is news, not failure.
- `CLAUDE.md` — the conditional list replaced by `bun run check`, plus the rule
  the rename leaves behind.
- `package.json`, `.claude/skills/postgres-age/SKILL.md` — the two names.

Working tree clean.

## Verified

- `bun run check` — **all 12 pass, exit 0**; `bun test` 61.5s of the ~72s total.
- **Watched to fail**: a `console.log` added to `src/cli/views/format.ts`
  reddens two of the twelve (`check:stdout` directly, `check:cli` because the
  stray line breaks the smoke test's handle parsing), the sweep runs the
  remaining ten anyway, and it exits 1 naming both.
- `bun run typecheck`, `check:doc-comments` — clean, and both are inside the
  sweep above.

`probe:pglite-concurrency` not run — it is a probe, takes minutes, and its exit
code means the opposite of a check's.

## Open

**An exclusion list is a tell.** The first version of `check-all.ts` excluded
`check:pglite-concurrency` by name with a paragraph explaining why. The script
was fine; the *name* was wrong, because `check:` is a namespace where green
means fine and that was the one entry where it did not. Renaming it out of the
namespace deleted the exclusion rather than documenting it.

The rule that falls out, now in CLAUDE.md: **`check:` means green is fine and
red is yours to fix. Anything else needs a different prefix.**

**The sweep does not run everything.** `bun run example` and
`probe:pglite-concurrency` are outside it — the first because it is for reading
rather than checking, the second because its exit code is inverted. Neither
absence is load-bearing today; both would be if a third thing joined them
without a reason.

## Next

`docs/cli.md`, generated from `src/cli/program.ts`'s command surface, in the
shape of `docs/mcp-tools.md` — checked in because its diff is the useful part,
freshness asserted in a test that already builds the program rather than in a
`check:*` script. `scripts/render-tool-docs.ts` and `src/mcp/docs.ts` are the
pattern to copy. Cheap now that `buildProgram` needs no database.

Shell completions from the same surface are the other thing PR #23 named and
did not build.
