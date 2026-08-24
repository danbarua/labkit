# 024: measuring whether the flake work worked

**Session wrap, 2026-08-24, on `fix/measure-the-flake`.** Not a decision record
— the table and the method are in `docs/TASKS.md`.

**The range is wider than this entry.** The pinned baseline is `72dbe15` and
covers thirty-three commits across eight entries; 017-023 hold the rest. This
entry covers `616fb0a` alone. PR #4 merged as `d0cc3c9` and another session
added `9fccfef` / `89b969f` to `main` in the meantime; this branch is cut from
`origin/main` after both.

## Goal

Dan: *"HAVE WE ACTUALLY SHIPPED ANY CODE FOR THE FLAKEY TESTS ISSUE OR JUST MADE
A LOT OF MARKDOWN TALKING ABOUT IT"*. Answer it with a number.

This is entry 022's `## Next` finally being done: *"to claim anything about the
flake rather than about work done, the measurement has to be paired,
interleaved, one variable, under induced load."*

## Changed

**The count that prompted it: 96 lines of code against 661 of prose.** And the
sentence four documents kept carrying — *"not measured against the failure
rate"* — had been written four times instead of being done once.

**`616fb0a`** replaces it with the measurement. Twelve full runs,
ABBA-interleaved over three rounds, all ten cores saturated by busy loops for
the duration of each run. A = `082b8a9` (before any of this work), B =
`61e6022` (`createEdge` four round trips to one, `current()` no longer
re-provisioning):

| arm | failures per run | median | wall median |
| --- | --- | --- | --- |
| A | 1, 1, 1, 1, 1, 0 | **1** | 218s |
| B | 0, 25, 1, 1, 1, 1 | **1** | 208s |

**Identical median failure rate. The shipped code does not fix the flake.** The
query reduction bought ~5% of wall time. B's total (29 against 5) is one 620s
run — 3× the median, the cascade signature — and with n=6 per arm it cannot be
attributed to the change; B does strictly less work per run.

**Why, so the next attempt does not repeat it:** the ceiling is crossed by
whichever test is unlucky, not by the slowest one. Making a heavy test lighter
moves that test off the boundary and does nothing for the population sitting
near it. So s9b's heaviest test going ~6.0s → ~4.1s may be true *and* not move
the failure rate — two claims this branch had been treating as one.

Entry 023's two stale lines cleared while here: its range omitted `61e6022` and
it still read as unmerged after `d0cc3c9`.

## Verified

`bun run check:doc-comments` — OK. Nothing outside `CLAUDE.md`, `docs/TASKS.md`
and `docs/session-log/` was touched, so the code gates do not apply.

The measurement itself is the verification, and its own numbers are above.

## Open

**The control arm produced the more useful number.** On a *quiet* machine, wall
time varied **4× on identical code** — 107s to 427s across three runs of one
arm. Every single-run comparison in this investigation therefore proved nothing,
including ones cited in merged PRs. It also inverts the intuition: **inducing
load reduces variance rather than adding it** (A's loaded spread was 208-224s,
an 8% band). A future measurement that wants to discriminate should saturate,
not idle.

**I restarted this twice, and the second reason is the embarrassing one.** A
counting bug (`grep -c … || echo 0` prints `0` *and* exits 1, so the field
doubles), and then a design without induced load — the exact trap `docs/TASKS.md`
had recorded two days earlier, in a sentence I wrote.

Unchanged and unaddressed:

- **`flake/setup-off-budget` needs a port, not a merge**, and on this evidence
  it should be expected to buy wall time rather than failures.
- **Two dead agent worktrees** under `labkit/.claude/worktrees/`.
- **Hookify rules do not propagate to new worktrees** — the loader globs
  relative to cwd with no upward walk.

## Next

`fix/measure-the-flake` is PR #5, open.

**The queued lever now carries a prediction rather than a hope**: the per-item
query loops in `reinterpret` / `replaceAnalysis`, and `closeDecision`'s
precheck-then-write, should make the suite faster and **not** less flaky. That
is falsifiable by the same twelve-run harness, and if someone builds it the
first thing to do is run it.

Anything that would actually move the failure rate has to change the *shape* of
the distribution rather than the mean — raising the ceiling, or making a
timed-out test stop cascading. Both are recorded in `docs/TASKS.md` as named and
unbuilt, and the first is marked as hiding the problem rather than fixing it.
