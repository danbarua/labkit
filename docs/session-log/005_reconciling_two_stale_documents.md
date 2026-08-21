# 005: two stale documents, a false claim in the wrap hook, and a merge

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

## Verified

Documentation only until the merge; then a full run.

- `bun test` → **241 pass / 0 fail**, 32 files, after the merge.
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

**A fresh false claim while correcting a stale one** is the sharper lesson.
Checking `package-lock.json` and then writing the opposite, in one commit, is the
same failure as the documents being fixed: writing from the shape of what should
be true rather than from what was just observed.

## Next

**`labkit-minion` must reset onto the merge (`96a50a3`) before starting row F**,
or the branches re-diverge immediately — and re-seed its wrap state there, or
entry 006 will cover this session's commits too.

**Merge each row as it finishes, rather than letting branches drift.** Row T
merged with zero conflicts because it was taken immediately. The ledger and
`TASKS.md` are prose, and a conflict in them is one neither side can resolve
confidently.

This session takes `src/mcp/` — the last piece of PJ-023's next phase now the
CLI has shipped.
