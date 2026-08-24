# 020: four discriminators from peer review — and one of the fixes reversed

**Session wrap, 2026-08-24, on `feat/mcp-server`.** Not a decision record —
PJ-008 §3's ledger carries the outcomes (rows AF, AG), and each finding lives
in the scenario file that demonstrates it.

**The range is wider than this entry.** The pinned baseline is `72dbe15` and
covers fifteen commits across four entries. This one covers `37a9db9..4973210`.
017, 018 and 019 hold the rest.

## Goal

Act on the external peer review posted to PR #2 — four proposed discriminators,
each with a concrete probe — and then on Dan's review of what that produced.

## Changed

Five commits. Each discriminator was built probe-first: write the test
asserting correct behaviour, watch it fail, fix, watch it pass.

**`37a9db9` — `interpretationHistory` walked by wording.**
`tests/scenarios/s12b_two_chains_one_wording.test.ts`. Two independent revision
chains passing through one sentence: both histories threw `is not a single
line`, refusing a legitimate ask. Fixed by a query change — the chain was
already traversable by identity through `MOTIVATES`/`CHANGES`, which refutes the
queue row's claim that it "wants the revision chain to carry an edge". The guard
now means the history *merges*; `seen` is seeded with the entry claim;
`restingOnTheOldReading` is scoped to the withdrawn claim's own enquiry.
`WHERE nxt.natural_id IN $ids` with an agtype list works against this backend.

**`024d758` — a replacement consuming the output it invalidated.**
`tests/scenarios/s11e_replacement_reads_what_it_invalidated.test.ts`. Both
halves fire: `unaffected` asserted "not produced by the replaced analysis" about
the artefact that analysis produced, and `whySupported` returned
`supported: true` over a sole input the same act retracted. Remedy is
visibility, not propagation — `invalidated?: true` on both records, `why`
computed. The refusal that had been filed was deliberately not built.

**`f449b38`, then reversed by `4973210` — input order.** See below; this is the
one that did not survive review.

**`ec53f24` — the `ART_` row, refuted.**
`tests/scenarios/s11f_a_computed_input_is_not_measurement.test.ts`. No reader in
`src/` branches on `Artefact.kind`. PJ-008 §3 updated: AF resolved, AG added and
refuted, and one dead `check:ledger` claim removed from the legend.

**`4973210` — `execution` and `comparable` removed.** Dan: *"LabKit is
bookkeeping. Interpreting the books is for the human/AI collaborators. Execution
and Comparable are scope creep."* Both fields were LabKit adjudicating —
`execution` inferring that reading the same records constitutes the same run,
`comparable` deciding whether two sets of numbers may be put side by side. The
day's earlier fix had made `execution` *hedge* that inference with a third value
rather than stop making it. `reproductionOf` now reports `verificationRead` and
`ofRead` — what each run read, in order — beside `differs`, and adjudicates
nothing. `CONSUMES` carries `position`, because `recordAnalysis({ from })` took
an ordered array and the record threw the order away.

Working tree clean; all five pushed. Two comments on PR #2: the
[findings](https://github.com/danbarua/labkit/pull/2#issuecomment-5389053466)
and the
[correction](https://github.com/danbarua/labkit/pull/2#issuecomment-5389211719).

## Verified

Full run after `4973210`: **317 pass, 0 fail**, 317 tests across 45 files,
109.57s. `bun run typecheck` clean. `npx depcruise src tests --output-type err`
— `no dependency violations found (97 modules, 322 dependencies cruised)`.
`check:doc-comments`, `check:tests-assert` and `check:stdout` all OK.

Not run: `check:migrations` (no `drizzle/` change),
`bun examples/full-lifecycle.ts`, `check:pglite-concurrency`.

Three intermediate full runs failed 7, 8 and 15 tests. Every failure was a
5000/10000ms ceiling timeout or a cascade off an abandoned test, at 268s, 291s
and 313s against 105–133s for a clean run; the files involved passed in
isolation each time (27/0 in 6.76s, 28/0 in 7.20s, 51/0 in 23.00s).
Discriminated by failure mode, as CLAUDE.md instructs.

## Open

Nothing outstanding from this work. The contract question this entry previously
listed as open — whether `from`/`under` are ordered — was settled by Dan the
same day and is recorded above.

**Two corrections are recorded in place rather than quietly dropped**, both in
PJ-008 row AF and in `tests/scenarios/s10d_*`:

- The probe that convicted the record was doing what it convicted the record of.
  It ran "first input minus second" so reversing would flip the sign, then
  treated +0.4 and −0.4 as obviously different results — which depends on the
  question, and is the researcher's to answer.
- The correction written into row AF earlier that day said the original cell
  "was wrong about its own case". It was not, much. What it missed was smaller
  than the correction claimed: not that the row earned a change, but that a
  neighbouring field made an inference on the reader's behalf.

The distinction worth keeping: `gateStatus` and `whySupported` compute verdicts
too and are fine, because they are arithmetic over verdicts a human recorded.
Nobody recorded "reversing the inputs doesn't matter".

## Next

`docs/TASKS.md` has nothing under "Ready to build" or "Needs a discriminator" —
only the deprioritised suite-ceiling item and the "deliberately not being done"
list. There is no queued work.

Two candidates, neither queued: PR #2 is ready for a merge decision, and the
suite-ceiling flake is the only thing that makes a full run's result need
interpreting — `docs/TASKS.md` records what has already been refuted about it
and names three unbuilt approaches, so do not re-investigate from scratch.
