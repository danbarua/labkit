# 035: a namespace where green means fine

**Session wrap, 2026-08-25, on `chore/check-all`.** Not a decision record — the
reasoning is in PR #24 and in the scripts' own headers.

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
  derived from `package.json`. No exclusion list.
- `scripts/check-pglite-concurrency.{ts,sh}` → `probe-pglite-concurrency.{ts,sh}`,
  and `check:pglite-concurrency` → `probe:pglite-concurrency`. Its exit 0 means
  an upstream pglite-socket bug *still reproduces*; exit 1 is news, not failure.
- `CLAUDE.md` — the conditional list replaced by `bun run check`.

**`0f9394f` — every check script introduces itself.**

- `scripts/check-all-checks.ts` **new** (`bun run check:all-checks`) — enforces
  the header shape and exports `summaryOf()`, which `check-all.ts` calls to
  print each step's own sentence before running it. Scope is any script wired
  under `check`, `check:*` or `probe:*`.
- `scripts/check-migrations.ts` — a real header, replacing `// scripts/check-migrations.ts`
  as its first line.
- `scripts/smoke-cli.sh` — stray `#` removed; its sentence was a line low.
- `scripts/probe-pglite-concurrency.{ts,sh}` — reformatted from `//`-per-line to
  house style, with the inverted exit codes stated up front.
- `scripts/check-{stdout,no-tracked-symlinks}.sh` — "CI guard" dropped from both
  summaries. There is no CI.
- `CLAUDE.md` — the header convention, both languages, and why it is a function
  rather than a line number.

**`0ab2850`** is this entry.

Working tree clean.

## Verified

- `bun run check` — **all 13 pass, exit 0**; ~78s total, 66s of it `bun test`.
- **Watched to fail, twice.** A `console.log` in `src/cli/views/format.ts`
  reddens two of the steps, the sweep runs the rest, exits 1 naming both.
  `check:all-checks`, the moment it was written, named both offending files with
  the line, what was expected, what was there, and the shape for that language.
- `bun run typecheck`, `check:doc-comments`, `check:cli` — clean, and all inside
  the sweep above.

`probe:pglite-concurrency` not run — it is a probe, takes minutes, and its exit
code means the opposite of a check's.

## Open

**An exclusion list is a tell.** The first `check-all.ts` excluded
`check:pglite-concurrency` by name with a paragraph explaining why. The script
was fine; the *name* was wrong, because `check:` is a namespace where green
means fine and that was the one entry where it did not. Renaming it out of the
namespace deleted the exclusion rather than documenting it. Rule now in
CLAUDE.md: **`check:` means green is fine and red is yours to fix.**

**A line number is a fact that differs by language, and we got it wrong twice.**
The convention was specified as "print line 4", then corrected to "line 2".
Both are wrong for one of the two languages: TypeScript spends line 2 on the
`/**` opener so its sentence is line 3; shell has no opener so its sentence is
line 2. `check-all.ts` calls `summaryOf()`, exported by the linter that already
has to locate that line — one function, no arithmetic in two places.

**A formatter would not have caught any of this**, and the question came up.
Prettier would have formatted `// scripts/check-migrations.ts` forever;
"introduce yourself in one plain sentence" is semantic, not syntactic. Biome is
the 2026 answer if one is wanted — Rust, one binary, lint and format — but the
open question is whether a formatter should reflow comments that are argued
paragraphs. Not started.

**The sweep does not run everything.** `bun run example` and
`probe:pglite-concurrency` are outside it — the first is for reading, the
second's exit code is inverted. Neither absence is load-bearing today; a third
would need its own reason.

## Next

`docs/cli.md`, generated from `src/cli/program.ts`'s command surface, in the
shape of `docs/mcp-tools.md` — checked in because its diff is the useful part,
freshness asserted in a test that already builds the program rather than in a
`check:*` script. `scripts/render-tool-docs.ts` and `src/mcp/docs.ts` are the
pattern to copy. Cheap now that `buildProgram` needs no database.

Shell completions from the same surface are the other thing PR #23 named and did
not build. A formatter is a third, undecided.
