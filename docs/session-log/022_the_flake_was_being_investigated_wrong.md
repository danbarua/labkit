# 022: the flake was being investigated wrong

**Session wrap, 2026-08-24, on `fix/suite-ceiling`.** Not a decision record —
the measurements are in `docs/TASKS.md` and the corrected mechanism is in
CLAUDE.md.

**The range is wider than this entry.** The pinned baseline is `72dbe15` and
covers twenty commits across six entries; 017-021 hold the rest, and `082b8a9`
is the PR #2 merge. This entry covers `d596672` alone.

**PR #2 merged during this work.** The branch moved from `feat/mcp-server` to
`fix/suite-ceiling`, cut fresh from `origin/main`.

## Goal

Fan out the suite-ceiling flake to background agents, which Dan pointed out was
overdue.

## Changed

Three agents were dispatched in isolated worktrees: two to build named
candidate fixes, one to profile a crossing and produce numbers rather than a
fix. The measurement was kept serial and out of their hands on purpose —
machine load *is* the phenomenon, and three concurrent full-suite runs would
have corrupted every arm.

**The profiling agent refuted the premise the other two were built on.**

CLAUDE.md said the cost pushing tests over the ceiling was
`provisionTenantGraph()` reconciling on every `begin()` and `current()`. That
sentence was added by `9bc8611` at 19:06 on 2026-08-21; `6eeeb92` cut
reconciliation from ~80 round trips to 6 at 19:22 the same evening. Sixteen
minutes, never updated, and it has misdirected every investigation since —
including both fixes dispatched today, which target provisioning.

Measured on current code:

- steady-state provisioning is **6 queries, 1-4ms**; the cold one is 83 and
  runs once per file
- provisioning is **8-18%** of query time in the three files that actually fail
- the predictor is **queries per test**: files span 6 to ~280, individual tests
  reach ~380, and at ~16ms per round trip under load that band straddles
  5000ms — which is why it is 7-15 *different* tests each run
- **`reset()` is bigger than provisioning** — ~35-40ms a call, 29% of suite
  query time against provisioning's 18%
- **bun's hook and body clocks are separate.** A slow `beforeEach` reports
  `a beforeEach hook timed out`; every failure recorded here says
  `timed out after 5000ms`, the body wording. In the ~23 files that set up from
  hooks, setup cost cannot be the mechanism.

`d596672` corrects CLAUDE.md and `docs/TASKS.md`, and takes the one candidate
that applies cleanly: `current()` reuses the `TenantContext` `begin()` resolved
rather than re-resolving. Priced from the profile, not from a run — 8 round
trips, ~100-130ms under load, ~4% of a 6s test. `begin()` still reconciles
unconditionally so PJ-005's self-healing property is untouched; `src/db` has no
diff. Taken because it is strictly less work and already verified, **not**
because it is expected to fix anything.

## Verified

`bun test` — **322 pass, 2 fail**, 324 tests across 47 files, 172.34s. Both
failures were 5000ms+ ceiling timeouts and `tests/scenarios/s10c_*` passes 3/0
in 1.56s in isolation: the phenomenon under investigation, appearing during its
own verification run. `bun run typecheck` clean.
`npx depcruise src tests --output-type err` —
`no dependency violations found (99 modules, 329 dependencies cruised)`.
`check:doc-comments` and `check:tests-assert` OK.

Not run: `check:stdout` (no `src/` change), `check:migrations`,
`bun examples/full-lifecycle.ts`, `check:pglite-concurrency`.

## Open

**Two mistakes in how the fan-out was set up, recorded because they cost real
agent time.**

1. **No base branch was specified**, so all three worktrees were cut from
   `main` rather than `feat/mcp-server` — 58 commits behind. One agent's target
   files did not exist there, and its `tests/mcp.test.ts` work is against a file
   that has since moved 549 lines. Its survey and reasoning transfer; its diff
   for that file does not.
2. **Two agents were sent to fix something whose cause had not been verified.**
   The profiling agent should have run first, or alone. Both fixes target the
   8-18% and neither touches the predictor.

**`flake/setup-off-budget` is unmerged and better motivated than what landed** —
it moves `reset()` off the test clock as well as setup, which the profile says
matters for the ~5 in-body files. Its `tests/mcp.test.ts` half needs redoing
against current `main`. The branch and its worktree still exist.

**Nothing has been measured against the failure rate.** Both candidates are
priced from the profile only. A clean machine passes on every arm, so a green
run proves nothing; `docs/TASKS.md` records an earlier fix that passed round one
on both arms and failed at the lowest load of four.

## Next

Decide whether the flake is worth more than it has already had. If it is, the
lever is **queries per test**, which no candidate touches, and the measurement
has to be paired, interleaved, one variable, **under induced load**.

`fix/suite-ceiling` is pushed and unmerged; it is documentation plus one
harness change and carries no risk if merged as-is.
