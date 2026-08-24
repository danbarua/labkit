# 002: Two cold-context reviews, and the wrap tooling they broke

**Session wrap, 2026-08-20, on `spike/drizzle-age`.** Not a decision record —
see `docs/project-journal/016_…md` for the row V change, and `017_…md` and
`024_…md` for the two reviews this session produced. Renamed from
`002_cold_context_review_of_s3b.md` once the session outgrew that title.

**This session stayed open and did one more thing on 2026-08-24**, on `main`:
`9fccfef`, the PGlite 0.5.7 upgrade that restored `bun test`'s exit code. It is
recorded under its own heading at the end rather than mixed into the 20th's
narrative, because nothing else here is about it.

**Where this landed.** `spike/drizzle-age` was fast-forwarded into `main` with
no merge commit, `feat/domain-consumer` was cut from the same commit, and all
three were pushed. `spike/drizzle-age` still exists at `b991da8`, so no sha in
this entry is stale.

**Scope warning, because the range misleads.** This session's baseline is pinned
at `94d3d80`, and the range from there to any later HEAD is mostly not this
session's work — a peer session was committing throughout. The commits that are
this session's are listed by sha below; that list is the stable fact, the range
is not. The rest belong to `003_clearing_ledger_rows.md` (S-3c, S-10, S-9, S-14,
S-18, two external reviews and row F's close-out), which ran between this
session's two halves. Read 003 for that work; this entry does not restate it.
`collect.sh` now prints this warning by itself — see the tooling note.

## Goal

Review the domain-discovery arc from cold context, read-only, at two points:
after the S-3b / row V close-out, and again after the corpus was declared
exhausted. Then fix the wrap tooling that the second review's own session had
exposed.

## Changed

This session's commits on 2026-08-20, by sha; the 24th's is under its own
heading at the end. The reviews modified nothing; `d34229d` and `b3d6f33` were
the user acting on the first review, the rest are this session's — and the run
of them that are **successive rewrites of this entry** were each forced by the
Stop hook re-firing on the peer session's commits. That churn is the seventh
tooling finding below, visible in the log rather than described.

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
- `f16978e`, `79c5a6e`, `93be853`, `2416a2b`, `93a30c6`, `d5274f0` — this
  entry, rewritten whole each time as the skill requires.
- `e386027` — **the wrap tooling fixes** (`wrap-hook.sh`, `collect.sh`,
  `SKILL.md`), below.
- `4692559` — **corrections to `e386027`**, after testing it. Below.
- `a2b500e` — closes **PJ-024 §5**: row F's verdict landed in the peer session's
  `cc68056`, so §5's finding is kept verbatim with a dated closing note beside
  it. The note also takes the peer's sharper reading of what §5 found — not "the
  row-K shape recurring" but the third instance of *withdrawing a claim means
  finding every place it was made*. Carries CLAUDE.md's pointer, which still
  advertised 024 as having an open item.

Working tree at wrap time: clean. `docs/session-log/003_…md` and
`docs/project-journal/008_…md` were both dirty under a peer session during this
wrap, and `fc62154`, `cc68056` and `805a31d` are that session's commits — none
was touched or staged here.

## Verified

Run at `e89e80c`, during this session:

- `bun test` → **188 pass, 0 fail**, 611 expect() calls, 20 files. (Exit code
  ignored — it lies here.)
- `bun run typecheck` → clean. `npx depcruise src tests --output-type err` →
  **0 errors**, 2 warnings, the pre-existing `no-orphans` on the CLI stubs.

Carried forward on an explicit check:
`git diff --name-only e89e80c..47799f2 -- src tests` returns **zero files** —
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
garbage stdin exiting 0.

Then verified **against reality**, which contradicted them — see below. Both
scripts re-checked with `bash -n` and `collect.sh` re-run after `4692559`.

Not run: `bun examples/full-lifecycle.ts`.

## Open

- **Row F — closed while this entry was being written**, by the peer session
  in `cc68056`, and covered by entry 003. It was PJ-024's only open item. Noted
  here because this entry's Next named it; nothing of it is this session's work,
  and PJ-008 was deliberately never touched from here.
- **A second finding raised and closed the same way** — `99dd25f`, also the
  peer's. Row F stated the unowned convention's exact sentence in prose without
  its blockquote; the phrase occurs five times in PJ-008 (F, O, T, Z, AA) and F
  alone was unformatted, which a grep misses because it wraps across a line.
  Row S, offered as the reason to leave it, turned out to be a different kind of
  row — a standing scope decision on identity rather than an exhausted-probe
  row — so the four comparable rows are F, O, T, Z and three carried the marker.
  PJ-008 was deliberately never touched from this session.
- **The `resume` half of the compaction guard is still a guess**, and is now
  its only justification. Compaction demonstrably does not need it. A resume
  whose own state file was removed by the 30-day sweep would reach the branch
  and inherit whichever session wrapped most recently on this history. The
  comment says so. Whether the branch should exist at all is a judgment call
  left open rather than taken.
- Unchanged and stated in the journal: no non-additive schema change has been
  attempted, so "cheap to change" stays one-directional; the event log is an
  in-memory decision whose trigger has been tested twice and did not fire; rows
  F, O, S, T and Z need discriminators that would have to be invented.

## Next

Nothing owed by this session, and — for the first time in the arc — no known
open item on the ledger's index either. Row F was the last, and `cc68056`
closed it, with `99dd25f` making it scannable: a dated verdict splitting what
S-9 settled from what it did not, a superseded-note beside the S-9 outcomes
prose leaving the original verbatim, and the unowned marker the other three
comparable rows carry.

The one judgment call left in this session's own work is whether the `resume`
half of the compaction guard should exist at all — see Open. It is a comment
and fifteen lines of shell, not a defect.

## Tooling note

Findings, in the order they were found. Two were fixed in `e386027`; testing
that commit produced two more, fixed in `4692559`. One is recorded, not fixed.
The last arrived on 2026-08-24 and is fixed in `f991b93`:

**A wrap entry may not contain a commit count.** This entry carried four, and I
corrected them twice before Dan pointed out why that never ends: the entry is
itself a commit, so any count in it is false the moment it lands, and false again
when a peer session pushes. `SKILL.md` now forbids writing one — name the shas,
because the list is the count and it does not go stale. Other sessions' entries
keep theirs, which is not an inconsistency: CLAUDE.md exempts dated records, and
a count in an entry nobody reopens is a measurement of its date. This one was a
live claim in a document that kept being reopened.

**Both previously-untested Stop-hook branches have run.** The first fire
created this entry from clean state; the second detected it and forced
update-in-place rather than opening `003`. Wrap 001 listed that convergence as
unverifiable by construction.

**A resumed session's range silently contains another session's work, and now
says so.** `collect.sh` flags commits touching a session-log entry that is not
this session's, naming the entry that claims them. Matched by entry *number*,
not path — the first run flagged this session's own PJ-024 commit, because that
commit touched entry 002's pre-rename path.

**`git mv` stages by itself**, so the rename of this entry rode into `78a7bbe`
behind an explicit `git add` of two other paths — the "message described
neither" failure reached without typing `git add -A`. `SKILL.md`'s staging
rules gain it: check the index, not just your own `git add`.

**The compaction fix was built on a false premise, and now says so.**
`e386027` asserted that compaction issues a new session id. It does not, in
this build, for either trigger. A manual `/compact` here preserved it — one
`compact_boundary` in the transcript, same `sessionId` on both sides, no new
state file, mtime untouched. The peer session running entry 003 was compacted
**twice**, once automatically on context exhaustion, and reported its state
file intact both times. So the inheritance branch is unreachable on the case it
was written for. The code stays as insurance against a build that behaves
differently; the comment and `SKILL.md` now record it as insurance rather than
as a mechanism, and say that lost state will not be explained by it.

**The range warning was overclaiming.** It inspects only commits touching
`docs/session-log`, so it detects another session's *entry*, never its *work* —
a peer whose commits were mostly code contributes nothing to detect. Its
closing line read as a complete inventory; it is a lower bound, and now says
"AT LEAST these commits" with the reason. Demonstrated by the peer session:
`e386027`, this session's own tooling commit, sits inside entry 003's range
unflagged because it touches only `.claude/skills/wrap/`.

**Number-matching survived a harder case than this session could build.**
Entry 003 was renamed *twice*. Three of its commits touch its two former names
and none is flagged; exact-path matching would have misattributed two of them
to another session. Recorded in `SKILL.md` as the evidence for the rule.

**The Stop hook fires on a peer's commits in a shared checkout.** `baseline` is
per-session but HEAD is shared, so any non-log commit by another session in this
worktree re-triggers the wrap and asks this session to write up work that is not
its own — observed repeatedly tonight while the peer committed to PJ-008. The
quiet rule only exempts commits that are entirely within `docs/session-log/`.
`collect.sh`'s warning is the mitigation, not a fix: it tells you the range is
wider than the session, having been asked in the first place. Not fixed here.
Two sessions in one checkout is the unusual case, and the honest options are
narrowing the trigger to commits this session authored — which git cannot
distinguish, both commit as the same author — or accepting it.

The last three findings came from testing the tooling against a live peer
session rather than against sample JSON, which is the general lesson: the nine
synthetic branches all passed while two of the things they were testing were
wrong about the world.

Sharper, because it happened three times tonight in three unrelated places: **a
silent negative got read as a fact about the world.** Nine hook branches passed
and were taken as evidence the premise held. A single-line grep returned four
hits for a phrase that occurs five times — the fifth wrapped across a line
break — and the missing hit was read as evidence about the content of rows F and
S. And CLAUDE.md already carries the same shape as a standing repo trap: a
camelCase `RETURN` name decodes as `null`, so the column arrives present and
empty and a decoder reads it as "nothing matched". In all three the tool
answered a question it had not been asked. The check that broke each of them was
the same — run it against something real, or have someone who did not write the
query read the result.

## 2026-08-24 — PGlite 0.5.7, and a signal that came back

Four days after the rest of this entry, on `main`, one commit: **`9fccfef`**.

**What prompted it.** A check of whether electric-sql's 2026-08-23 releases
fixed anything this repo works around. Two of the three did not:
`pglite#1046` (socket concurrency corruption) is still open with no maintainer
response, and `MERGE` on edges under `pglite-age` is untouched — both
`pglite-socket` 0.2.9/0.2.10 and `pglite-age` 0.0.7/0.0.8 are dependency bumps
with no code of their own. Core `pglite` 0.5.6 listed *"fixes for
`process.exitCode`"*, which was worth one measurement.

**Measured, one variable, same 323 tests:**

| Version | Result | Exit code |
| --- | --- | --- |
| 0.5.5 | 323 pass, 0 fail | **99** |
| 0.5.7 | 323 pass, 0 fail | **0** |
| 0.5.7 | deliberate failing test | **1** |
| 0.5.7 | run hitting the leader-election flake, 322/1 | **1** |

Trustworthy in both directions, which the third and fourth rows are there to
establish — a zero that is always zero would be no better than a 99.

**The confirmation run is the part worth keeping.** *Round one is not the
result*, so the suite was run twice; the second came back `1` on
`leader election > concurrent connectDb()` timing out at 5006ms. Under exit 99
that run was indistinguishable from a clean one. The signal earned its keep
inside two minutes of being restored.

**What went from the docs.** The "ignore the exit code" instruction, from
`CLAUDE.md` in two places and from `.claude/skills/wrap/SKILL.md`, which drops
from three traps to one. This repo's own rule is that *a rule telling readers to
ignore a signal removes the only watcher that signal had* — and the remedy it
prescribes is to fix or delete, not annotate. Deleted, therefore.

The `$?`-after-a-pipeline trap stays. It is a fact about the shell, not about
PGlite, and it is now the only one in the wrap skill's list.

**Not fixed, still worked around:** the socket concurrency bug, so one fresh
connection per test remains the containment; and `MERGE` on edges, so
`createEdge()` keeps its explicit `MATCH`-then-`CREATE`.

All five `@electric-sql` packages moved together because they publish as a set —
`pglite` 0.5.7, `pglite-socket` 0.2.10, `pglite-age` 0.0.8, `pglite-pgvector`
0.0.8, `pglite-prepopulatedfs` 0.5.7. Note `^0.0.6` pins exactly under npm caret
rules, so the two `0.0.x` extensions needed a manifest edit rather than
`bun update`.
