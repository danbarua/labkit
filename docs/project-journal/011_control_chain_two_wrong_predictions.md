# PJ-011: The control chain under pressure — two predictions, wrong in opposite directions

**Status: implemented (2026-08-19), on `spike/drizzle-age`. S-17 and S-3
complete; row A refuted, row U added and resolved, row V recorded and
deliberately unresolved.**

## Context

Four cold reviewers had just observed (PJ-010) that
`Criterion`/`CriterionEvaluation`/`Gate`/`Task` were inherited from PJ-001's
design exercise and had never met a scenario — and that PJ-004 #9 had
*reshaped* that chain by argument rather than by demonstration. S-17 and S-3
are the first two scenarios to exercise it.

They are also the first two scenarios where PJ-008's predictions could be
checked against a build, and both were wrong. Usefully, they were wrong in
opposite directions, which says more than either would alone.

## 1. S-17 was predicted to pass unchanged. It needed a new edge.

PJ-008's expressibility note reads: *"Predicted to pass: PJ-004 #9 already
reshaped this chain so nothing flows out of a gate that no evaluation
triggered."*

Half of that held. `gateStatus()` reports three — now four — states and
checks absence *first*, so a gate nobody has evaluated can never fall through
to "satisfied". PJ-004 #9 genuinely bought what it was supposed to.

The half that failed: the same reshaping made the governing criterion
reachable from a gate **only** through a `CriterionEvaluation`. For a
declared-but-unevaluated gate — precisely S-17's subject — there is no path
at all. The gate is an orphan that protects work while recording no condition,
and the reviewer's actual demand ("show me evidence it fails when the
protected artefact is wrong") cannot even be aimed at a criterion.

Demonstrated rather than argued, per the bar: `criterionGoverning()` returned
`null` on a declared gate, and the scenario test failed structurally before
the edge existed. `GOVERNS: Criterion → Gate` added, direction matching the
rest of the chain so the control path reads left to right.

The edge got a load-bearing reader rather than a decorative one: *"has this
guard ever been shown able to fail?"* is a question about the criterion's
power to discriminate, so it is answered across every evaluation of the
governing criterion — tested with one criterion governing two gates, where
failing on one makes the other's guard demonstrated while that gate itself
remains never-evaluated.

## 2. S-3 was predicted to need a schema change. It didn't.

PJ-008 called row A **"the strongest single prediction in this document"**:
that `CriterionEvaluation.outcome` being binary `pass`/`fail` could not carry
S-3's honest state, which is neither "effect confirmed" nor "null confirmed".

Refuted. The row's own named no-change route was correct: the individual
checks really did pass and fail, and inconclusiveness belongs one layer up.
This is the second prediction to dissolve rather than confirm — row B was the
first — and like row B it stays in the ledger, because a prediction that
fails to materialise is a result.

What carries it is entirely **derived**, nothing stored:

