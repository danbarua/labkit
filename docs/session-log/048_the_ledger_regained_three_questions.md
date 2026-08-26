# 048: the ledger regained three questions

**Session wrap, 2026-08-26, on `docs/ledger-owners`.** Not a decision record —
the rows argue themselves in PJ-008 §3.

`#37` and `#38` both merged. **This file was lost in #38's squash** and is
restored here from `5360287`; it was pushed to that branch shortly before the
merge and did not make it in. Both are one unit: the domain ledger, prompted by
a review session Dan asked to eyeball PJ-008.

## Goal

Dan's recollection — *"I could swear we found some domain ambiguities while
building out the CLI."* He had. They were written down in the one place nobody
greps.

## Changed

**`dbdcbca` (#37) — three questions that were tracked nowhere.**

- `docs/project-journal/008_user_story_mining.md` — rows **AH**, **AI**, **AJ**
  added `open, unowned`, with their own section. Three stale-machinery defects
  in §3's legend fixed: a deleted `check:ledger` still cited as what counts a
  status, an instruction to update a deleted column, and six vestigial `°`
  markers on scenarios never built.

**`090bbaf` (#38) — owners for AI and AJ, and the one that keeps none.**

- Same file — **AI ← story 16**, **AJ ← story 15**, both `open` with `°`; AH
  stays unowned; both refutation conditions written before either is built.

## Verified

Everything the review reported was re-checked here before acting, and two things
came back different.

- `check:ledger` absent from `package.json` and `scripts/`, cited twice in
  PJ-008. The "Rows-today column" instruction present, the column absent. No
  `s2_`/`s13_` under `tests/scenarios/`. Statuses before the change: 24
  resolved, 5 refuted, 3 boundary, 1 resolved (argued) — 33 rows, none open.
- **`Claim.kind` appears five times in PJ-008**, where the review said none of
  the three appeared at all. Its conclusion survived — none of the five is the
  *value conflates two facts* question — but by reading rather than by the
  string count the report claimed. The reviewer accepted this without
  qualification.
- **AJ's predicted wrong answer does not exist.** The review expected
  `recordAnalysis()` to refuse a reference's analysis after a withdrawal against
  a candidate; the guard calls `withdrawalOf({ proposition, enquiry })`, scoped
  after S-5 found that exact defect, with a comment at the call site naming the
  case. That narrowed the row rather than sinking it: what bites is coexistence
  *within one enquiry*, and the scoping is now recorded as the row's best
  existing evidence — the pair is already the unit a write is checked against.
- `bun run check` all 17 pass. Ledger after: 2 open with owners, 1 open and
  unowned, none `demonstrated`.

## Open

**The ledger says "three unowned" where it said "nothing open", and that is the
point.** Truer than the tidy version. None is `demonstrated`, so CLAUDE.md's
one-wrong-answer-at-a-time rule stays un-engaged.

**AH has no owner and should keep none until a report asks for the
distinction.** Story 18 is the tempting fit and is already built as S-18, with
row K as its verdict. Naming a bad owner converts "we are still looking" into
"this is covered" — the state row K sat in through three external reviews.

**Neither owner is built, and an owner being built is not an owner answering.**
Row K's was built and returned no verdict. Both refutation conditions are
therefore written down in advance: AI fails to settle if the distinction lives
entirely in criteria; AJ fails if candidate and reference turn out to be
different propositions, which the scoping above makes *more* likely than the
review assumed.

**The mechanism that lost these is worth more than the rows.** Each was stated
once and carried forward from wrap entry to wrap entry, which feels like
tracking and is closer to laundering — every restatement sits in a document the
next reader will not open. Entry 035 diagnosed exactly this about itself and
moved the CLAUDE.md-shaped findings; the ledger-shaped ones stayed put for five
entries.

## Next

PR #38 awaits review.

Then `docs/TASKS.md`, whose documents group still holds the CLAUDE.md
stale-prose sweep — now with the pinned header as its standard — and
`docs/persistence-spikes.md` becoming `docs/persistence.md`.
