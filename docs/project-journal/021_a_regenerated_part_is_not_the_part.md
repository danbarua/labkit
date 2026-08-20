# PJ-021: A regenerated part is not the part — row F refuted, row P resolved

**Status: implemented (2026-08-20), on `spike/drizzle-age`. Covers S-9
(`b55ff09`), promoted from §2. Row F **refuted**, row P **resolved** against two
consecutive predictions that it would not move. Verification at the time of
writing: 173 pass / 0 fail, typecheck clean, `npx depcruise src tests
--output-type err` 0 errors.**

## Context

S-9 was the last unbuilt scenario owning an open row outright — sole owner of F,
and row P's only unbuilt owner. Its story is a cached construction that mostly
rebuilds: three components come back byte-identical, and the historical random
control does not, because whatever generated it was never written down. The
researcher then asks for the thing the record must not let happen quietly —
infer the old algorithm, regenerate the part, carry on.

## Row F: refuted, and the contrast with row E is the point

No `Artefact → Artefact` edge was earned. The fallback this row recorded from
the beginning — content-hash equality plus an open question — held exactly as
written.

The two things a lineage edge would have carried already had homes. **Direction**
is in the act: a regeneration knows what it regenerates, and `reproducibilityOf()`
reads that off `CONSUMES`. The **caveat** is the open question, which
`whatIsKnown()` keeps in `untested` rather than letting a workaround close it.

This lands one scenario after row E was *earned* on the same test, which is the
sharpest available demonstration that the bar discriminates rather than
rubber-stamps. S-10's shared-claim encoding could not carry direction or caveat;
S-9's regeneration carries both. The structural difference: a regeneration is a
**single recorded act**, while two runs supporting one claim are two independent
acts with nothing between them to hold the relationship.

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

## The corpus question, now answerable

Every previous entry closed on some version of *is PJ-001's entity set unusually
well chosen, or is the corpus not applying pressure that would move it?*

S-9 makes it answerable in one direction at least. Thirteen scenarios, zero new
node labels. Five consecutive scenarios have pressed only on relationships,
query semantics and identity. And **the last mined scenario owning an open row
has now been built** — S-2, S-13 and S-14 own nothing outstanding between them,
so "build more of this corpus" has stopped being a way to find out.

That is not a conclusion that the entity set is right. It is a conclusion that
this corpus can no longer test it, and that a different kind of probe — a
different corpus, a real consumer above the domain layer, or an adversarial
reading of PJ-001 itself — is what would.
