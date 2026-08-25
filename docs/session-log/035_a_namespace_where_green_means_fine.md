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

**`5c3e816` — `bun run check`.** `scripts/check-all.ts` runs `bun test`,
`typecheck`, `depcruise` and every `check:*`, output passed straight through,
keeps going after a failure, prints a table with timings. The list is derived
from `package.json`; no exclusion list.
`scripts/check-pglite-concurrency.{ts,sh}` → `probe-pglite-concurrency.{ts,sh}`,
`check:` → `probe:`.

**`0f9394f` — every check script introduces itself.**
`scripts/check-all-checks.ts` enforces the header shape and exports
`summaryOf()`, which `check-all.ts` calls to print each step's own sentence
before running it. Scope is any script wired under `check`, `check:*` or
`probe:*`. Fixed `check-migrations.ts` (no header at all), `smoke-cli.sh` (a
stray `#`), the probe (`//`-per-line), and "CI guard" in two summaries.

**`2a6c95a` — biome, and terser announcements.** `biome.jsonc`,
`bun run format` / `check:format`; **formatting only**, linter off pending a
read of its 96 errors and 376 warnings. 108 files reformatted. Every check now
says `OK:` / `FAILED:` and not its own name.

**`bae34e2` — surface coverage reads the AST.**
`tests/helpers/surface-coverage.ts` on the TypeScript compiler:
`publicVerbsOf` walks method declarations and reads `private`/`protected` off
the modifiers, `verbsReachedIn` becomes `verbsCalledOn(paths, receiver)`
matching the call as a node. Callers in `tests/mcp.test.ts` and
`tests/cli/coverage.test.ts` updated; comment-stripping dropped where the AST
made it unnecessary.

**`f080144` — `CLAUDE.md`, `docs/TASKS.md`, and this entry.** Line 216 said
"There is no lint script yet" in the pull request that adds one. And the larger
version of it: three findings that had been written into this entry's `## Open`
moved to CLAUDE.md, where a standing fact gets read — an exclusion list is a
tell, `\s` is not a character class in BSD `sed`, and the sweep's two
deliberate omissions. The linter triage went to `docs/TASKS.md`.

**`0ab2850`, `6845934`, `fa3b8d2`, `2957ae1` and this commit** are the entry.

Working tree clean.

## Verified

- `bun run check` — **all 14 pass, exit 0**.
- **Watched to fail, four times.** A `console.log` in `src/cli/views/format.ts`
  reddens two steps and the sweep runs the rest. `check:all-checks`, the moment
  it was written, named both offending files with the line, what was expected,
  and the shape for that language. Removing an `afterAll` reddens
  `check:test-teardown` by name. Stubbing out `read.gateStatus(…)` in a tool
  handler still reports `gateStatus` unreachable through the AST derivation.
- **Comment integrity measured, not assumed**: 108 files reformatted, **zero**
  comment-text lines changed, compared with leading whitespace stripped.
- **The AST derivation was measured against the regex it replaced**: 17 reads,
  18 writes, nothing gained or lost.

`probe:pglite-concurrency` not run — it is a probe, takes minutes, and its exit
code means the opposite of a check's.

## Open

**Biome's linter is unread** — 96 errors, 376 warnings, `linter.enabled: false`
in `biome.jsonc`. Not suppressed in bulk, because that loses the difference
between a real finding and a rule disagreeing with a deliberate choice.
`docs/TASKS.md` carries the work.

**`bun run build` still produces a binary that cannot migrate**, unchanged from
entry 034 and unrelated to this session. Also in `docs/TASKS.md`.

Nothing else. **What this session learnt went to CLAUDE.md, not here** — an
earlier draft of this entry used `## Open` as a place to write down findings,
which is the wrong home twice over: a session log is disposable and nobody
greps it for a rule, and CLAUDE.md is where a standing fact gets read. Moved
there this turn: *an exclusion list is a tell*, *`\s` is not a character class
in BSD sed*, and the reason the sweep deliberately does not run everything. The
biome and parser findings were already there.

Entries 033 and 034 have the same defect and are **not** being retro-edited —
dated records stay as written.

## Next

`docs/cli.md`, generated from `src/cli/program.ts`'s command surface, in the
shape of `docs/mcp-tools.md` — checked in because its diff is the useful part,
freshness asserted in a test that already builds the program rather than in a
`check:*` script. `scripts/render-tool-docs.ts` and `src/mcp/docs.ts` are the
pattern to copy.

Then the biome linter triage, and shell completions from the same command
surface.
