# Row AD — predictions, recorded before the build

**Written 2026-08-21 against `dc787bf`, before a line of source.**

Row AD is the first row in this project to be built from a **demonstrated wrong
answer** rather than from a gap. The discriminator already exists — S-9b's
seventh test — so unlike rows Z and F there is no rung 1 to build and show
failing. What is unbuilt is the fix, and that changes what predictions are for
here: not *does this bite*, but *how far does the blast radius reach*.

## The defect, stated exactly

`recordObservations()` creates an `Artefact` and an `Evidence` and no
`EvidenceUnit`. PJ-001 defines `Evidence` with no producing unit as impossible.
`whatIsKnown()` decides `worked` from
`(q)-[:MOTIVATES]->(:LineOfEnquiry)<-[:ADDRESSES]-(u:EvidenceUnit)`, so a
question pursued only through observations reports itself **`untested`** — *"one
nothing has ever been run against"*. Populated, confident, false.

Three cold reviewers flagged the missing unit and three scenarios found no harm
beyond a reader's. The deferral was right each time. S-9b is the fourth.

## Predictions

| Question | Prediction |
| --- | --- |
| **Shape of the fix** | **One node and two edges**, inside `recordObservations`: an `EvidenceUnit`, `ADDRESSES` to the enquiry, `PRODUCES` to the evidence. No new label, no new edge type, **no migration** — twenty-six journal entries and still zero |
| **A `Computation`?** | **No.** An observation records a measurement LabKit did not run, and minting a computation to make the shape match the analysis path would invent execution state that never existed. Predicting this is also what keeps the blast radius small — see below |
| **Blast radius** | **Exactly one read changes behaviour: `whatIsKnown()`'s `worked`.** `whySupported()`, `findingsBearing()`, `decidedOnTheStrengthOf()` and `enquiriesClaiming()` all reach a unit only through `Evidence -SUPPORTS\|CHALLENGES-> Claim`, and observation evidence has neither edge. `findingsBearing()` and `reproductionOf()` carry a second guard, a required `MATCH (u)-[:USES]->(comp:Computation)`. `whatDependsOn()`'s input route needs a computation too. Predicting all of them unchanged |
| **`role`** | Predicting I will want to add `"observation"` to `EvidenceUnitRole`, and that **it would be wrong**. That union has **nine values, one writer and no readers** — `role: "analysis"` at `write.ts:318`, read by no query in `src/`. Adding vocabulary to a union nothing consumes is the dead-code shape PJ-007 found in `buildAsClause`, and the no-cull policy does not protect it: that policy protects *labels and edges*, which are claims about the domain, and the CQRS views were removed on exactly this distinction. Predicting an existing value is reused and the finding recorded |
| **Atomicity** | Predicting `recordObservations()` **must become transactional**, and that this is the sharper half of the fix. It writes two nodes and two edges today with no transaction; after the change, a failure between the evidence and the unit produces *precisely the invariant this row exists to fix* — an `Evidence` with no producing unit — durably, rather than as a design oversight. Predicting no existing test catches this and that a negative test is needed, as every other compound verb has |
| **Which tests break** | Predicting **1–3**, all of them asserting `untested` where the question is now `unresolved`. Predicting S-9's Afterward 4 is **not** among them: its observations are recorded against the *original* enquiry, so the provenance question genuinely has no work and must stay `untested`. If Afterward 4 breaks, the fix has over-reached |
| **The wrong answer I expect to write** | Wiring `PRODUCES` from the unit to the **artefact** as well as the evidence, because `recorded()` does both. There the artefact is an analysis *output* the unit brought into existence; here the artefact **is** the observation record, and the unit did not produce the measurement — it is the activity of taking it. Predicting the temptation and predicting the answer is evidence only |
| **Second-order risk** | That `untested` becomes unreachable in practice — if every question with any work at all now has a unit, the three-state survey may collapse to two in every realistic record. Predicting it does **not**: `untested` means nothing has addressed the enquiry, and a question posed and pursued with no work recorded is still ordinary |
| **What would refute all of this** | Minting the unit does not move the question to `unresolved` — then the diagnosis in `028` is wrong and the cause lies elsewhere |

## The bar, which is already met

This is the one row that does not have to argue for itself. PJ-011 §5 wants a
confidently incorrect answer and S-9b has one on the record, asserted on purpose
with the assertion it *should* make sitting in a comment beside it. CLAUDE.md
permits one such row and requires clearing it be the next thing built, and
`bun run check:ledger` now fails if a second appears.

So the risk here is not building something unearned. It is **fixing more than
was demonstrated** — the shape of over-reach being a change that also alters
`whySupported` or the reproduction verdict, neither of which S-9b says anything
about.

## Success and failure, stated now

**Success:** S-9b's seventh test **inverts** — the question reads `unresolved`,
not `untested` — its shape detectors still pass, and no other test changes
meaning. The ledger row moves from `demonstrated` to `resolved` and
`check:ledger` reports no demonstrated row.

**Failure that still counts:** the blast radius is wider than one read, and the
prediction table says so before the build rather than after. Every extra read
that changes is a place the model was relying on the missing unit, which is
worth more than a clean sweep.

**Failure that does not count:** inverting the test by changing what the test
asserts rather than what the code does. The inversion must be exactly the two
lines already written in the comment beside it.
