# 026: the predicted lever was the wrong one

**Session wrap, 2026-08-24, on `perf/query-loops`.** Not a decision record —
the measurements are in `docs/TASKS.md` and the reasoning is in
`src/db/graph.ts`'s own comments.

**The range is wider than this entry.** The pinned baseline is `72dbe15` and
covers forty commits across ten entries; 017-025 hold the rest. This entry
covers `96f93a3`.

## Goal

Dan, after a day in which 96 lines of code shipped against 661 of prose:
*"FUCK PROSE. Fix the code."*

## Changed

**The queue's predicted lever was wrong, and that is the first result.**
`docs/TASKS.md` had named the per-item query loops as where the volume was —
`reinterpret` querying evidence per withdrawn claim, `replaceAnalysis` looking
up a name per input. Batched all three with `IN $ids`: **six queries saved
across three heavy files.** Those collections hold one or two items. There was
nothing to batch. Kept because one query beats two, not because it earned its
place.

**Where the volume actually is.** `recorded()` writes three edges per
conclusion — `PRODUCES`, `RECORDED_IN`, the bearing edge — and each paid a round
trip asking whether that edge already existed. 284 of 1584 queries in
`s11_invalidate_analysis`, 18% of the file.

That check survived the earlier `createEdge` work for a real reason: a `23505`
inside `inTransaction` poisons the enclosing Postgres transaction, so an
idempotent re-call would take a compound verb down with it. But `recorded()`
mints the `Evidence` and `Claim` nodes **two lines above** the edges reaching
them, so no edge can exist and the check buys a guarantee already held.
`createEdge` gained an opt-in `endpointIsNew`, used only where that holds by
construction.

| file | before | after |
| --- | --- | --- |
| `s11_invalidate_analysis` | 1584 | **1320** (−16.7%) |
| `s12_reinterpret_claim` | 1127 | **1070** (−5.1%) |
| `s11b_which_review_retracted_it` | 572 | **542** (−5.2%) |

`closeDecision` also lost its precheck-then-write — the `SET` matches the node
itself, so an absent decision returns no rows.

**Entry 025 was stranded and is recovered here.** PR #6 merged at `ac4607e`,
before its wrap commit `392a1a0` was pushed, so entry 025 never reached `main`.
Cherry-picked onto this branch rather than left on a dead one. The wrap skill
commits the entry *after* the work, so a merge taken between the two loses it —
worth knowing, because nothing warns.

## Verified

`bun test` — **323 pass, 0 fail, exit 0**, 150s. `bun run typecheck` clean.
`npx depcruise src tests --output-type err` — `no dependency violations found
(99 modules, 329 dependencies cruised)`. `check:doc-comments`,
`check:tests-assert`, `check:stdout` all OK.

Query counts via `LABKIT_TRACE=all`, same files and same counting method on both
sides of the change.

## Open

**This does not move the failure rate and the harness was not re-run to prove
it twice.** Entry 024 measured a ~30% query cut against the flake and found
median failures identical, because the ceiling is crossed by whichever test is
unlucky rather than by the slowest one.

**Two of this session's own hookify rules fired during the work.** One wrongly —
`grep -n "bun test" f | head` matched the piped-`bun test` pattern, because a
quoted argument containing a command is indistinguishable from the command; now
anchored at a command position. One correctly — `git add -A`, reached for out of
habit, which is what the rule exists for.

Unchanged and unaddressed:

- **`flake/setup-off-budget` needs a port, not a merge.**
- **Two dead agent worktrees** under `labkit/.claude/worktrees/`.
- **Hookify rules do not propagate to new worktrees.**

## Next

`perf/query-loops` is PR #7, open.

The remaining edge writes still pay the duplicate check, correctly — they reach
nodes that existed before the call. Cutting those needs a savepoint, which costs
the round trips back, so there is no obvious next step on query count.
`docs/TASKS.md` no longer names one.
