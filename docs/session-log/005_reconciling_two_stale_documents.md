# 005: two stale documents, a false claim in the wrap hook, and row F closed

**Session wrap, 2026-08-21, on `feat/domain-consumer`.** Not a decision record —
see `docs/project-journal/` for the reasoning behind anything below.

**The range is wider than this entry.** Two of its three commits amend entry
`004` rather than adding work; `004` covers what they correct. This entry exists
because `close-entry.sh` (`b71b2be`) closed `004` first, which is the whole point
of having it.

## Goal

Fix `docs/session-log/004` and `docs/TASKS.md`, both of which Dan found stale in
one reading — listing questions this session had already settled hours earlier.

## Changed

```
docs/TASKS.md                                   | 87 ++++++++++--------
docs/session-log/004_config_cruft_and_consumer_brief.md | 24 ++++-
```

- `53eead1` — 004's "waiting on a decision" still listed the SVG question, which
  was answered by deleting the SVG.
- `4ec6325` — the fix above introduced a **fresh false claim in the same
  breath**, asserting `package-lock.json` was gone from `main` while the
  `git ls-tree` output printed moments earlier said otherwise. Corrected.
- `7855f7b` — TASKS.md: six stale items, each verified against the ledger or the
  working tree rather than recalled. Row **T** was listed `open` and described as
  `refuted` in the same section. Row **F**'s cell predated both its bites. "Two
  rows unowned" was one. The CLI was listed unbuilt. The SVG decision was listed
  pending. Setup told a new clone to configure `.githooks` and install graphviz —
  neither exists any more.

## Also changed, after the entry was first written

- `a637e3f` — **`wrap-hook.sh` claimed the session id always survives.** True for
  compaction, tested both triggers; never tested for forks. `labkit-minion`
  demonstrated a fork of `be5374e7` coming up as `74f9b207` with its own
  transcript directory, so the branch the comment called unreachable insurance
  covers a case that exists. It still would not have helped there: the fork ran
  in a different **worktree**, `.claude/.wrap-state/` is untracked, SessionStart
  never fired, and the failure is silent — no baseline means self-baseline at
  HEAD and `exit 0`, swallowing the first fire *and* landing the baseline after
  the work it should cover. SKILL.md gains the seeding recipe.
- `96a50a3` — **merged `feat/minion`**: row F's third reporting bite (S-9d,
  `restingOn` deduplicating by name) and row T **refuted, four for four**
  (S-10b). Merged while the branches shared **zero** changed files, precisely
  because that would not last — both touch the ledger and `TASKS.md` next.

- `c27df4c` — **never suggest `git reset --hard` to another session.** Told
  `labkit-minion` to reset onto the merge so it would not re-diverge; it had
  **five uncommitted files** at that moment, including a fix and a predictions
  document, and the command would have destroyed them silently. It checked
  instead of complying and rebased. `rebase` reaches the same place and refuses
  on a dirty tree — the property that matters across a boundary you cannot see
  through. Recorded in CLAUDE.md with the general form: a parallel session's
  **worktree** state is invisible to you in a way its branch state is not.

- `b482675` — **merged row F's verdict: `boundary`.** `labkit-minion` found a
  fourth reporting bite (`reproductionOf().differs`, deciding by `natural_id`
  and reporting bare `logical_name`) and then closed the row by argument rather
  than tally: artefacts **do** have identity, the reads were not using it, and
  every one of the four fixes carried identity that already existed. A
  version-of relationship would have fixed none of them, so the bites are
  evidence *against* the row. The enumeration is what makes it a verdict —
  every read touching an artefact takes a reference, refuses an ambiguous name,
  or returns identity, and `s10c` asserts that instead of leaving it as prose.

  **Row F was the only candidate in this project's history that would have
  required a first new noun. It did not.** Node labels stay at thirteen.

  Reopening condition recorded rather than papered over: *"show me the history
  of this control series"* — versions as an ordered sequence, asked of a name.
  No verb asks it, and under §5 a question never asked earns nothing.

## Verified

Documentation only until the merge; then full runs.

- `bun test` → **244 pass / 0 fail**, 33 files, after the second merge.
  **The flake at its worst was observed and correctly diagnosed by the fork
  before I saw it**: run 1 of 2 gave 10 failures on an identical tree, run 2
  gave none. Not a regression — the only changes were markdown, checked with
  `git diff --name-only` rather than assumed.
- `bun run check:ledger` → clean, and it is what the row-status claims were
  checked against rather than memory.
- `bun run check:doc-comments` → clean. `npx depcruise` → 0 errors.
- Row statuses read directly from §3: O `resolved`, S `refuted`, T `refuted`,
  AD `resolved`, AE `resolved`, F `open`.
- `.githooks/` and `docs/dependency-graph.svg` confirmed absent before rewriting
  the setup section.

## Open

**Why neither document was going to self-correct.** Both were updated when work
finished and never re-read against the world. `check:ledger` holds the ledger's
two copies to each other and **deliberately** does not read prose, for the same
reason CLAUDE.md's narrative claims are not machine-checked — a checker over
prose would be wrong more often than the prose is.

So the only thing that catches this is a person reading it, which is what
happened. That is not a gap to close with tooling; it is the cost of keeping
narrative documents, and worth stating rather than pretending a script could
have caught it.

`close-entry.sh` addresses the *session log* half structurally: an entry closed
when its work finishes retires its open questions with it, instead of carrying
them into work they no longer belong to. `004` reached 1,165 lines over 115
commits and a dozen unrelated pieces of work before that existed. TASKS.md has no
equivalent and probably should not — it is a live queue, not a record.

**A guard stated in prose beside code that does not honour it** — three
instances found today, in three unrelated places, and this session wrote one of
them:

- `reproducibilityOf()` argued for reference-keying *in a comment*, then
  reported bare names (S-9c).
- `wrap-hook.sh`'s comment called a branch unreachable insurance; a fork
  reaches it (`a637e3f`).
- S-10's own test described *"Identical names, two artefacts, two differences"*
  and then asserted the collapsed behaviour as correct — eleven scenarios ago,
  found by `labkit-minion` while closing row F.

A method finding rather than a domain one, like PJ-025 and PJ-026. **Not
written up** — it constrains how this project writes, so it is Dan's to
commission.

**A fresh false claim while correcting a stale one** is the sharper lesson.
Checking `package-lock.json` and then writing the opposite, in one commit, is the
same failure as the documents being fixed: writing from the shape of what should
be true rather than from what was just observed.

## Next

**A two-point diff read as a change set, and it nearly cost a false accusation.**
`git diff b482675..feat/minion` showed my own `005` sections as removals, and I
read that as the fork having deleted them. It is a diff between two divergent
tips, not a record of what changed — `b482675` was never an ancestor of that
branch, so the "removals" were simply commits it did not have. Caught with
`merge-base --is-ancestor` before saying anything. Same shape as the other
mistakes today: a command answered a question I had not asked, and the answer
looked like a fact.

**Ledger after this session:** F `boundary`, T `refuted`, S `refuted`,
O/AD/AE `resolved`, **AF `open` and unowned** — the only row wanting a
discriminator, and its own cell says it earns nothing under §5. There may be
nothing worth pointing a session at.

**Merge each row as it finishes, rather than letting branches drift.** Row T
merged with zero conflicts because it was taken immediately. The ledger and
`TASKS.md` are prose, and a conflict in them is one neither side can resolve
confidently.

This session takes `src/mcp/` — the last piece of PJ-023's next phase now the
CLI has shipped.
