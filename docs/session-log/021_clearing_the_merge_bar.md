# 021: clearing the merge bar

**Session wrap, 2026-08-24, on `feat/mcp-server`.** Not a decision record — the
two findings live in the scenario files that demonstrate them, `S-10e` and
`S-18b`.

**The range is wider than this entry.** The pinned baseline is `72dbe15` and
covers seventeen commits across five entries. This one covers `e61ff50` alone;
017-020 hold the rest. Entry 020 ends by saying PR #2 was ready for a merge
decision — this is that decision coming back *"do not merge yet"*, and what it
took to clear.

## Goal

Act on the external reviewer's merge-decision review of PR #2: two blockers,
each with a probe written out, plus three contract fixes and the PR body.

## Changed

One commit, `e61ff50`. Both blockers were built probe-first and both fired
exactly as predicted.

**`tests/scenarios/s10e_the_same_input_twice.test.ts` — duplicate inputs were
lost.** `createEdge` treats `(from, label, to)` as identity and a repeat as a
no-op, backed by a real `UNIQUE (start_id, end_id)` index, so `from: [A, B, A]`
stored two edges. `reproductionOf` then keyed inputs by artefact id, so a repeat
could not have survived the read either. One `CONSUMES` edge per distinct
artefact now carries `positions: number[]`; `reproductionOf` expands occurrences
in order for `verificationRead`/`ofRead` and keeps a by-identity map for
`differs`. `src/db/graph.ts` widened `createEdge`'s props to accept `number[]`.

The reviewer offered refusing `[A, A]` as the other legitimate outcome. Rejected,
and the reason is in the test: a null test compares a series against itself, so
declining to record one would be LabKit deciding a legitimate run is not
recordable — what `4973210` had just taken out.

**`tests/scenarios/s18b_a_promoted_negative_result.test.ts` — a promoted
negative result read as scratch.** `whatIsKnown`, `whatWasKnown` and
`enquiryStatus`'s `restsOn` all found the closing claim through `SUPPORTS` only,
so a question answered *no* on evidence someone had explicitly promoted reported
`restsOn: "exploratory"` and sat in `provisional`. Third appearance of this
assumption in a query path; `scopeOf` and `closeEnquiry`'s ownership check were
the first two. Two `OPTIONAL MATCH`es per site, since AGE has no edge
alternation. `whatWasKnown` still reads the `PROMOTES` decision rather than the
claim's current `kind`, which is right for now and wrong for any past instant.

S-18b carries a control the reviewer did not ask for: an **unpromoted** negative
result must still read `exploratory`. Without it the fix could have made every
closure look vouched-for and nothing would have caught it.

**Three stale contracts.** `reproduction_of` was still advertised as "Whether a
re-run reproduced its original" — the verdict removed in `4973210`.
`tools.ts`'s header still said nine commands were "a later pass"; they landed.
`server.ts` titled the generated resource "LabKit read tools" while it documents
writes. The PR description was rewritten to the branch's final state; it had
been claiming seven read-only tools, 287 tests, and that the tool docs had no
stored copy.

Working tree clean, pushed. Two comments on PR #2: the
[merge-bar reply](https://github.com/danbarua/labkit/pull/2#issuecomment-5389424798)
and, earlier, the
[correction](https://github.com/danbarua/labkit/pull/2#issuecomment-5389211719).

## Verified

`bun test` — **323 pass, 0 fail**, 323 tests across 47 files, 111.36s.
`bun run typecheck` clean. `npx depcruise src tests --output-type err` —
`no dependency violations found (99 modules, 329 dependencies cruised)`.
`check:doc-comments`, `check:tests-assert` and `check:stdout` all OK.

Not run: `check:migrations` (no `drizzle/` change),
`bun examples/full-lifecycle.ts`, `check:pglite-concurrency`.

## Open

**Three background agents were dispatched at the suite-ceiling flake and their
work is not on this branch.** Each has its own worktree and branch:

- `flake/current-no-reprovision` — **reported.** `current()` reused the
  `TenantContext` `begin()` already resolved instead of re-resolving, so it no
  longer runs a full reconciliation pass per call. One file
  (`tests/helpers/scenario.ts`), `src/db/` untouched, its own full run green.
  It explicitly did **not** claim a performance result.
- `flake/setup-off-budget` — moving `scenario.begin()` out of test bodies into
  `beforeEach`, where bun runs it outside the per-test timeout. Still running
  when this was written.
- A profiling agent, no code change, quantifying where a crossing test's time
  actually goes. Still running when this was written.

**The measurement is deliberately not theirs.** Machine load *is* the
phenomenon — identical code ran 105s and 430s on the same day — so concurrent
full-suite runs would corrupt every arm. Whoever picks this up should measure
the candidates serially, paired and interleaved, one variable, on a quiet
machine, and remember that `docs/TASKS.md` records an earlier fix that passed
round one on both arms and failed at the lowest load of four.

## Next

The merge bar is clear and the reviewer's stated condition was that the two
regressions go green for principled reasons, which they do. **PR #2 is Dan's
merge decision.**

Then the flake: collect the three agents' branches, measure them serially as
above, and take whichever survives. Nothing else is queued —
`docs/TASKS.md` has nothing under "Ready to build" or "Needs a discriminator".
