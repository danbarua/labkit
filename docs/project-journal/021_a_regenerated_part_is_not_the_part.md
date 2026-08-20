# PJ-021: A regenerated part is not the part — row P resolved, row F half-settled

**Status: implemented (2026-08-20), on `spike/drizzle-age`. Covers S-9
(`b55ff09`), promoted from §2. Row P **resolved** against two consecutive
predictions that it would not move; row F **half-settled and still open** — this
entry first declared it refuted and external review corrected that, recorded
below rather than edited away. Verification at the time of
writing: 173 pass / 0 fail, typecheck clean, `npx depcruise src tests
--output-type err` 0 errors.**

## Context

S-9 was the last unbuilt scenario owning an open row outright — sole owner of F,
and row P's only unbuilt owner. Its story is a cached construction that mostly
rebuilds: three components come back byte-identical, and the historical random
control does not, because whatever generated it was never written down. The
researcher then asks for the thing the record must not let happen quietly —
infer the old algorithm, regenerate the part, carry on.

## Row F: half-settled, and the half this entry got wrong

**What S-9 settled: identity.** Two artefacts can legitimately share a
`logical_name`; a regenerated part carries the name of the part it replaces; and
refusing an ambiguous name is enough to stop the regenerated one inheriting the
historical one's dependants. No lineage edge was needed for that, and the caveat
has a home — `whatIsKnown()` keeps the question in `untested` rather than letting
a workaround close it.

**What it did not settle: direction — and this entry first claimed otherwise.**
The original text argued a lineage edge was unnecessary because *"direction is in
the act: a regeneration knows what it regenerates."* External review pointed out
there is no such act. The regenerated part is written by an ordinary
`recordObservations()` naming nothing historical, and `reproducibilityOf()` is a
**read** that takes the historical parts as arguments and persists nothing. A
reader holding only the regenerated artefact cannot answer *what was this
reconstructing?*

That is an assertion of a durable property the code does not have — the same
error class this project has caught in itself repeatedly, made this time in a
journal entry rather than in code. The claim is left visible above rather than
quietly rewritten, because how the conclusion was reached is the part worth
keeping.

**Row F therefore stays `open`, now unowned**, with a boundary test in the
scenario recording the gap so it cannot be forgotten. No edge is added: nothing
has demonstrated a *wrong* answer requiring one, and an unanswerable question
earns nothing under PJ-011 §5. The discriminator would be a scenario where a
reader must **recover** what a reconstruction was reconstructing, and gets a
confidently wrong answer without it.

The contrast with row E, earned by S-10 one scenario earlier on the same test,
survives the correction and is sharper for it: there a shared claim could carry
neither direction nor caveat and the wrong answer was demonstrable. Here the
caveat has a home and the direction gap is so far only an absence. The bar
discriminating between a demonstrated wrong answer and a missing one is the
point — and it discriminated correctly even while the prose around it did not.

## Row P: resolved, against two consecutive predictions

Both S-10's predictions and S-9's own said this row would not move. It moved,
and the way it moved is worth keeping.

`whatDependsOn()` walked only `Evidence -RECORDED_IN-> Artefact`. That reaches an
analysis **output**, where the evidence recorded in the artefact bears on claims
directly — the path S-11 walks, and S-11 only ever asks about outputs. Aimed at
an **input**, which is exactly what "what depends on the unreproducible part?"
asks, it returned `claims: []` while still naming the enquiry.

Populated, confident, and wrong. One verb answering one question two
incompatible ways depending on which end of a computation it was pointed at.

**Resolved in the query, not in the model.** The fix walks the consumer route as
well — `Artefact <-CONSUMES- Computation <-USES- EvidenceUnit -PRODUCES->
Evidence`. No label split, no property added. The row's own note allowed for this
("may be correct minimalism"), with one correction: the minimalism was right
about *storage* and wrong about *reading*.

