# PJ-019: Re-verification is not reproduction — clearing row E

**Status: implemented (2026-08-19), on `spike/drizzle-age`. Covers S-10
(`dd5c683`), promoted from §2 — the first **mined** scenario since S-8. Row E
resolved with one new edge; row P predicted to fire and did not. Verification at
the time of writing: 159 pass / 0 fail, typecheck clean, `npx depcruise src
tests --output-type err` 0 errors, `bun examples/full-lifecycle.ts` ends `closed
connection cleanly` with no raw graphids.**

## Context

S-3b and S-3c were both authored rather than promoted, and PJ-018 flagged that
the precedent had become load-bearing twice. S-10 was chosen partly to give the
corpus its turn as an independent check, and partly because it was the only
unbuilt corpus scenario that *solely* owned an open row.

The story: a historical result whose initial conditions were never written down.
The protocol can be run again, but not reproduced — the new run specifies its
own conditions, so agreement between the two is agreement between two different
executions. Disagreement would not be evidence against the original either.

## The trap, and why it was written down first

Row E's natural failure mode is an **empty** answer. "What re-verifies this
claim?" has no edge to walk and returns nothing, and under PJ-011 §5 that earns
no edge — unanswerable is what every question the model has never been asked
looks like.

So the predictions (`e1665bf`) named, before the build, both where a *wrong*
answer would live if there was one and the honest outcome if there wasn't:

> If every probe comes back empty rather than wrong, the honest outcome is
> **row E stays open with no edge added**.

That mattered more than usual here, because the fallback route the ledger had
recorded for row E — "both support the same claim; execution differences live on
the computation" — is not a hypothetical alternative. It is what the model
already did.

## The demonstration

Recording the re-run the only way the model allowed — an analysis in the same
line of enquiry concluding the same proposition — makes it ordinary support.
S-5's scope rules then resolve both to one claim, and `whySupported()` reports
the proposition resting on **two independent findings**.

It rests on one, checked twice, by a run that specified initial conditions the
original never recorded. A historical claim reporting itself independently
corroborated by an execution nobody reproduced: populated, plausible, and wrong
in the direction that matters. Not an empty answer, and not an ugly query path.

What the shared-claim encoding cannot carry is **direction** and **caveat** —
which run re-checked which, and that the two executions are not the same. Two
genuinely independent analyses in one line of enquiry are indistinguishable from
a re-verification without that, and those are different scientific situations.

## What shipped

`REVERIFIES: Evidence → Evidence`, written by `reverify()` and read by both
`reproductionOf()` and `whySupported()` in the same commit. Deletion-verified:
remove the write and all five Afterward assertions fail, `whySupported()` among
them, reverting to two independent supports.

Three judgment calls inside that.

**Evidence-level, not unit-level.** A re-run checks a *finding*: one analysis
may re-verify one of several conclusions and say nothing about the others.
`EvidenceUnit → EvidenceUnit` is the relationship to reach for if a scenario
ever re-runs an analysis as an indivisible thing; nothing has.

**Two verdicts, deliberately not one.** `reproductionOf()` reports `conclusion`
and `execution` separately, and `confirms` is false whenever the execution was
not reproduced however well the numbers agree. Collapsing them into a single
boolean is the mistake the scenario is named after. "The original recorded
nothing" is reported as `unrecorded-in-the-original`, never as agreement — row
I's absence-versus-difference distinction, asked of execution instead of
evidence.

**`recordAnalysis()` was NOT made to refuse the old shape.** This is the
deliberate contrast with S-3b, where `declareGate()` was made to refuse a gate
protecting nothing. There, the shape being refused asserted something that could
not be true. Here, recording two analyses over one proposition is a claim of two
independent results — real, and sometimes correct. What was missing was a way to
say the *other* thing, not a way to stop saying this one. The scenario keeps the
old shape as its first test, so the identical pair of executions recorded two
ways gives two different answers, and that difference is the finding.

## Two predictions wrong

**Row P was predicted "likely to fire" and did not.** The prediction was that a
re-run "under newly specified initial conditions" would force an observation to
stand as evidence — the conditions being a *result* of the new run in a way the
model had no place for. It did not: `reproductionOf()` reads what each run
consumed as **artefacts**, through `CONSUMES`, and never touches the
observation's `Evidence` node. The conditions are an input, and the model
already had a place for inputs.

Both cold-review claims behind row P remain true of the code — verified at
`7e36b31` before predicting around them. What S-10 removes is one of the two
routes by which they were expected to become a wrong answer. Row P stays open
with S-9 as its only unbuilt owner.

**The refusal prediction was wrong in kind, and this is the portable half.**
"Can the two be compared numerically?" was predicted to land as a refusing verb,
on S-5's precedent — a command that declines beats an answer about something the
caller did not mean. It landed as two fields on the report instead, because
LabKit has nothing that plots or compares numbers. A `compareNumerically()`
existing only to reject its arguments would be a feature invented in order to
refuse it, which is PJ-011 §5 read from the other side: a missing feature
manufactures an empty result, and an invented one manufactures a refusal.

> **A refusal needs something real to refuse.**

S-5's pattern applies to a verb a caller would otherwise use wrongly. Where no
such verb exists, the caveat has to travel with the report a reader already asks
for, or it does not travel at all.

## Ledger

- **Row E — resolved.** `REVERIFIES` earned, demonstrated, deletion-verified.
- **Row P — still open**, prediction refuted, S-9 its only unbuilt owner.
- No row is currently a live defect shipping green. `open` and unowned: O, S, T,
  Z. `open` with an unbuilt owner: F, J, K, P.

## What this did not settle

**The noun inventory still has not moved.** Twelve scenarios, zero new node
labels, zero migrations. This one added an edge, which is the fourth consecutive
scenario to press only on relationships and query semantics. PJ-018's closing
question stands unanswered and is now slightly sharper: either PJ-001's entity
set was unusually well chosen, or the corpus is not applying the kind of
pressure that would move it.

**Whether `reverify()` is one verb or two.** It composes `recordAnalysis` plus
one edge and emits a single event, which is the rule for a composed verb. But
nothing yet distinguishes "re-verify a finding" from "re-run an analysis
wholesale", and S-9 — which re-generates an artefact whose provenance is partly
unrecoverable — is close enough to that question to be worth watching.
