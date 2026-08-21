# 006: Row F closed as `boundary`, PJ-027, and the first deliberate sweep for it

**Session wrap, 2026-08-21, on `feat/minion`.** Not a decision record — see
`docs/project-journal/027`, `028` and `docs/consumer-contract/036`, `037` for the
reasoning.

**The range is wider than this session.** `collect.sh` reports seventeen commits
since baseline `79de6f3`; most are `labkit-dev`'s and four of those are written
up in entry 005. This entry covers **`afcbc58`, `079798f`, `ecbd29f`, `136fbc4`,
`5204809`** and the two merges, and nothing else.

## Goal

Close row F. Then — at `labkit-dev`'s request — look *on purpose* for the defect
PJ-027 names, which until now had only ever been found by accident, and answer
whether any of it can be machine-checked.

## Changed

**Row F, and the journal entry that came out of it:**

- `afcbc58` — `reproductionOf().differs` carries `IdentifiedArtefact` instead of
  a bare `logical_name`. Row F's fourth bite (S-10c), same remedy as the three
  before it.
- `079798f` — `docs/consumer-contract/035`, `036`: row F's predictions and its
  verdict, **`boundary`**. Argued from an enumeration of every read that touches
  an artefact, not accumulated to from the four bites.
- `ecbd29f` — `docs/project-journal/027`, plus CLAUDE.md's chain paragraph.

**The sweep's own output:**

- `136fbc4` — `reproducibilityOf()` reported `reproducible: true` for a
  construction with no parts, and for an analysis that was never created.
  Predictions in `037`; scenario `tests/scenarios/s9e_reproducing_nothing.test.ts`
  fails **0/3** against the old predicate and passes **3/3** against the new.
  Two states, two answers: an analysis that consumed nothing is a real record and
  gets `reproducible: false` (unshown, not refuted — `exact.length > 0` is the
  conjunct three empty lists cannot supply); an analysis that does not exist is
  **refused**, as every other absent-subject read on the surface refuses.
  **Not a §3 row** — `labkit-dev` corrected an over-classification of mine: rows
  are claims about the model, and this needed no noun, edge or property.
- `5204809` — `docs/project-journal/028`, `scripts/check-tests-assert.ts`,
  `package.json`, CLAUDE.md.

Merges `70817a2` (fast-forward: `Question.posed_at`, the `whatWasKnown` fixes,
`src/mcp/`, the CLI rewrite) and `2623d02`. Pushed to `origin/feat/minion`.

## Verified

- `bun test` — **261 pass, 0 fail**, 855 expect() calls, 36 files, 95.99s, after
  the second merge. A fully clean run; the flake did not appear when nothing else
  was loading the machine. An earlier run in this session, with six subagents
  reading concurrently, gave 256 pass / 2 fail — both S-11 tests timing out at
  6.2s and 7.0s against bun's 5000ms ceiling, i.e. the documented flake.
- `bun run typecheck` — clean.
- `npx depcruise src tests --output-type err` — **0 errors**, 1 pre-existing
  warning (`no-orphans: src/index.ts`).
- `bun run check:ledger`, `check:doc-comments` — both green.
- `bun run check:tests-assert` — **exit 1, on purpose.** See Open.
- `bun examples/full-lifecycle.ts` — **fails**, exit 1. See Open.

## Open

**`check:tests-assert` is red and is meant to be.** It names the two files it was
written from — `tests/leader-election.test.ts` (no assertion anywhere in the file)
and `tests/trace.test.ts:61` (`expect(true).toBe(true)`). `labkit-dev` owns both
fixes and was told; CLAUDE.md's Commands block and the PJ-028 paragraph both say
so, so nobody merges and thinks they broke it. The failing check *is* the
demonstration, in the same order every other fix here is made.

**`examples/full-lifecycle.ts` has been broken for 221 commits.** It reads back
through the per-tenant SQL views removed on 2026-08-19 by `af5a1d2`, dies at
`relation "labkit_t1.claim" does not exist`, and never reaches
`closed connection cleanly`.

The instructive part is `399cbb1` — same day, *after* the break, subject
"close out the plan's last verification step, and two exit-code traps" — which
added CLAUDE.md's rule for judging this script: *ignore the exit code, read the
output*. That rule is exactly what would have caught it, written by someone who
did not run it; and because it declares the exit code meaningless, the genuine
exit 1 had nobody watching either. `labkit-dev` has taken this one.

**The sweep's unverified remainder.** Six readers produced 28 candidates of the
guarantee-broken kind; I demonstrated seven and left the rest labelled *inferred*
on purpose. The full report is at `sweep-report.md` in this session's scratchpad
and was sent to `labkit-dev`. Acting on the inferred pile unverified would be the
sweep-driven edit the method exists to avoid.

The one most worth a demonstration before anyone "fixes" it: `write.ts:9` says
every compound verb runs inside `inTransaction()`, and `sharpen`, `openEnquiry`,
`pursue`, `recordReview`, `closeEnquiry` and `declareGate` do not. Either a real
defect or "compound" is narrower than the comment reads — and getting that
backwards wraps things that should not be.

**The wrap hook resolves its state from the wrong worktree.** This session began
in `labkit-domain-consumer` and works in `labkit-minion`. The hook hands over
`/Users/dan/Code/science/labkit-domain-consumer/.claude/.wrap-state/74f9b207-…`,
whose `baseline` is `005465c` — the *other* branch's tip — and then looks for this
entry inside that checkout. Until `labkit-dev` merged, the file was not there and
the hook reported "no entry yet" on every fire, three times. Both state files are
now pointed at this entry. Worth fixing: a session that moves between worktrees
gets another session's baseline and cannot be seen to have wrapped.

## Next

`labkit-dev` is fixing the two tests that `check:tests-assert` names; when they
land it goes green, and green then means nothing has regressed.

Two cheap things nobody owns: the **seven wrong counts** in comments — "eight
scenarios" (24), "1,051 lines" (1,563), "three states" (five fields) and four
more, listed in PJ-028 — each a one-line assertion away from being checked
instead of asserted. And `docs/dependency-graph.mmd` has no `src/mcp` or
`src/cli.ts`; `bun run dev:dependency-cruiser` regenerates it.

Read `sweep-report.md` before re-deriving any of the sweep — it labels every item
demonstrated or inferred, and the inferred ones are inferred on purpose.
