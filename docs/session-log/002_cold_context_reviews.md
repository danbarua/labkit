# 002: Two cold-context reviews, and the wrap tooling they broke

**Session wrap, 2026-08-20, on `spike/drizzle-age`.** Not a decision record —
see `docs/project-journal/016_…md` for the row V change, and `017_…md` and
`024_…md` for the two reviews this session produced. Renamed from
`002_cold_context_review_of_s3b.md` once the session outgrew that title.

**Scope warning, because the numbers mislead.** This session's baseline is
pinned at `94d3d80` and HEAD is now `e386027` — 51 commits. Five are this
session's. The other 46 belong to `003_clearing_ledger_rows.md` (S-3c, S-10,
S-9, S-14, S-18 and two external reviews), which ran between this session's two
halves. Read 003 for that work; this entry does not restate it. `collect.sh`
now prints this warning by itself — see the tooling note.

## Goal

Review the domain-discovery arc from cold context, read-only, at two points:
after the S-3b / row V close-out, and again after the corpus was declared
exhausted. Then fix the wrap tooling that the second review's own session had
exposed.

## Changed

Five commits. The reviews modified nothing; `d34229d` and `b3d6f33` were the
user acting on the first review, the last three are this session's.

- `d34229d` — filed the first review as
  `docs/project-journal/017_cold_context_review.md` (+172, byte-identical).
- `b3d6f33` — closed all four of 017's items: row **K** gained its S-8 verdict,
  row **V** became **`resolved (argued)`** (a new status token), PJ-013 gained
  a "Superseded in part" banner, and CLAUDE.md was pointed at 017. It also
  amended the nomination rule — *a row whose severity is widened by the change
  that cleared another row is nominated too, demonstrated or not* — which was
  one of two routes 017 offered for row X. Row X was then nominated under it
  and cleared by S-3c.
- `78a7bbe` — **PJ-024**, the closing review of the completed arc, with
  CLAUDE.md pointed at it in the same commit. Also carries a rename it should
  not: `git mv` had already staged it. Disclosed in that commit's message.
- `f16978e` — this entry.
- `e386027` — **the wrap tooling fixes** (`wrap-hook.sh`, `collect.sh`,
  `SKILL.md`), below.

Working tree at wrap time: this entry only.

## Verified

Run at `e89e80c`, during this session:

- `bun test` → **188 pass, 0 fail**, 611 expect() calls, 20 files. (Exit code
  ignored — it lies here.)
- `bun run typecheck` → clean. `npx depcruise src tests --output-type err` →
  **0 errors**, 2 warnings, the pre-existing `no-orphans` on the CLI stubs.

Carried to `e386027` on an explicit check:
`git diff --name-only e89e80c..e386027 -- src tests` returns **zero files** —
everything since is `.claude/`, `CLAUDE.md` and `docs/`.

The corpus-exhaustion claim was checked against §3's **ownership table** rather
than its prose, which PJ-023 names as authoritative: `open` + owned is **none**;
F, O, S, T, Z are open and unowned; Y and AA are boundary. Arc totals,
`5003eea` → `e89e80c`: node labels **13 → 13**, edge labels 19 → 24, migrations
**0**. The claim holds.

The tooling changes were verified by piping sample JSON through **nine hook
branches** in a throwaway worktree, so this session's real state was never
touched: fresh startup; compact inheriting; startup *not* inheriting; compact
with an unrelated predecessor *not* inheriting; `stop_hook_active`; HEAD
unchanged; a log-only range staying quiet; HEAD moved blocking with valid JSON;
garbage stdin exiting 0. `collect.sh` was run against this session's real state
before and after the number-matching fix.

Not run: `bun examples/full-lifecycle.ts`.

## Open

- **Row F never received its verdict** — PJ-024's only open item, and the last
  known hole in the ledger. Its narrative is five lines with no S-9 outcome and
  no record of the review that reopened it, while PJ-008's S-9 outcomes prose
  still reads *"row F is refuted"* against a status column saying `open`.
  Being handed to the implementing agent.
- **The compaction fix is unverifiable in the session that made it.** The
  inheritance path only runs on a real compaction with a real `source` field;
  the nine JSON tests exercise the logic, not the integration. Same shape as
  the original hook wiring, which wrap 001 also had to ship untested.
- **`resume` is the weaker half of that fix.** `compact` is unambiguous. If
  resuming preserves the session id the state file already exists and none of
  this runs; if it issues a new id, inheriting the most recent same-history
  state is a guess. The code says so.
- Unchanged and stated in the journal: no non-additive schema change has been
  attempted, so "cheap to change" stays one-directional; the event log is an
  in-memory decision whose trigger has been tested twice and did not fire; rows
  F, O, S, T and Z need discriminators that would have to be invented.

## Next

Nothing owed by this session. The domain work's next step is row F's verdict,
in `docs/project-journal/008_…md` — one dated paragraph recording what S-9
found (identity settled by content hash, no `Artefact → Artefact` edge earned)
and what the review reopened, plus a correction or annotation on the S-9
outcomes prose.

## Tooling note

Four findings, three of them now fixed in `e386027`.

**Both previously-untested Stop-hook branches have run.** The first fire
created this entry from clean state; the second detected it and forced
update-in-place rather than opening `003`. Wrap 001 listed that convergence as
unverifiable by construction.

**Compaction lost the session's state, and now does not.** A new session id
meant a fresh baseline at today's HEAD and an empty `entry`, so a compacted
session would continue into a *second* numbered entry while its first half sat
in one nobody would update again. `SessionStart` now inherits `baseline` and
`entry` from the predecessor when `source` is `compact`/`resume` and that
session's recorded HEAD is an ancestor of ours; `startup` and `clear` never
inherit.

**A resumed session's range silently contains another session's work, and now
says so.** `collect.sh` flags commits touching a session-log entry that is not
this session's, naming the entry that claims them. Matched by entry *number*,
not path — the first run flagged this session's own PJ-024 commit, because that
commit touched entry 002's pre-rename path.

**`git mv` stages by itself**, so the rename of this entry rode into `78a7bbe`
behind an explicit `git add` of two other paths — the "message described
neither" failure reached without typing `git add -A`. `SKILL.md`'s staging
rules gain it: check the index, not just your own `git add`.
