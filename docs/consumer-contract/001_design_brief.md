# Consumer contract — design brief

**Status: protocol, revision 2, 2026-08-20 on `feat/domain-consumer`, before any
designer has been run.** Committed before results on purpose: this project
records predictions ahead of a build so a refutation survives as a result rather
than being edited into hindsight, and this probe gets the same treatment.

Revision 1 was reviewed before running and is superseded. What it got wrong is
recorded in "What revision 1 had wrong" below rather than quietly fixed — the
first draft would have produced a confident, wrong-shaped answer, and how is
worth keeping.

## Scope — what this is, and what it is not

PJ-023 called for a **real consumer above the domain layer**. This is its
precursor, not that consumer.

What it actually tests: whether agents who cannot see the ontology derive
different *semantic requirements* from substantially the same Bonsai-derived
material. That is worth knowing and is the cheapest thing to do first. It does
**not** test whether LabKit generalises beyond that corpus — the material is the
same eighteen stories the fifteen scenarios came from.

The real pressure arrives at the stage after this one, when the frozen contract
is implemented as a thin read surface and has to answer actual questions without
leaking graph vocabulary. That implementation is where a candidate becomes a
concrete failure.

Two further limits, stated so a clean result cannot be over-read:

- **The contract is read-only**, so this probe exercises the explanatory
  ontology. Concepts that earn their place primarily during *writes* — authority
  to approve, assignment, responsibility, ownership, permission — cannot be
  strongly validated or refuted here.
- A clean result therefore never means "the thirteen nouns are complete". At
  most it means *this protocol elicited no additional persistent semantic
  distinction*.

## Why a consumer, and not a sixteenth scenario

Fifteen scenarios have been built from the corpus. Every one pressed on
relationships, query semantics or identity, and **the noun inventory never
moved** — thirteen node labels at the start, thirteen at the end, zero
migrations. No ledger row now names an unbuilt owner.

That is a fact about the *method*, not a verdict that the model is right. An
authored scenario is written by someone who already knows the ontology, so it
can only press where its author thought to press.

## The three bars

Revision 1 carried one rule over from the scenario phase: an unavailable answer
is an empty result and earns nothing until the current model is shown answering
*incorrectly*. That rule was right for its own phase and is close to circular
here — the probe exists to find things the model cannot express, under a bar
that says inability to express something is not evidence.

Replaced by three, applied in order:

**1. Consumer-pressure bar.** An answer the model cannot supply earns a
**candidate requirement**. It does not earn a schema change, and it is not yet
evidence of a defect.

**2. Representation bar — a paired-world distinguishability test.** A candidate
becomes evidence against the model when two research states the contract
requires LabKit to tell apart are **indistinguishable in the current durable
representation**. Concretely:

```
World A:  Alice approved the amendment
World B:  Bob approved the amendment
contract: "who approved this?"
LabKit's durable state: identical in A and B
```

That is not an unasked question. No reader can recover the answer, because the
encoding erased the distinction. Same shape for ordering:

```
World A:  unrelated decision X was taken before Y
World B:  Y before X
contract: "what did we believe in March?"
LabKit's durable state: identical
```

**3. Change bar — unchanged from §3.** A candidate that survives bar 2 is tried
first as **query or service semantics**, then as a **relationship**, and only
then as a **noun**. Row P was resolved in the query; row V recorded two models
and picked neither.

The one-line version:

> An unanswered consumer need earns investigation. A model change requires
> showing the current representation cannot distinguish two states the contract
> requires to be distinguishable.

## Two stages, and why the split is not optional

**Stage A** — `002_stage_a_packet.md`. A freshly written boundary statement plus
the eighteen bold "As a researcher…" sentences, glosses stripped. Nothing else.
Outputs frozen and committed before anything is revealed.

**Stage B** — `003_stage_b_packet.md`. PJ-001's acceptance questions, should /
should-not list and design principles, then: *does this make you revise?*
Revisions recorded as a separate document; the Stage A output is never edited.

The split buys a second measurement for almost no extra cost: **which concepts
arose from the researchers' own words, and which appeared only once LabKit's
design language was supplied.** Reveal Stage B early and that is gone
permanently.

What is withheld from both stages: `001_git_init.md` lines 32–406 (the entity
list and graph shape), all of PJ-008 §2/§3/§4, every other journal entry,
`CLAUDE.md`, `src/`, `tests/`, `drizzle/`.

## The instrument is a semantic distinction, not a noun

Revision 1 scored "nouns the designer reached for that the brief never gave
them", and told designers so. Both halves were wrong.

**Wrong as a measure.** `author`, `actor`, `owner`, `approver`, `decision-maker`
may be one requirement wearing five words; and a designer can reuse a supplied
word while introducing a distinction the model lacks — "decision" meaning an
approval act, a scientific interpretation, or a lifecycle record are three
things under one label. Lexically unchanged, semantically new.

**Wrong to disclose.** Telling designers which output is the instrument creates
a demand characteristic: novel nouns become the way to be interesting, so they
get manufactured.

