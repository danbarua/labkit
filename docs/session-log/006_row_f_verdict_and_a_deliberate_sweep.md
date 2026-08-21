# 006: Row F closed as `boundary`, PJ-027, and the first deliberate sweep for it

**Session wrap, 2026-08-21, on `feat/minion`.** Not a decision record — see
`docs/project-journal/027_prose_agreeing_with_itself.md` and
`docs/consumer-contract/036_row_f_verdict.md` for the reasoning.

**The range is wider than this session.** `collect.sh` reports eleven commits
since baseline `79de6f3`; eight are `labkit-dev`'s and three of those are
written up in entry 005. This entry covers **`afcbc58`, `079798f`, `ecbd29f`**
only. It also covers a merge and an in-flight investigation that have no commit
of their own yet.

## Goal

Close row F, then — at `labkit-dev`'s request — look *on purpose* for the defect
PJ-027 names, which until now had only ever been found by accident.

## Changed

- `afcbc58` — `reproductionOf().differs` carries `IdentifiedArtefact` instead of
  a bare `logical_name`. Row F's fourth bite (S-10c), same remedy as the three
  before it.
- `079798f` — `docs/consumer-contract/035`, `036`: row F's predictions and its
  verdict, **`boundary`**. Argued from an enumeration of every read that touches
  an artefact, not accumulated to from the four bites.
- `ecbd29f` — `docs/project-journal/027`, plus CLAUDE.md's chain paragraph. Three
  unrelated places holding a rule in a comment beside code that ignores it.

Then, this turn and **uncommitted as work**: fast-forward merge of
`origin/feat/domain-consumer` (`ecbd29f..70817a2` — `Question.posed_at`, the
`whatWasKnown` fixes, `src/mcp/`, the CLI rewrite). Working tree is clean apart
from this entry.

## Verified

- `bun run typecheck` — clean, exit 0.
- `npx depcruise src tests --output-type err` — **0 errors**, 1 warning
  (`no-orphans: src/index.ts`, pre-existing). 79 modules, 227 dependencies.
- `bun test` — **256 pass, 2 fail, 1 error**, 258 tests across 35 files, 208.94s.
  Both failures are S-11 tests timing out at 6245ms and 6971ms against bun's
  fixed 5000ms ceiling — the documented flake, not a regression. Six subagents
  were reading the repo concurrently, so machine load was high.
- `bun examples/full-lifecycle.ts` — **fails**, exit 1. See Open.

## Open

**`examples/full-lifecycle.ts` has been broken for 221 commits and nobody
noticed.** It reads back through the per-tenant SQL views, removed on 2026-08-19
by `af5a1d2`. It now dies at `relation "labkit_t1.claim" does not exist` and
never reaches `closed connection cleanly`.

The instructive part is `399cbb1` — same day, *after* `af5a1d2`, subject
"close out the plan's last verification step, and two exit-code traps" — which
added to CLAUDE.md the rule for judging this script: *ignore the exit code, read
the output for `closed connection cleanly`*. That rule is exactly what would
have caught it, written by someone who did not run the script. And because the
rule declares the exit code meaningless here, the genuine failure exit of 1 had
nobody watching it either. `3b21bea` edited the file today without running it.

Not fixed, deliberately: the sweep it was found by is read-only, and a fix
belongs with a decision about whether the example gets a graph-based read-back
or goes away.

**The deliberate PJ-027 sweep is in flight** — six read-only region agents. One
has reported (`src/domain/write.ts`, `core.ts`, `session.ts`, `events.ts`,
`index.ts`): five candidates of the guarantee-broken kind, four of the
gone-stale kind, none verified by me yet. **Candidates, not findings** — the
whole point of PJ-027 is that reading is not verification.

**The wrap hook fired from the wrong worktree.** It passed
`/Users/dan/Code/science/labkit-domain-consumer/.claude/.wrap-state/74f9b207-…`,
whose `baseline` is `005465c` — `labkit-dev`'s branch tip, not this session's.
This worktree has its own state file for the same session id with the correct
`baseline=79de6f3`, and that is the one this entry was collected against. Two
state files, one session id, two worktrees; the hook resolves the path from the
session's original project directory rather than the cwd.

## Next

Collect the remaining five region reports, then **verify** before anything is
called a finding — the `src/domain/write.ts` transaction-boundary and
`SUPPORTS`-only-lookup candidates are the two worth running something against
first. Report the four piles to `labkit-dev`, and answer its second question:
whether any instance had a machine-checkable form. Build nothing until then —
a demonstrated wrong answer nominates a ledger row, and only one may ship green.