- **Four gate states** — `never-evaluated` / `incomplete` / `blocked` /
  `satisfied`. The ordering is the substance: absence is checked before
  satisfaction (S-17's rule), and failure before incompleteness, because a
  failure is decisive regardless of what remains unrun.
- **Per-criterion itemisation with `never-run` as a first-class value.** S-3
  requires a failed check to be distinguishable from a check nobody
  performed, and an absent list entry cannot carry that difference. This is
  the same shape as row I, and it held for the same reason: absence is a
  state, not a synthetic failure.
- **A failure sticks.** Re-running a failed check until it passes does not
  clear it — the p-hacking shape the scenario exists to resist. Tested.

Row **J** (deferred versus accepted-as-permanently-unresolved) was brushed
here and not settled; S-14 owns it.

## 3. What the two scenarios forced jointly, and neither alone

Criterion-scoped state and gate-scoped state are different questions:

```
gate-scoped        has this condition been checked FOR this gate?
criterion-scoped   has this check ever been shown able to fail?
```

One criterion can govern several gates and be evaluated separately against
each — the same hash check run against staging and against release. Building
S-3's multi-criterion itemisation, both collapsed into criterion scope, and a
gate nobody had evaluated began reporting as **blocked** because its criterion
had failed somewhere else.

An S-17 assertion caught it. That is the argument for keeping earlier
scenarios running as scenarios rather than retiring them once green: S-17
alone never needed the distinction, S-3 alone never noticed it, and the
regression was invisible to both in isolation.

Two smaller corrections fell out of the same work: gates became
multi-criterion (`declareGate` took one, and `criterionGoverning` returned
`rows[0]`, which would have silently picked one of S-3's three prespecified
checks).

## 4. Row V — recorded, not picked

S-3's demonstrated wrong answer: with two prespecified robustness checks
failed, `whySupported()` still reports the finding `supported: true`. That is
"some evidence exists", not "the evidence holds up by its own prespecified
standard" — PJ-001's *"should not confuse … a missing evaluation with a
pass"* failing in a new place. Criteria gate downstream work; they do not
qualify the finding they were specified for.

**S-3 does not discriminate between the two available fixes**, because its
criteria do both jobs at once. Either:

- `Criterion -[:QUALIFIES]-> EvidenceUnit` — criteria attach to the
  inferential activity they were specified for; or
- extend `GATES` so a gate can gate a `Claim`'s standing — "this claim does
  not count yet" is a policy consequence, which is what a `Gate` already is.

A scenario in which criteria qualify a finding but gate nothing, or the
reverse, would decide it. Until one exists, the row is recorded with both
models named.

A speculative `criteriaQualifying()` verb was written to probe this and then
**removed**. Shipping API for an undecided model is the same error as
shipping the edge for one, and it would have been a query that could never
return anything. The wrong answer is instead asserted as current behaviour in
the scenario, so a future fix breaks that test on purpose rather than letting
it drift.

## 5. A sharpening of the evidence bar

PJ-009 set the bar: a new relationship requires a service query that returns a
**wrong** answer without it. S-3 sharpened what counts.

`criteriaQualifying()` returned `[]`. That is *unanswerable*, not *wrong* — it
proves only that nothing was recorded, which is true of any question the model
has never been asked. `whySupported()` returning `supported: true` for a
finding whose own prespecified checks failed is *wrong*, and it is the thing
that actually clears the bar.

The distinction matters because empty results are cheap to manufacture: any
missing feature produces one. Only a confidently incorrect answer demonstrates
that the model is claiming something it cannot support.

## 6. A policy decision recorded: no cull

An earlier expectation was that unused graph schema objects would be culled at
the end of this modelling phase. That is now explicitly **not** the plan.

Provisioning every label up front — originally done so additive
reconciliation could reach tenants provisioned before a change shipped
(PJ-005) — turns out to have a second property nobody designed for: the
schema declares what *could* exist, so what is declared-but-never-walked is a
computable map of where the model has claims it has never tested. `CHALLENGES`
sitting empty in every tenant is currently the only durable record that the
model claims evidence can challenge a claim and that nothing ever has.

Culling would erase exactly that. Empty labels are not dead weight during
domain discovery; they are the frontier. The cull, if it happens, should
distinguish *ruled out by the corpus* from *not yet reached by it* — a
different operation with a different bar.

## Judgment calls

- **Both wrong predictions were kept in the ledger**, not corrected away.
  Rows A and B now both record predictions that failed to materialise, and
  row U records one that did. The value of the ledger is that it holds all
  three kinds.
- **Nothing about row V was decided.** Two models are named and neither is
  implemented, because the scenario that could discriminate between them has
  not been built. This is the third time the project has stopped at "the
  evidence does not distinguish these" rather than picking.
- **The four gate states are derived, not stored.** No `Gate.status` field
  exists, so there is no invariant to maintain and no value anyone can set to
  "passed". Structure went into the query and the stored model stayed thin —
  which is the pattern this project appears to be converging on rather than
  a rule anyone imposed.
- **S-17's tests were kept running rather than retired**, which is what
  caught the scope collapse in §3.
