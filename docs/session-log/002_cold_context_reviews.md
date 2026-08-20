# 002: Cold-context review of the S-3b close-out, and its open items filed

**Session wrap, 2026-08-19, on `spike/drizzle-age`.** Not a decision record —
see `docs/project-journal/016_the_standard_a_finding_is_held_to.md` for the
reasoning behind the row V change, and `017_cold_context_review.md` for the
review this session produced.

## Goal

Review the S-3b / row V work from cold context, read-only, before it is handed
on — then file what the review found so it survives the session.

## Changed

Three commits. The review itself was read-only; every commit below was made by
the user acting on it.

- `d34229d docs: add S-3b cold-context review and wrap entry` — filed the
  review as `docs/project-journal/017_cold_context_review.md` (+172,
  byte-identical to what the review produced) and committed the previous
  session's wrap, `docs/session-log/001_…` (+94).
- `6361c5e docs: wrap the cold-context review session` — this entry's first
  version.
- `b3d6f33 docs: file PJ-017's open items, and point CLAUDE.md at what it
  can't see` — closed all four of 017's items and fixed the discoverability
  gap that made them unreadable:
  - `CLAUDE.md` (+17/-7) — names 017 and its three live items; places
    `docs/session-log/`, including that the wrap hook's wiring lives in a
    gitignored `.claude/settings.json`, so a fresh clone gets the skill without
    the hook; and amends the nomination rule (below).
  - `docs/project-journal/008_user_story_mining.md` (+24) — row **K** gains its
    S-8 verdict (the row was **not probed**; story 18 remains its only unbuilt
    owner). Row **V**'s status becomes **`resolved (argued)`**, a new token,
    because PJ-016 disclosed that model (b) was closed by argument while the
    scannable column filed it identically to rows cleared by demonstration.
  - `docs/project-journal/013_…md` (+9) — a "Superseded in part" banner; all
    five of its improvement items were acted on and its §3.5 table is stale.

Working tree clean.

**One policy change, chosen rather than corrected.** 017 §3 offered two routes
for row X: author its discriminator next, or amend the nomination rule. The
amendment was taken — *a row whose severity is widened by the change that
cleared another row is nominated too, demonstrated or not*. Without it,
clearing one row can quietly make a second worse while the rule that would have
caught it stops applying, which is what S-3b did to X.

## Verified

`bun test`, `bun run typecheck` and `npx depcruise src tests --output-type err`
were run **at `77c7227`**, earlier in this session:

- `bun test` → **145 pass, 0 fail**, 471 expect() calls, 15 files. (Exit code
  ignored — it lies here.)
- `bun run typecheck` → clean, no output.
- `npx depcruise src tests --output-type err` → **0 errors**, 2 warnings, the
  pre-existing `no-orphans` on `src/index.ts` and `src/cli.ts`.

Carried forward to `b3d6f33` on an explicit check, not an assumption:
`git diff --name-only 77c7227..b3d6f33 -- src tests` returns **zero files**.
Everything since is `.claude/` and `docs/`. `bun run typecheck` re-run at
`b3d6f33`: clean.

`bun test` deliberately **not** re-run at the tip — another session is live in
this repo and the suite shares a PGlite temp directory. Docs-only changes, and
the zero-file check above is what licenses carrying the earlier result.

Also confirmed during the review, and worth keeping as the project's best
evidence artefact: S-3's row V assertion has flipped from
`expect(why.supported).toBe(true) // WRONG` to `toBe(false)` with
`unmet: [MEDIAN, SEED]` and `support` still populated — a defect pinned as a
failing expectation since S-3 and cleared by the scenario that fixed it.

Not run: `bun examples/full-lifecycle.ts` (unchanged since `1d4a9a0`, where
wrap 001 recorded it green), and nothing exercises the wrap shell scripts.

## Open

- **Row X is nominated and unbuilt.** The rule now says so, which was the point
  of the amendment, but nothing demonstrates it: a decisive failure disqualifies
  a *finding* permanently, not just work, and the sympathetic case is already
  written down — a check re-run correctly after a coding error in the check
  itself. No corpus scenario would settle it; S-3b is the precedent for
  authoring one.
- **Row V is `resolved (argued)`**, not demonstrated. Model (b) was closed by
  S-8's argument that `GATES` is fully occupied with control semantics. If a
  later scenario contradicts that, V reopens.
- **Row K was not probed by S-8** and now says so. S-7's exploratory default
  makes the value reachable through a research verb, so K's original line is
  testable rather than asserted, but nothing exercises a *transition* — whether
  standing is conferred by an act is exactly as open as before.
- **Only supporting analyses are qualified.** A challenging analysis whose own
  prespecified checks fail still reads as a live challenge. Named in the query
  comment and PJ-016; a null result whose robustness checks disagree would
  settle it.
- Five corpus scenarios remain unbuilt: S-2, S-9, S-10, S-13, S-14.

## Next

Pick the next scenario. Two defensible choices, and the ledger now says the
first is owed:

- **Author row X's discriminator** — a prespecified check that fails, is found
  to have been wrong in itself, is re-run correctly, and must not leave the
  finding disqualified forever. This is what the amended nomination rule points
  at.
- **S-13 from the corpus** — closure stability from the opposite direction to
  S-7, which was wrap 001's suggestion and remains untouched.

## Tooling note

**The Stop hook has now fired twice, and both branches that had never run for
real have run.** The first fire created this entry from a clean state; the
second correctly detected the existing entry and instructed update-in-place
rather than opening `003`, which is the convergence behaviour the skill is
built around. `collect.sh` resolved the baseline from the state file both
times rather than guessing. Wrap 001 listed the hook's live behaviour as its
one untested item; it is no longer untested.
