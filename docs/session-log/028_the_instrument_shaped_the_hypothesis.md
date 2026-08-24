# 028: the instrument shaped the hypothesis

**Session wrap, 2026-08-24, on `perf/one-pglite`.** Covers `816be0e` (merged as
PR #9) and `41566a5` (PR #10). The pinned baseline is `72dbe15`; entries 017-027
hold the rest of the range.

## Goal

Finish the flake work: port the abandoned `flake/setup-off-budget` idea onto
`main`, measure it, and then follow Dan's suggestion that *"PGlite cold WASM
boot can apparently take > 5S"*.

## Changed

**`816be0e` — setup off the per-test budget. Measured; it does not move the
failure rate.** bun's 5000ms ceiling times the test body and runs
`beforeEach`/`afterEach` outside it, so setup called inline spends part of a
test's own allowance. Three files converted, each verified to open one world per
test. Twelve runs, ABBA, saturated: median one failure on both arms, **6.6% off
wall time**. The abandoned branch was not ported — it was cut 87 commits back
and its `tests/mcp.test.ts` half targeted a file that had moved 549 lines, so
re-applying the idea on `main` was cheaper.

**`41566a5` — one PGlite for the suite instead of 44. ~140s to ~60s.** A
throwaway probe measured `setupTestDb()` at **~900ms quiet and ~2,500ms with ten
cores saturated**, against 2-13ms to connect and query afterwards. Three files
called it directly and 41 reached it through `openScenario`, each from its own
`beforeAll` — 44-110s of a ~200s run was WASM boot. Memoised in a module-level
promise; `close()` no longer tears the instance down. Isolation is untouched: it
came from `reset()` and per-test connections, never from separate instances.

Measured against `main`, ABBA × 3, saturated: **197s → 118s**, and the tightest
band of any measurement this session (111-121 against 192-199).

## Verified

Four full runs at 59.85s, 59.50s, 59.64s, 59.74s — **323 pass, 0 fail, exit 0**,
the last after rebasing onto current `main`. `typecheck`, `depcruise` (99
modules, 329 dependencies), `check:tests-assert` clean.

Failure rate: two failures across A's six runs against one across B's, medians
zero on both. **At n=6 that distinguishes nothing and is not claimed.**

## Open

**The instrument shaped the hypothesis, and that is the finding worth keeping.**
Three attempts at the flake measured query counts, and query counts were the
minority of the time. `LABKIT_TRACE` instruments the `LabKitDB` seam, so it can
only see work that happens *after* a connection exists — boot is invisible to
it by construction. Every hypothesis this session generated was therefore
downstream of the actual cost, and the profile that "found the mechanism" in
entry 022 was measuring the 40% it could see. Dan named the boot in one line;
the probe took ten minutes.

**A confound in the measurement harness, visible only because it repeated.**
The catastrophic run landed on arm B in two consecutive experiments. ABBA runs
A,B,B,A, so A holds positions 1 and 4 of each round and B holds 2 and 3 — equal
mean position, which cancels *linear* drift, but any effect peaking mid-round
hits B and misses A by construction. My earlier "n=6 cannot attribute it" was
right for the wrong reason: it is a systematic position effect, not sample size.
Randomising arm order per round, or alternating ABBA with BAAB, would settle it.

**Two changes now measured against the failure rate and neither moved it.** Both
reduced or relocated cost; neither changed the shape of the distribution. The
remaining candidates in `docs/TASKS.md` — raising the ceiling, or stopping a
timed-out test cascading — are the only ones left with a mechanism that could.

Still outstanding:

- **`flake/setup-off-budget` and two dead agent worktrees** under
  `labkit/.claude/worktrees/` can be deleted; the branch is superseded by
  `816be0e` and `flake/current-no-reprovision` has a zero diff against `main`.
- **Hookify rules do not propagate to new worktrees.**

## Next

PR #10 is open. Nothing else queued.

`docs/TASKS.md`'s flake entry should be updated once #10 merges — it still
frames query count as the lever, and the boot finding supersedes that.
