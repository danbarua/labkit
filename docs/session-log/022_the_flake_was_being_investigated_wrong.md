# 022: the flake was being investigated wrong, and then measured right

**Session wrap, 2026-08-24, on `fix/suite-ceiling`.** Not a decision record —
the measurements are in `docs/TASKS.md`, the corrected mechanism in CLAUDE.md,
and the reasoning for the edge change in `src/db/graph.ts`'s own comments.

**The range is wider than this entry.** The pinned baseline is `72dbe15` and
covers twenty-two commits across six entries; 017-021 hold the rest, and
`082b8a9` is the PR #2 merge. This entry covers `d596672` and `4a45eeb`.

**PR #2 merged during this work.** The branch moved from `feat/mcp-server` to
`fix/suite-ceiling`, cut fresh from `origin/main`.

## Goal

Work the suite-ceiling flake — fan it out to background agents, which Dan
pointed out was overdue.

## Changed

**`d596672` — the premise was wrong.** Three agents went out in isolated
worktrees: two to build named candidate fixes, one to profile a crossing and
produce numbers rather than a fix. The profiler refuted what the other two were
built on.

CLAUDE.md said the cost was `provisionTenantGraph()` reconciling on every
`begin()` and `current()`. That sentence was added by `9bc8611` at 19:06 on
2026-08-21; `6eeeb92` cut reconciliation from ~80 round trips to 6 at 19:22 the
same evening. Sixteen minutes, never updated, and it misdirected every
investigation since — including both fixes dispatched that morning.

Measured: steady-state provisioning is 6 queries and 1-4ms, the cold one is 83
and runs once per file, and provisioning is 8-18% of query time in the files
that fail. `reset()` is bigger — ~35-40ms a call, 29% of suite query time. And
bun's hook and body clocks are **separate**, so in the ~23 files that set up
from `beforeEach`, setup cost cannot be the mechanism at all. The predictor is
**queries per test**.

That commit corrects CLAUDE.md and `docs/TASKS.md`, and takes the one candidate
that applied cleanly — `current()` reuses the `TenantContext` `begin()`
resolved. Priced at ~4% of a 6s test and taken because it is strictly less work
and already verified, **not** because it was expected to fix anything.

**`4a45eeb` — the lever, taken.** Tracing the heaviest file showed `createEdge`
issuing **four** round trips per edge: source-exists, target-exists,
duplicate-check, then the `CREATE`. 360 of that file's 812 queries were the
preflight.

The two endpoint checks were buying what the `CREATE` already knows — it
matches both endpoints itself and returns no rows when one is missing. Binding
the edge (`CREATE (a)-[e:…]->(b) RETURN e`) makes that observable, so those
queries now run only on the failure path, to say which endpoint was missing.
The duplicate check stays: a `23505` inside `inTransaction` poisons the
enclosing Postgres transaction and catching it in TypeScript does not un-abort
it, so that check is what keeps the error off the path most calls take.

Probed against this backend first, because pglite-age has form on edge
operations (`MERGE` builds edges with both endpoints `0`). All three behaviours
confirmed before anything was built on them.

## Verified

**Deterministic, paired, same file and classifier before and after** — the one
measurement in this whole investigation with no load ambiguity:

    tests/scenarios/s11b_*   812 -> 572 queries   -29.6%   (measured both ways)
    tests/scenarios/s9b_*    908 after; 1340 before by arithmetic (908 + 2x216)

`bun test` — 320 pass, 3 fail, 323 tests across 47 files, 248.84s. All three
failures were 5000ms ceiling timeouts; the two files involved pass **15/0 in
3.89s** in isolation. `tests/domain-graph.test.ts` 43/0, which is where the
error paths and the mocked-23505 test live. `bun run typecheck` clean.
`npx depcruise src tests --output-type err` — `no dependency violations found
(99 modules, 329 dependencies cruised)`. `check:doc-comments`,
`check:tests-assert` and `check:stdout` OK.

Not run: `check:migrations` (no `drizzle/` change),
`bun examples/full-lifecycle.ts`, `check:pglite-concurrency`.

**No claim that the flake is fixed.** The extrapolation — s9b's heaviest test
from ~6.0s to ~4.1s — is arithmetic over a loaded per-round-trip rate measured
once, before `6eeeb92`. Nothing here has been measured against the failure rate.

## Open

**Two mistakes in how the fan-out was set up**, recorded because they cost real
agent time.

1. **No base branch was specified**, so all three worktrees were cut from
   `main` rather than `feat/mcp-server` — 58 commits behind. One agent's target
   files did not exist there, and its `tests/mcp.test.ts` work is against a file
   that has since moved 549 lines.
2. **Two agents were sent to fix something whose cause had not been verified.**
   The profiler should have run first, or alone. Both fixes target the 8-18%
   and neither touches the predictor; the fix that mattered came from reading
   its numbers afterwards.

**`flake/setup-off-budget` is unmerged**, with a port owed for its
`tests/mcp.test.ts` half. It moves `reset()` off the test clock for the ~5
in-body files, which the profile says matters. Its branch and worktree exist.

**Hookify rules were created and are untracked.** Four (`piped-bun-test`,
`git-add-all`, `bare-git-stash`, `console-log-in-src`), copied by hand into the
base checkout. `config_loader.py` globs `.claude/hookify.*.local.md` relative to
cwd with no upward walk, so **a new worktree still starts unguarded** — the
copy does not propagate. Tracking them is the only thing that fixes it, and
`.gitignore` currently argues against on grounds that predate knowing this.

## Next

**The next lever is the same shape one level up.** 220-314 queries per heavy
file are domain cypher, and the verbs issue them in per-item loops —
`reinterpret` runs a query per withdrawn claim, `replaceAnalysis` one per
input. `closeDecision` also still does precheck-then-write, the exact shape
`createEdge` just shed.

To claim anything about the *flake* rather than about work done, the
measurement has to be paired, interleaved, one variable, **under induced load**:
a clean machine passes on every arm, so a green run proves nothing.

`fix/suite-ceiling` is pushed and unmerged.
