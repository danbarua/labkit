# 002: Cold-context review of the S-3b close-out, and the first live Stop-hook fire

**Session wrap, 2026-08-19, on `spike/drizzle-age`.** Not a decision record —
see `docs/project-journal/016_the_standard_a_finding_is_held_to.md` for the
reasoning behind the row V change, and `017_cold_context_review.md` for the
review this session produced.

## Goal

Review the S-3b / row V work from cold context, read-only, before it is handed
on. No source was to be modified, and none was.

## Changed

One commit, `d34229d docs: add S-3b cold-context review and wrap entry`, made
by the user rather than by this session:

- `docs/project-journal/017_cold_context_review.md` (+172) — the review this
  session wrote, filed byte-identical from `/tmp`.
- `docs/session-log/001_row_v_cleared_and_wrap_tooling.md` (+94) — the previous
  session's wrap, committed alongside it.

Working tree clean. This session made no commits and edited no tracked file
before this entry.

## Verified

`bun test`, `bun run typecheck` and `npx depcruise src tests --output-type err`
were run **at `77c7227`**, earlier in this session:

- `bun test` → **145 pass, 0 fail**, 471 expect() calls, 15 files. (Exit code
  ignored — it lies here.)
- `bun run typecheck` → clean, no output.
- `npx depcruise src tests --output-type err` → **0 errors**, 2 warnings, the
  pre-existing `no-orphans` on `src/index.ts` and `src/cli.ts`.

Carried forward to `d34229d` on an explicit check, not an assumption:
`git diff --name-only 77c7227..d34229d -- src tests` returns **zero files**.
Everything since is `.claude/skills/wrap/` and `docs/`.

Also verified as part of the review, and worth keeping because it is the
project's best evidence artefact: S-3's row V assertion has flipped from
`expect(why.supported).toBe(true) // WRONG` to `toBe(false)` with
`unmet: [MEDIAN, SEED]` and `support` still populated — a defect pinned as a
failing expectation since S-3 and cleared by the scenario that fixed it.

Not run: `bun examples/full-lifecycle.ts` (unchanged since `1d4a9a0`, where
wrap 001 recorded it green), and nothing exercises the wrap shell scripts.

## Open

- **PJ-017 is filed but not discoverable.** CLAUDE.md's journal paragraph stops
  at 016 and still describes 013 as the external review "whose improvement list
  is what 014/015 address". A cold agent following its own newest-first
  instruction will never learn 017 exists. `docs/session-log/` is likewise
  unmentioned. This is the same failure shape 017 §4 documents — row V was
  picked up because it was written into CLAUDE.md; row K was not because it
  lived only in a chat message.
- The three live items inside 017: a distinct status token for ledger rows
  cleared by **argument** rather than demonstration (row V reads `resolved`
  identically to the rest); a nomination for **row X**, whose severity S-3b
  widened and which the deferral rule will not nominate on its own; and **row
  K**'s missing S-8 verdict, which is what decides whether §4's story-18
  promotion trigger has fired.
- **PJ-013 has no status banner** though its §3.5 table and §3.6 flag are both
  superseded. PJ-015 and PJ-016 both demonstrate the idiom.
- Wrap 001's **Next** points at S-13; 017 §3 argues **row X** is the better
  target. Not a contradiction — X is unowned, S-13 is corpus — but the two
  documents point different directions and only one of them is discoverable.

## Next

Close the discoverability gap first, since everything above depends on it —
append to CLAUDE.md's journal paragraph:

> 017 is a second external review, of S-3b and the row V close-out; its open
> items are a status token for rows cleared by argument, a nomination for row X,
> and row K's missing S-8 verdict.

and a line placing `docs/session-log/` as disposable per-session handovers,
pointing at its README. Then pick the next scenario — S-13 from the corpus, or
author row X's discriminator on the S-3b precedent.

## Tooling note

**The Stop hook fired for real for the first time**, which wrap 001 listed as
its one untested branch ("hooks load at session start, so the wiring added this
session could not take effect in it"). It fired once, correctly identified one
un-wrapped commit, and passed a valid state path. `collect.sh` resolved the
baseline from the state file rather than guessing, and reported `none yet` for
this session's entry. The branch that could not be tested by construction now
has been.
