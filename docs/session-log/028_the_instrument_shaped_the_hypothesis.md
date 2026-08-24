# 028: the instrument shaped the hypothesis

**Session wrap, 2026-08-24.** Covers `816be0e` (PR #9), `41566a5` (PR #10) and
`5625865` (PR #11, open on `docs/flake-lever`). The pinned baseline is
`72dbe15`; entries 017-027 hold the rest of the range.

## Goal

Finish the flake work: port the abandoned `flake/setup-off-budget` idea onto
`main`, measure it, then follow Dan's suggestion that *"PGlite cold WASM boot
can apparently take > 5S"*.

## Changed

**`816be0e` — setup off the per-test budget. Measured; it does not move the
failure rate.** bun's 5000ms ceiling times the test body and runs
`beforeEach`/`afterEach` outside it, so setup called inline spends part of a
test's own allowance. Three files converted, each verified to open one world per
test; a fourth (`clock_ordering`) was converted, **broke, and was reverted** —
its `programme()` helper opens a world and one test calls it twice, the only
case of the four where the two-world shape is hidden behind a helper rather than
visible at the call site. Twelve runs, ABBA, saturated: median one failure on
both arms, **6.6% off wall time**.

The abandoned branch was not ported. It was cut 87 commits back and its
`tests/mcp.test.ts` half targeted a file that had since moved 549 lines, so
re-applying the idea on `main` cost less than porting it.

**`41566a5` — one PGlite for the suite instead of 44. ~140s to ~60s.** A
throwaway probe measured `setupTestDb()` at **~900ms quiet and ~2,500ms with ten
cores saturated**, against 2-13ms to connect and query afterwards. Three files
called it directly and 41 reached it through `openScenario`, each from its own
`beforeAll` — 44-110s of a ~200s run was WASM boot. Memoised in a module-level
promise; `close()` no longer tears the instance down. Isolation is untouched: it
came from `reset()` and per-test connections, never from separate instances.

Measured against `main`, ABBA × 3, saturated: **197s → 118s**, the tightest band
of any measurement this session (111-121 against 192-199).

**`5625865` — the record corrected, and the dead branches removed.** Both live
documents still framed query count as the lever. They now say what was measured,
and carry the lesson below. Deleted after verifying each was dead rather than
assuming: `flake/setup-off-budget` (superseded by `816be0e`),
`flake/current-no-reprovision` (empty diff against `main` on the only file it
touched), and three agent worktrees.

## Verified

Four full runs at 59.85s, 59.50s, 59.64s, 59.74s — **323 pass, 0 fail, exit 0**,
the last after rebasing onto current `main`. `typecheck`, `depcruise` (99
modules, 329 dependencies), `check:tests-assert`, `check:doc-comments` clean.

Failure rate across all twelve loaded runs of #10: two failures on A's six
against one on B's, medians zero. **At n=6 that distinguishes nothing and is not
claimed.**

## Open

**The instrument shaped the hypothesis, and that is the finding worth keeping.**
Three attempts at this flake measured query counts, and query counts were the
minority of the time. `LABKIT_TRACE` instruments the `LabKitDB` seam, so it can
only see work after a connection exists — boot was invisible to it by
construction. Every hypothesis the session generated was therefore downstream of
the actual cost, including the profile in entry 022 that was taken to have found
the mechanism and was carefully measuring the 40% it could see. Dan named the
boot in one line; the probe took ten minutes. **Before profiling, ask what the
profiler cannot see** — now in CLAUDE.md.

**A confound in the measurement harness, visible only because it repeated.**
The catastrophic run landed on arm B in two consecutive experiments. ABBA runs
A,B,B,A, so A holds positions 1 and 4 of each round and B holds 2 and 3 — equal
mean position cancels *linear* drift, but any effect peaking mid-round hits B
and misses A by construction. An earlier "n=6 cannot attribute it" was right for
the wrong reason: it is a systematic position effect, not sample size.
Randomise arm order per round, or alternate ABBA with BAAB.

**Three changes now measured against the failure rate and none moved it.** All
three reduced or relocated cost; none changed the shape of the distribution. The
suite is 2.3× faster and exactly as flaky. What remains in `docs/TASKS.md` —
raising the ceiling, or stopping a timed-out test cascading — are the only
candidates left with a mechanism that could.

**Hookify rules still do not propagate to new worktrees**; the loader globs
relative to cwd with no upward walk. Unaddressed.

## Next

PR #11 is open and is the last thing owed from this thread. Nothing else queued.

The one substantial unbuilt thing that serves a stated goal remains a durable
event sink and a read over it — every current read answers *what is true now*,
and nothing answers *what happened*. It is filed under "Deliberately not being
done" on the grounds that it waits on a consumer.