So designers produce an ordinary glossary of **every** concept their contract
relies on — supplied or introduced, unmarked either way — with a fixed schema
per concept, whose load-bearing field is *what two situations become
indistinguishable if this concept is absent*. That is the same shape as bar 2,
asked of the designer before anyone maps their answer onto LabKit. The mapping
happens afterwards, in a separate synthesis pass, against frozen outputs.

## Preregistered hypothesis

**H1.** At least one persistent semantic distinction, required independently by
two or more designers, cannot be represented faithfully by the current domain
without conflation, hidden state, or inference from wording.

**H0 survives** if every elicited read operation and distinction can be
implemented from existing durable state without semantic overloading or
additional hidden state.

H0 surviving is a real finding and the one this probe would most like to be
wrong about. It would mean *this protocol elicited no additional persistent
semantic distinction* — not that the model is complete.

### Secondary predictions, each with its falsifier

| Prediction | Falsifier |
| --- | --- |
| **Attribution.** At least two of three designers require *persistent* attribution — some concept answering "who established this" that must survive in the record. Scored as a semantic requirement, not as the word "actor"; the material already says "researcher" and "agent" | Fewer than two require it to persist, or all treat it as display metadata with no read operation depending on it |
| **Temporal survey, Stage A only.** At least one designer requires ordering across the record — not "when did this happen" but "what did we hold in March". **Stage B evidence does not count**: PJ-001 hands them *"cheap to ask … what changed?"* outright | No designer requires it at Stage A |
| **A prioritised worklist.** At least one asks for "what should I work on next". *No interpretation is preregistered.* Revision 1 pre-classified this as ceremony to be restated rather than built, which decides the finding before seeing it. It may be ceremony, or it may expose a missing distinction between scientific opportunity, obligation and blocked work — the paired-world test decides | Nobody asks |
| **Free-text search.** At least one asks for search over finding content. Treated as a **negative control**: an interface capability that plausibly has no ontology consequence. Whether it earns anything is not preregistered | Nobody asks |
| **Rows F and O not raised.** Neither artefact-lineage *direction* ("what was this reconstructing") nor under-determined withdrawal reason appears. Both needed a built scenario plus external review to surface | Either is raised at Stage A |

Dropped from revision 1: *"new node labels: one or none"*. Designers never see
node labels, their output cannot earn a schema change directly, and "one or
none" is broad enough to be nearly unfalsifiable.

## Panel: triangulation, not independence

Three designers on different model families — Claude, plus two others via the
`omp-headless` skill. No cross-talk; none told the others exist.

Different families reduce vendor-specific instruction-following,
architectural habit and decoding bias. They do **not** give three independent
observations: all are general-purpose frontier models trained on heavily
overlapping material, and the shared prompt and shared corpus will likely
dominate anything the model family contributes. Revision 1 claimed "three shows
whether a disagreement is a coin-flip or a fault line" — at n=3 it shows
neither.

Two consequences for how results get read:

- **The strong signal is semantic convergence despite lexical disagreement.**
  Three designers emitting the word "actor" is weak. Three requiring persistent
  attribution while calling it three different things is strong.
- **Majority is not the truth criterion.** A concept raised by one designer can
  still expose a real deficiency if the source material supports it and it
  passes the paired-world test. Convergence sets priority and confidence, not
  admissibility.

The context ablation between Stage A and Stage B buys more independence than a
fourth model would.

## What revision 1 had wrong

Kept visible because the failure mode it would have produced is the instructive
part:

```
supply model-aware vocabulary
   + tell designers novel nouns are the finding
        ↓
designers organise around the supplied ontology
   and invent a few extra concepts to be interesting
        ↓
three models emit superficially similar new nouns
        ↓
convergence reads as independent evidence of missing ontology
```

Four defects, all pre-run:

1. **The reading bar made the instrument circular** — absence was the signal and
   the bar discarded absence.
2. **The withholding line leaked far more than admitted.** Revision 1 said
   PJ-008 §1 was "researcher language, written before any model existed". False
   for the glosses: story 9's names `Artefact`/`Evidence`/`Question`/`Decision`
   and `RecoveredArtefact`; story 12's argues for "Evidence and Claim being
   separate objects"; and §1's closing "The shape these describe" — which the
   review did not catch and which checking found — is a process diagram in the
   ontology's own terms. The bold sentences alone are clean, verified: zero
   backticked terms across all eighteen.
3. **The instrument was lexical, and disclosed.**
4. **Predictions bundled interpretation** (worklist, free-text search), rested
   on contaminated input (temporal survey), or were unfalsifiable (node labels).

## Order of operations

1. Run three designers on `002_stage_a_packet.md`. Commit outputs verbatim as
   `010`, `011`, `012` before reading across them.
2. Reveal `003_stage_b_packet.md`. Commit revisions as `013`, `014`, `015`.
3. Synthesis pass: cluster concepts **semantically** across all six documents,
   without reference to LabKit's model. Commit as `020`.
4. Only then map clusters onto the current domain.
5. Every apparent gap gets a paired-world distinguishability test before it
   exerts any pressure on the ontology.
6. Survivors go to the change bar: query semantics, then relationship, then
   noun.