**What is not resolved**, and is now recorded as fact rather than carried as a
live prediction: `recordObservations()` still creates `Evidence` with no
producing `EvidenceUnit`, which PJ-001 defines as impossible, and
`whySupported()` still cannot count an observation as support. Three of four
cold reviewers flagged that independently and it remains true. What changed is
that it is no longer *owned* — three scenarios have been pointed at it and the
harm they found was a reader's, not a structure's. Something else will have to
demonstrate it.

## Identity by wording, sixth region

A regenerated part naturally carries the name of the part it regenerates. With
`whatDependsOn()` keyed on `logical_name`, asking about that name answers about
the union of both — which is, word for word, the Afterward bullet **"inferred
provenance must not silently inherit the original's standing."**

The remedy is S-5's, reaching artefacts for the first time: a name is accepted
while a name identifies one artefact, and **refused** when it does not, saying
how many. Declining beats answering about something the caller did not mean.

Two things about this being the sixth region rather than the first:

- The count is not evidence of sloppiness. Three of the six caught it at the
  time; this one did not, and the review before it did not. It is evidence that
  **every new comparison is a fresh chance to make it**, which is now the form
  the rule takes in CLAUDE.md.
- It nearly happened again *inside this build*. The first draft of
  `reproducibilityOf()` took its rebuilt hashes as a map keyed by
  `logical_name` — re-introducing the defect one function away from where it was
  being fixed, in the scenario about names colliding. Caught while writing the
  test, not by review. The signature now takes `{ part, hash }` pairs.

## `content_hash` gets its first reader

Declared in PJ-004, provisioned into every tenant since, written by
`recordObservations({ contentHash })`, and consulted by nothing. `reproducibilityOf()`
is its first reader.

The property earned it by keeping **three** outcomes apart, not two:

- `exact` — recorded hash matches the one the rebuild produced;
- `differing` — recorded hash disagrees;
- `unverifiable` — no hash was ever recorded, so nobody can say.

A part nobody can check is not a part that differs, and `reproducible` is false
for either — a construction with an uncheckable component has not been shown to
reproduce. Row I's absence-versus-difference distinction, asked of an artefact.

## Judgment calls

**No new node label**, and the scenario asked for none: it says explicitly that
it does not want a recovered-artefact type, and that if the general entities
cannot carry the story, *that* is the finding. They carried it.

**`whatDependsOn` was widened rather than split.** A second verb for inputs
would have made the caller decide which end of a computation they were asking
about, which is a question about the graph, not about the research. One verb,
both routes.

## The corpus question — and a false premise, corrected

This entry originally closed by declaring the corpus exhausted: *"the last mined
scenario owning an open row has now been built — S-2, S-13 and S-14 own nothing
outstanding between them."*

**That was false, and contradicted by PJ-008's own ownership table in the same
commit**, which reads `open + owned: J, K`. **S-14 owns row J.** **Story 18 owns
row K** — and §4 has carried a promotion condition for it since the document was
written: *"if row K survives the build, promote this to a scenario."* Row K
survived S-8. The condition fired, and had been sitting fired, unnoticed.

Worth being precise about the failure: this was not a claim made without
checking. It was a claim contradicting a summary written *in the same commit,
two sections above*. The ledger was right; the prose was not.

What survives the correction: thirteen scenarios, zero new node labels, and five
consecutive builds pressing only on relationships, query semantics and identity.
That is a real signal about where the *next* kind of pressure has to come from.
It is not a licence to skip the two probes this document has already named.

So the sequence is: **S-14** (row J — deferred versus deliberately accepted as
unresolved), then **story 18 promoted** (row K — scratch work that unexpectedly
matters), then freeze this corpus. Only then the question of what applies a
different kind of pressure, for which the leading candidate is a real consumer
above the domain layer rather than another authored corpus — a researcher-facing
read surface designed from the research questions *without* exposing the graph
ontology, which is far likelier to expose a missing noun than another
Bonsai-shaped scenario. An adversarial reading of PJ-001 runs alongside it, not
instead of it: a reviewer can propose ten plausible alternative ontologies, and
the consumer is what makes one of those disagreements consequential.
