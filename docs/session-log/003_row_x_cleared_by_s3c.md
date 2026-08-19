# 003: row X cleared by S-3c, and a silent AGE decode bug

**Session wrap, 2026-08-19, on `spike/drizzle-age`.** Not a decision record —
see `docs/project-journal/018_when_a_failed_check_stops_counting.md` for the
reasoning, and PJ-008 §3 rows X and AB for the ledger.

Renamed from `003_chatgpt_review_handoff.md` (`45ec5fa`): the session began as a
review handoff and became the S-3c build, and a cold reader should not be sent
past the wrong title.

## Goal

Prepare an external-review handoff, act on the review that came back, then build
the discriminator the reviewer and PJ-017 both nominated: row X.

## Changed

Seven commits. The first three are records, the last three are the build.

- `d6a34c8` — another session's rewrite of `docs/session-log/002`. Read as input,
  not authored here.
- `45ec5fa` — this entry's first draft.
- `d9e1180` — PJ-008 §3 made scannable: unbuilt owners marked `°`, the legend
  states the `open + owned` / `open + unowned` / `boundary` split, and row X
  gains the **S-3c** brief supplied by external review.
- `3023cb1` — S-3c predictions, committed before a line of test or source.
- `ced0388` — the scenario and the narrowing. `src/domain/session.ts`,
  `src/domain/report.ts`, and a new
  `tests/scenarios/s3c_defective_check_repaired.test.ts` (340 lines, 5 tests).
- `b0ed208` — `buildAsClause()` refuses camelCase column names; the dead
  `forClaim` column removed from `enquiryStatus()`; `tests/agtype.test.ts` gains
  three guard tests.
- `a20b9a1` — PJ-018, plus PJ-008's row X verdict and row AB's fourth instance,
  plus CLAUDE.md.

The handoff itself is `/tmp/claude-501/chatgpt-handoff.md`, deliberately outside
version control — a message to a reviewer, not a project record. It is stale as
of `ced0388` (it describes S-3c as unbuilt) and was left that way on purpose:
the review round it belonged to is closed.

Tree is clean.

## Verified

Run at `a20b9a1`, not carried forward:

- `bun test` — **153 pass, 0 fail**, 497 expect() calls, 16 files, 45.5s. Was
  145/15 at session start. (Exit code ignored, per CLAUDE.md.)
- `bun run typecheck` — clean, no output.
- `npx depcruise src tests --output-type err` — **0 errors**, 2 `no-orphans`
  warnings on the empty CLI stubs. 48 modules, 125 dependencies.
- `bun examples/full-lifecycle.ts` — ends `closed connection cleanly`, no raw
  graphids.

**The narrowing was verified in both directions**, which is the part worth
repeating if this is ever revisited. Removing the filter fails exactly the three
defective-check assertions. Widening it to "the last verdict wins" fails S-3's
own two tests alongside S-3c's case 1 — the check that proves this narrowed the
rule rather than removing it.

**The AGE finding was measured, not reasoned.** Six `OPTIONAL MATCH` shapes were
probed directly against pglite-age — multi-hop, and extending an
optionally-bound variable — and all six bind. The failing shape is a camelCase
`RETURN` name, which returns the column present and `NULL` for every row.

## Open

**Two mistakes I made this session, both now fixed, both worth knowing about.**

1. *A wrong diagnosis committed as fact.* `ced0388` shipped a docstring asserting
   AGE cannot bind a two-hop `OPTIONAL MATCH`, and a query restructured around
   that. The real cause was the camelCase column name. Corrected in `b0ed208`;
   the general claim was false and the same file's other query disproved it.
2. *An unqualified string replace in `d9e1180`* rewrote a **shared** blockquote,
   making rows O, T, Z and AA all claim S-3c owned them. Restored in `a20b9a1`
   and diffed against the pre-edit file; only row X carries the new note. When
   editing PJ-008's row narratives, note that several rows share verbatim text —
   match within the row's own section, not across the file.

**Genuinely open, not fixed:**

- **Who may declare a check defective.** The narrowing makes "the check was
  defective" a lever that clears an inconvenient failure. It requires a recorded
  `Review` and a replacement analysis, so there is an audit trail; whether that
  is sufficient is an authority question, and there is no actor model by
  decision. Recorded in PJ-018, deferred with the identity work.
- **The authored-versus-mined precedent.** S-3c is the second authored scenario.
  Two is a pattern, not an exception, and PJ-016's argument for the first was
  already the most contested decision in the arc.
- **Ledger state:** no row is a live defect shipping green. `open` + unowned:
  O, S, T, Z. `open` with an unbuilt owner: E, F, J, K, P.

## Next

No row is nominated, so the next build is a corpus scenario. Five remain: S-2,
S-9, S-10, S-13, S-14.

**S-13 is the standing suggestion** — external review put it second behind row X
and row X is now closed. Open `docs/project-journal/008_user_story_mining.md` at
`### S-13 — A follow-up question must not widen a finished study`, and note it
carries rows C, D, G and Q, all four already `resolved`, so it is a regression
probe as much as a discovery one.

Worth weighing against it: **S-9 or S-10 own rows E, F and P, which are `open`
and unbuilt** — the only open rows a corpus scenario would actually settle. If
the aim is to move the ledger rather than confirm it, those come first.
