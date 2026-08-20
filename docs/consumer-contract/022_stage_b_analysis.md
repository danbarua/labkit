# Stage B: what the ablation measured

**Written 2026-08-20 by the implementing session**, after `013`/`014`/`015` were
committed, against frozen text.

Stage B asks one question: **which concepts did designers reach from researchers'
own words, and which appeared only once LabKit's design vocabulary was supplied?**
Anything in the second group is worth less, because the material suggested it.

## The ablation works, and here is the proof

**Designer 3 had no concept of a decision until Stage B supplied one.** Its
revision says plainly: *"Glossary. Adds **Decision**. Does not split Claim."* —
caused by PJ-001's *"what claims, decisions, and open lines of enquiry become
affected?"*

`Decision` is one of LabKit's thirteen node labels and among the load-bearing
few: it carries closure, deferral, amendment, withdrawal and promotion. A cold
designer working from eighteen researcher statements did not reach for it. One
sentence of PJ-001 produced it immediately.

That is the clearest available demonstration that the two-stage split measures
something real — and a caution about how much of PJ-001's should/should-not list
is ontology wearing the clothes of behavioural constraint. It was withheld for
exactly that reason, and the withholding was justified after the fact.

## All three revised the same refusal, and it is not a gap

Every designer had refused telemetry questions too broadly at Stage A, and every
one narrowed it at Stage B against MVP question 1 — *"the evidence supporting
Claim C7, the computations that generated it, and the relevant run metrics"*.

D1 adds a **Run reference** concept; D2 exposes *"linked run telemetry without
making LabKit a metrics system"*; D3 returns *"links to external runs/telemetry
… handles, not numbers. The numbers are not LabKit objects. The link is."*

**LabKit already has this**, verified rather than recalled — `ComputationProps`
carries `external_run_id`, `backend`, `code_revision` and `environment_ref`
(`src/db/domain.ts:342`). No gap, and it would have been discounted regardless
as a Stage-B-only concept.

Worth noting what it says about Stage A instead: three designers *independently
over-refused* the telemetry boundary. The W&B/MLflow line in the fresh boundary
statement was drawn hard enough that all three read it as forbidding even a
pointer. That is a fact about the packet, not about LabKit.

## No new bar-2 candidate. The four from Stage A stand.

Nothing in the three revisions produces a pair of worlds indistinguishable in
durable state that Stage A had not already produced. The four candidates in
`021` — attribution, temporal ordering, bitemporality, reconstruction target —
**all arose at Stage A**, uncontaminated, which is the stronger of the two
available outcomes and was recorded before this run could muddy it.

## One new candidate, at bar 3 rather than bar 2

**D2: an absent dependency path must not be reported as independence.**

> Replace the unqualified `unaffected` category with: *unaffected within a
> declared dependency boundary*; *no recorded dependency found; exhaustiveness
> unknown*; *potentially affected because provenance or dependency coverage is
> incomplete*. … "Unaffected" is defensible only when the relevant dependency set
> is known to be complete for the stated subject and relationship types.

This is **row I's absence-versus-difference distinction applied to dependency
propagation**, and it is a defect of a kind this project takes seriously: a
confidently empty result read as a positive claim of independence.

It does **not** pass bar 2. No two worlds are indistinguishable in durable
state — the edges are all there. `whatDependsOn()` simply walks a fixed set of
routes and lets everything it did not reach read as unaffected. That is an
answer-shape problem, so it sits at the **first tier of the change bar: query
semantics**, which is where row P was resolved after two builds predicted it
needed structure.

It is also the third time this exact verb has been caught: PJ-021 found
`whatDependsOn()` returning `claims: []` for an input while still naming the
enquiry — populated, confident and wrong. Same verb, same failure family, found
this time by someone who had never seen it.

**Not implemented.** It needs a demonstration first, in the project's own terms:
a scenario where a reader acts on "unaffected" and is wrong.

## Standing after both stages

| Candidate | Designers | Stage | Bar | Ledger |
| --- | --- | --- | --- | --- |
| Attribution / authority | 1, 2, 3 | A | passes 2 | row S |
| Ordering of belief over time | 1, 2, 3 | A | passes 2 | row Z |
| Bitemporality | 1 | A | passes 2 | extends row Z |
| Reconstruction target | 2 | A | passes 2 | row F |
| Unqualified `unaffected` | 2 | B | bar 3, tier 1 | row I family |
| Run reference | 1, 2, 3 | B | already exists | — |

Nothing above has been built. The next thing that would earn a change is a
demonstration, not another designer.

## The honest limit, restated

This was an ontology-blind contract derivation from the corpus the fifteen
scenarios already came from. It was **not** the consumer PJ-023 called for, and
being read-only it cannot validate the strongest candidate — attribution is a
write-side concept. The real pressure begins when this contract is implemented as
a thin read surface and has to answer something it cannot.
