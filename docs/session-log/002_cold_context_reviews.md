# 002: Two cold-context reviews — the S-3b close-out, and the completed arc

**Session wrap, 2026-08-20, on `spike/drizzle-age`.** Not a decision record —
see `docs/project-journal/016_…md` for the row V change and `017_…md` for the
first review this session produced. Renamed from
`002_cold_context_review_of_s3b.md` once the session outgrew that title.

**Scope warning, because the numbers mislead.** This session's state file pins
its baseline at `94d3d80`, and HEAD is now `e89e80c` — 48 commits. Only three
of them are this session's. The other 45 belong to the session written up in
`003_clearing_ledger_rows.md` (S-3c, S-10, S-9, S-14, S-18 and two external
reviews), which ran between this session's two halves. Read 003 for that work;
this entry does not restate it.

## Goal

Review the domain-discovery arc from cold context, read-only, at two points:
after the S-3b / row V close-out, and again after the corpus was declared
exhausted.

## Changed

Three commits, all made by the user acting on this session's reviews. The
reviews themselves modified nothing.

- `d34229d docs: add S-3b cold-context review and wrap entry` — filed the first
  review as `docs/project-journal/017_cold_context_review.md` (+172,
  byte-identical), plus the previous session's wrap.
- `6361c5e docs: wrap the cold-context review session` — this entry.
- `b3d6f33 docs: file PJ-017's open items, and point CLAUDE.md at what it can't
  see` — closed all four of 017's items: row **K** gained its S-8 verdict, row
  **V** became **`resolved (argued)`** (a new status token), PJ-013 gained a
  "Superseded in part" banner, and CLAUDE.md was pointed at 017 and
  `docs/session-log/`. It also amended the nomination rule — *a row whose
  severity is widened by the change that cleared another row is nominated too,
  demonstrated or not* — which was one of two routes 017 offered for row X.

- `7eb3804 docs: PJ-024, a closing review of the arc, and point CLAUDE.md at
  it` — the second review, filed as
  `docs/project-journal/024_closing_review_of_the_arc.md`, with CLAUDE.md's
  journal paragraph pointed at it in the same commit. Filing without the
  pointer is what `b3d6f33` had to fix for 017.

Working tree at wrap time: this entry only.

## Verified

Run at the tip, `e89e80c`, during this session:

- `bun test` → **188 pass, 0 fail**, 611 expect() calls, 20 files. (Exit code
  ignored — it lies here.)
- `bun run typecheck` → clean, no output.
- `npx depcruise src tests --output-type err` → **0 errors**, 2 warnings, the
  pre-existing `no-orphans` on `src/index.ts` and `src/cli.ts`.

The corpus-exhaustion claim was checked against §3's **ownership table** rather
than its prose, which is what PJ-023 says is authoritative: `open` + owned is
**none**; F, O, S, T, Z are open and unowned; Y and AA are boundary. Fifteen
scenarios — twelve of PJ-008's fourteen, plus S-3b and S-3c authored, plus S-18
promoted. S-2 and S-13 own nothing outstanding. The claim holds.

Arc totals, measured `5003eea` → `e89e80c`: node labels **13 → 13**, edge
labels 19 → 24, migrations **0**.

Not run: `bun examples/full-lifecycle.ts`, and nothing exercises the wrap shell
scripts.

## Open

- **Row F never received its verdict.** Its narrative section is five lines —
  header, scenarios, current state, the original 2026-08-18 prediction — with no
  S-9 outcome and no record of the review that reopened it. Rows E, J, P and X
  carry 25, 22, 34 and 67 lines. PJ-008's S-9 outcomes prose still reads *"Held,
  and this was the interesting call: **row F is refuted**"* with no adjacent
  correction, while the status column says `open`; the correction exists only in
  PJ-021. Keeping the superseded verdict verbatim is right by the ledger's own
  convention — the later verdict just has to be reachable from the index, and
  for F it is not. This is the row-K shape recurring, which is pointed, since
  the `°` marker exists because of row K.
- Unchanged and stated in the journal: no non-additive schema change has been
  attempted, so "cheap to change" stays one-directional; the event log is an
  in-memory decision whose trigger has been tested twice and did not fire; and
  rows F, O, S, T and Z need discriminators that would have to be invented.

## Next

Add one dated paragraph under **Row F** in `docs/project-journal/008_…md`
recording what S-9 found (identity settled by content hash, no
`Artefact → Artefact` edge earned) and what the review reopened, and correct or
annotate the S-9 outcomes prose that still reads *"row F is refuted"*. That is
PJ-024's only open item and the last known hole in the ledger.

## Tooling note

Three findings about the wrap tooling, from using it across an unusually long
session.

**Both previously-untested Stop-hook branches have now run.** The first fire
created this entry from clean state; the second detected the existing entry and
forced update-in-place rather than opening `003`. Wrap 001 listed that
convergence behaviour as unverifiable by construction; it is verified.

**A resumed session breaks the baseline's assumption.** `baseline` is pinned at
session start, which is right for a session that runs to completion. This one
was resumed after another session had made 43 commits, so `collect.sh`
faithfully reported 48 commits since baseline — and a naive whole-file rewrite
would have restated 003's work as this session's. Nothing in the skill warns
about it, and the failure is silent and plausible-looking. Worth either a note
in `SKILL.md` or a `collect.sh` line flagging commits already claimed by another
entry.

**The hook fires correctly on other sessions' commits.** That is not a bug —
HEAD did move, and the entry did need updating to say so — but it means a
review-only session gets asked to wrap work it did not do, and the right answer
is a scope warning rather than a longer Changed section.
