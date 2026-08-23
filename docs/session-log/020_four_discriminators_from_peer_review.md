# 020: four discriminators from peer review — three fire, one refuted

**Session wrap, 2026-08-24, on `feat/mcp-server`.** Not a decision record —
PJ-008 §3's ledger carries the outcomes (rows AF, AG), and each finding lives
in the scenario file that demonstrates it.

**The range is wider than this entry.** The pinned baseline is `72dbe15` and
covers thirteen commits across four entries. This one covers `37a9db9..ec53f24`
only. 017, 018 and 019 hold the rest.

## Goal

Act on the external peer review posted to PR #2: four proposed discriminators,
each with a concrete probe, against rows the queue had been carrying as
"needs a discriminator".

## Changed

Four commits, one per discriminator, each built probe-first: write the test
asserting correct behaviour, watch it fail, fix, watch it pass.

**`37a9db9` — `interpretationHistory` walked by wording.**
`tests/scenarios/s12b_two_chains_one_wording.test.ts`. Two independent revision
chains passing through one sentence: both histories threw `is not a single
line`, refusing a legitimate ask. The fix is a query change — the chain was
already traversable by identity through `MOTIVATES`/`CHANGES`, which refutes
the queue row's claim that it "wants the revision chain to carry an edge". The
guard now means the history *merges*; `seen` is seeded with the entry claim;
`restingOnTheOldReading` is scoped to the withdrawn claim's own enquiry.
`WHERE nxt.natural_id IN $ids` with an agtype list works against this backend.

**`024d758` — a replacement consuming the output it invalidated.**
`tests/scenarios/s11e_replacement_reads_what_it_invalidated.test.ts`. Both
halves fire: `unaffected` asserted "not produced by the replaced analysis"
about the artefact that analysis produced, and `whySupported` returned
`supported: true` over a sole input the same act retracted. Remedy is
visibility, not propagation — `IdentifiedArtefact` and `UnaffectedRecord` carry
`invalidated?: true`, `why` is computed. The filed refusal was **not** built,
and why is in the commit message.

**`f449b38` — Row AF, input order.**
`tests/scenarios/s10d_reversed_inputs_one_execution.test.ts`. `reproduction_of`
called a reversed rerun of "first input minus second" a reproduction, with the
two runs at +0.4 and −0.4. `execution` gains `inputs-unordered`.

**`ec53f24` — the `ART_` row, refuted.**
`tests/scenarios/s11f_a_computed_input_is_not_measurement.test.ts`. No reader in
`src/` branches on `Artefact.kind`. PJ-008 §3 updated: AF resolved, AG added and
refuted, and one dead `check:ledger` claim removed from the legend.

Working tree clean; all four pushed. The reply is posted to PR #2 as
[comment 5389053466](https://github.com/danbarua/labkit/pull/2#issuecomment-5389053466).

## Verified

Full run after `ec53f24`: **317 pass, 0 fail**, 317 tests across 45 files,
105.73s. `bun run typecheck` clean. `npx depcruise src tests --output-type err`
— `no dependency violations found (97 modules, 322 dependencies cruised)`.
`check:doc-comments`, `check:tests-assert` and `check:stdout` all OK.

Not run: `check:migrations` (no `drizzle/` change),
`bun examples/full-lifecycle.ts`, `check:pglite-concurrency`.

Two intermediate full runs failed 7 and 8 tests, all at bun's 5000ms ceiling
plus one 1229ms cascade off an abandoned test, at 268s and 291s against 105–133s
for a clean run. The files involved passed in isolation both times (27/0 in
6.76s; 28/0 in 7.20s). Discriminated by failure mode, as CLAUDE.md instructs.

## Open

**One live contract decision, made here and worth a second opinion.** Row AF
was settled by declaring `from`/`under` semantically unordered and having the
report stop claiming execution identity it cannot check. The other branch —
ordering as part of execution identity, a position on `CONSUMES` — now clears
the wrong-answer bar and is deliberately not foreclosed. The cost of the choice
is asserted in S-10d: `reproduction_of` declines for **every** multi-input run,
including a genuinely identical one, because LabKit cannot tell an
order-sensitive method from any other.

**Left alone on purpose:** two `bun run check:ledger` mentions in PJ-008's
dated reasoning prose (lines ~751, ~1332) describe a script deleted on
2026-08-22. §3's table and legend are live state and were corrected; the prose
below them is a dated record and CLAUDE.md says not to.

## Next

`docs/TASKS.md` has nothing under "Ready to build" or "Needs a discriminator" —
only the deprioritised suite-ceiling item and the "deliberately not being done"
list. There is no queued work.

The two obvious candidates, neither queued: PR #2 is ready for a merge decision,
and the suite-ceiling flake is the only thing that makes a full run's result
need interpreting. `docs/TASKS.md` records what has already been refuted about
it and names three unbuilt approaches — do not re-investigate from scratch.
