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

**`0ab2850`, `6845934`, `fa3b8d2`, and this commit** are the entry.

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

**An exclusion list is a tell.** `check-all.ts` first excluded
`check:pglite-concurrency` by name with a paragraph explaining why. The script
was fine; the *name* was wrong, because `check:` is a namespace where green
means fine and that was the one entry where it did not. Renaming it deleted the
exclusion rather than documenting it. Rule now in CLAUDE.md: **`check:` means
green is fine and red is yours to fix.**

**`biome.json` fails silently and `biome.jsonc` does not.** The JSON config
rejects comments, and `biome format --write` then falls back to its **defaults**
with no parse error — just "Formatted N files". It re-indented 121 files to tabs
at width 80 and touched `tsconfig.json`, `.dependency-cruiser.cjs` and drizzle's
generated snapshots, all of which the intended config excludes. `biome check`
does report the parse error; the writing command does not.

**A pattern spanning a token boundary needs a parser.** Biome split
`write.pursue({…})` across lines and `\bwrite\.pursue\s*\(` stopped matching —
five verbs reported unreachable that were reached fine. The first fix was a
whitespace-tolerant regex, which was a patch on the wrong layer:
`surface-coverage.ts` had already argued in its own header that *"the
declaration is the only place the distinction survives, so this reads it"*, and
then read it with a regex, while two `check:*` scripts in the same repo were
already on the compiler. The other text-reading checks were surveyed and left
alone — first-four-lines, comments-as-trivia, and plain substrings are all
genuinely textual. The rule is not *use the compiler everywhere*.

**`\s` is not supported by BSD `sed`.** The first comment-integrity comparison
used it, silently compared indented text, and "found" 38 differences that were
not there. `[[:space:]]` is the portable form.

**A line number is a fact that differs by language**, and the header convention
was specified as "line 4", then "line 2" — each wrong for one of the two.
`check-all.ts` calls `summaryOf()` rather than counting.

**The biome linter is unread.** 96 errors, 376 warnings. Some will be fine, some
will disagree with a deliberate choice here, and bulk-suppressing loses the
difference.

**The sweep does not run everything.** `bun run example` and
`probe:pglite-concurrency` are outside it, each for its own reason. A third
omission would need one too.

## Next

`docs/cli.md`, generated from `src/cli/program.ts`'s command surface, in the
shape of `docs/mcp-tools.md` — checked in because its diff is the useful part,
freshness asserted in a test that already builds the program rather than in a
`check:*` script. `scripts/render-tool-docs.ts` and `src/mcp/docs.ts` are the
pattern to copy.

Then the biome linter triage, and shell completions from the same command
surface.
