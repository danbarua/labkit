# 003: clearing ledger rows — S-3c (row X) and S-10 (row E)

**Session wrap, 2026-08-19, on `spike/drizzle-age`.** Not a decision record —
see `docs/project-journal/018_when_a_failed_check_stops_counting.md` (S-3c) and
`019_re_verification_is_not_reproduction.md` (S-10), and PJ-008 §3 rows E, P, X
and AB for the ledger.

Renamed twice — from `003_chatgpt_review_handoff.md` (`45ec5fa`), then from
`003_row_x_cleared_by_s3c.md`. The session kept outgrowing its title; the slug
is now generic so a third scenario would not need a third rename.

## Goal

Prepare an external-review handoff, act on the review that came back, then build
the scenarios that would move the ledger — row X's discriminator first, then the
only unbuilt corpus scenario that solely owned an open row.

## Changed

Thirteen commits: two scenarios built, two ledger rows cleared, one AGE bug
found, two journal entries written. +1,846 / −117 across 14 files.

- `d6a34c8` — another session's rewrite of `docs/session-log/002`. Input, not
  authored here.
- `45ec5fa`, `7e36b31`, `f6ca9cc` — this entry's earlier drafts.
- `d9e1180` — PJ-008 §3 made scannable: unbuilt owners marked `°`, the legend
  states the `open + owned` / `open + unowned` / `boundary` split, row X gains
  the **S-3c** brief from external review.
- `3023cb1`, `ced0388`, `b0ed208`, `a20b9a1` — **S-3c**: predictions, build, the
  AGE fix, then PJ-018 and the ledger.
- `e1665bf`, `dd5c683`, `3b12e61` — **S-10**: predictions, build, the ledger.
- `29a58ab` — PJ-019, and CLAUDE.md brought up to date.

Source: `src/domain/session.ts` (+237), `src/domain/report.ts` (+90),
`src/db/domain.ts` (+25, the `REVERIFIES` edge), `src/db/agtype.ts` (+14, the
column-name guard). Two scenario files, ~594 lines.

Tree is clean.

## Verified

Run at `29a58ab` (`src/` unchanged since `dd5c683`; the last two commits are
docs):

- `bun test` — **159 pass, 0 fail**, 513 expect() calls, 17 files. Was 145/15 at
  session start. (Exit code ignored, per CLAUDE.md.)
- `bun run typecheck` — clean.
- `npx depcruise src tests --output-type err` — **0 errors**, 2 `no-orphans`
  warnings on the empty CLI stubs. 49 modules, 128 dependencies.
- `bun examples/full-lifecycle.ts` — ends `closed connection cleanly`, no raw
  graphids.

**Both builds were deletion-verified**, and S-3c in both directions — removing
the rule fails exactly the three defective-check assertions, while *widening* it
to "the last verdict wins" fails S-3's own two tests. That second check is what
distinguishes a narrowing from a removal, and is worth repeating if either is
revisited.

**The AGE finding was measured, not reasoned.** Six `OPTIONAL MATCH` shapes
probed directly against pglite-age; all six bind. The failing shape is a
camelCase `RETURN` name, which returns the column present and `NULL` for every
row.

**Two stale CLAUDE.md claims were found by checking rather than assuming**, and
neither was about this session's scenarios: `CHALLENGES` was cited as the
never-walked edge (S-4 and S-5 walk it; `DEFERS` is the accurate example, and a
sharper one — read by `enquiryStatus()`, written by nothing, so `closure:
"deferred"` is unreachable), and the act→product heuristic said two instances
when there are four.

## Open

**Three mistakes made this session, all fixed, all worth knowing:**

1. *A wrong diagnosis committed as fact.* `ced0388` shipped a docstring
   asserting AGE cannot bind a two-hop `OPTIONAL MATCH`, with a query
   restructured around it. The real cause was the camelCase column name; the
   same file's other query disproved the general claim. Corrected in `b0ed208`,
   which refuses such names at the seam — and on its first run that guard found
   a live pre-existing instance, `enquiryStatus()`'s `forClaim` column, decoding
   as null since it was written.
2. *An unqualified string replace in `d9e1180`* rewrote a **shared** blockquote,
   making rows O, T, Z and AA all claim S-3c owned them. Restored in `a20b9a1`
   and diffed against the pre-edit file. Several PJ-008 rows share verbatim
   text — scope any replace to the row's own section.
3. *Two predictions in each scenario were wrong*, which is the method working
   rather than a defect, but the S-10 pair are worth carrying: row P was
   predicted to fire and did not, and the "compare numerically" bullet was
   predicted as a refusing verb and landed as report fields.

**Genuinely open, not fixed:**

- **Who may declare a check defective** (S-3c). "The check was defective" is now
  a lever that clears a failure. It requires a recorded `Review` and a
  replacement analysis, so there is an audit trail; whether that suffices is an
  authority question, and there is no actor model by decision.
- **The authored-versus-mined precedent.** S-3c is the second authored scenario.
  S-10 being mined takes some pressure off, but PJ-016's argument is
  load-bearing twice.
- **The noun inventory has not moved in twelve scenarios.** Four consecutive
  scenarios have pressed only on relationships and query semantics. PJ-018 and
  PJ-019 both close on this and neither can answer it.
- **Ledger:** no row is a live defect shipping green. `open` + unowned: O, S, T,
  Z. `open` with an unbuilt owner: F, J, K, P.

## Next

**S-9, "the artefact survived; its provenance didn't."** It solely owns rows F
and P, and P's cell now says explicitly that S-9 is the scenario that has to
produce that wrong answer or leave the row where it is — S-10 was predicted to
fire P and did not.

Open `docs/project-journal/008_user_story_mining.md` at `### S-9 —`. Its stated
expressibility route is content-hash equality plus an open question, and it
deliberately does not ask for a recovered-artefact type: if the general entities
cannot carry it, that is the finding. Commit predictions before building, as
`3023cb1` and `e1665bf` did — that discipline is why this session's four wrong
predictions are legible rather than invisible.

PJ-019 flags one thing to watch there: nothing yet distinguishes "re-verify a
finding" from "re-run an analysis wholesale", and S-9 regenerating an artefact
is close to that question.

Remaining corpus after S-9: S-2, S-13, S-14.
