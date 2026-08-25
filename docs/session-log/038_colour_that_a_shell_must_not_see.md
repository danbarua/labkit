# 038: colour that a shell must not see

**Session wrap, 2026-08-25, on `feat/cli-colour`.** Not a decision record — the
palette's naming and the library choice are argued in `src/cli/palette.ts` and
PR #27.

Range is exactly this session: baseline `2675b2c`, the merge of PR #26, closed
with `close-entry.sh` before this work began.

## Goal

Task 1 from `docs/TASKS.md`: colour the CLI so its output is not a wall of white
text.

## Changed

One commit, open as **PR #27**.

**`81a6fd0` — colour, on picocolors.**

- `src/cli/palette.ts` **new** — `Palette`, `PLAIN`, `palette(enabled)`. Members
  named for the record's distinctions, not for colours.
- `src/cli/output.ts` — `View<T>` takes a `Palette`; `Answer.render(palette)`.
  `asJson` and `asHandles` deliberately never colour.
- `src/cli/session.ts` — `coloursFor()`, resolving once at the root from
  picocolors' `isColorSupported` and `--no-ansi`.
- `src/cli/program.ts` — the `--no-ansi` flag.
- `src/cli/views/*` — all eighteen renderers take and use the palette.
- `src/cli/commands/{reads,writes}.ts` — the view arrows thread it through.
- `tests/cli/views.test.ts` — thirteen existing assertions now pass `PLAIN`
  explicitly; six new tests render both ways and compare.
- `docs/TASKS.md` — Task 1 deleted, the binary renumbered to 1.
- `CLAUDE.md`, `package.json`, `bun.lock`.

**`32f0ca9` — the example forces colour.** `bun run example` was still a wall of
white: it captures each command with `$( )`, so the CLI saw a pipe and correctly
turned colour off. `FORCE_COLOR=1` in `lab()`, which is safe **only** because a
handle-only answer is never coloured even when forced — so a write verb's
`$LAST` is still a bare id the next command can consume while a read's carries
the colour. `scripts/smoke-cli.sh` deliberately unchanged: it asserts on
substrings of the same output, and checking versus showing is why the two were
split.

**`b86918d`** and this commit are the entry.

Working tree clean.

## Verified

- `bun run check` — **all 15 pass, exit 0**.
- **Driven in a terminal**, which is where the defects were: `FORCE_COLOR=1 …
  gate` colours; piping strips; `--no-ansi` overrides a forced colour; and
  `X=$(FORCE_COLOR=1 labkit criterion 'x')` captures a bare handle.
- **The library was picked by measurement**, one run per cell: under Bun 1.3.14
  `node:util`'s `styleText` and `ansis` both write escapes into a pipe;
  picocolors does not. picocolors also survives `bun build --compile`, checked
  rather than assumed.
- `bun run example` — exit 0, and **53 escape sequences in a transcript that had
  none**. Both properties confirmed in the same run: `LOE_1`, `CRIT_1`, `COMP_1`
  and `CLM_1` appear as bare lines, and `labkit gate` shows `never-evaluated`
  dim, `satisfied` green, handles cyan.

## Open

**Nothing from this work.** Task 1 is closed and `docs/TASKS.md` is down to one
item: the compiled binary that cannot migrate.

One thing worth a reader's attention rather than an action: the CLI shipped
correct and the *example* was wrong, and neither `bun run check` nor any test
would ever have said so. A transcript being white is not a failing assertion.

## Next

`docs/TASKS.md` Task 1 — the compiled binary that cannot migrate. Two shapes of
fix are written there, neither chosen.

Still unbuilt and named in earlier entries: `docs/cli.md` generated from
`src/cli/program.ts`'s command surface, in the shape of `docs/mcp-tools.md`
(`scripts/render-tool-docs.ts` and `src/mcp/docs.ts` are the pattern), and shell
completions from the same surface.

PR #27 awaits review.
