# The vertical slice: three gaps demonstrated against running code

**Implemented 2026-08-20 on `feat/domain-consumer`.** `tests/consumer/vertical_slice.test.ts`,
four probes, 192 pass / 0 fail, typecheck clean, `npx depcruise src tests
--output-type err` 0 errors.

**Nothing has been changed in the domain model.** This entry establishes which
failures are real. It deliberately does not fix any of them.

**Revised before pushing, on review.** The first draft made one wrong claim and
two weak probes, and the wrong claim was load-bearing. Corrections are recorded
below rather than quietly applied.

## What changed since `023`, and why it matters

`021` and `023` scored four candidates on paper: two worlds described in prose,
and a durable state I asserted would be identical. That is an argument.

This is the same test against **running code**. Each probe builds two research
worlds through research verbs alone, against a real graph, then asks the public
read surface. Where the surface returns the same answer, the failure is
demonstrated rather than predicted.

### Two bars, and the first draft conflated them

PJ-011 **§5** needs a *confidently incorrect* answer before the model changes; an
absent one is unanswerable, not wrong. `023`'s **bar 4** needs only that losing
the distinction *"materially prevent or corrupt a read the frozen contract
requires"* — and *prevent* covers absence.

The first draft claimed a paired world was "the way past" §5. **It is not.**
Every read these probes call returns a *correct* answer in both worlds. What they
establish is bar 4.

That is not a downgrade of the finding, it is the finding stated at the right
bar — and it matters forward for a reason the first draft missed. CLAUDE.md
allows **at most one confirmed wrong answer to ship green at a time, and clearing
it must be the next thing built**. Three §5-demonstrated failures deferred at once
would be a rule violation on its face. None of these clears §5, so the deferral
rule is not engaged. "Demonstrated" is the word the change bar keys off; left
mislabelled, someone cites this entry in four commits as the wrong answer that
licenses a model change.

### The detector test, applied to each probe

The instrument that separates a demonstration from a prose claim with a
checkmark: **what change to the model makes this test fail?** Verified by
injection — each field below was added to the running code, the test failed, and
`session.ts` was restored byte-identical.

| Probe | Injected | Result |
| --- | --- | --- |
| 2 | `as_of` on a survey row | **fails** |
| 3 | `reconstructionTarget` on the reproducibility report | **fails** |
| 4 | `decidedBy` on the answered enquiry status | **fails** |

The first draft's probes 2 and 3 would have stayed **green** after their defects
were fixed: probe 2 called `whatIsKnown()` with no arguments, so adding `asOf`
changed nothing; probe 3's builder never invoked a reconstruction mechanism.

**The instrument caught its own author too, and that is the sharpest instance.**
The reviewer who proposed this test reached its finding by *reading* the probes,
and said explicitly that not re-running the suite did not matter. It did: "these
would stay green after a fix" is a claim about what running code does, and it
became a fact only when the three fields were injected and the three failures
observed. Until then it had precisely the property it was convicting the probes
of — persuasive, and not yet demonstrated. The instrument was right; it had not
been turned on itself.

Recorded because it is the same lesson at one more remove, and because it is the
reason the injection table exists rather than a paragraph asserting the same
thing.

**Restoring `session.ts` byte-identical after each injection** is deletion
verification applied to an *addition* — the standard this repo set for earning
edges, used on a read surface. Without it the table would report three failures
and leave three unexplained changes in the tree.

## Probe 1 — orientation. **Passes, and it carries the other three.**

Stated affirmatively, because the first draft undersold it as a guard against a
self-fulfilling result. Probe 1 proves the harness **can** return unequal answers
for two worlds. That is what stops the equalities in probes 2, 3 and 4 being
artefacts of `inTwoWorlds` rather than facts about the read surface. Without it
they would be uninterpretable.

Two worlds differing in whether a prespecified robustness condition held — story
3's *"formally significant computation that remains insufficient evidence"*.
`whySupported()` separates them cleanly: `supported: true, unmet: []` against
`supported: false, unmet: ["stable across five seeds"]`.

This is the question LabKit was built for and it answers it.

## Probe 2 — historical survey. **Bar 4. Row Z.**

Two programmes settle the same two questions in **opposite orders**. Both end
holding both beliefs, which is correct and is not the finding. The finding is
that a researcher asking *"what did we hold once the first was answered but
before the second?"* has **no read to ask** — no operation on the surface accepts
a time. Prevention, not corruption.

**The first draft claimed the durable record could not say which history produced
it. That was false**, and how it was false is the sharper result. `whatIsKnown()`
returns `QuestionStanding { question, asks }` where `question` is the natural id;
the draft did `.map(q => q.asks).sort()`, discarding exactly the field that
encodes allocation order. Sorting by id recovers the orders exactly — verified:

```
world AB → Q_1 "does pruning…", Q_2 "does depth…"
world BA → Q_3 "does depth…",   Q_4 "does pruning…"
```

The accurate claim: **no modelled read exposes the ordering; the only trace is a
generator artefact CLAUDE.md forbids reading meaning into.** That is still a real
gap and a more precise one — and it is a fourth way a probe could have cheated,
alongside `src/db` access and a moving clock. The probe now demonstrates the
channel explicitly rather than accidentally relying on its absence.

Required by all three designers in cluster 21, in three different vocabularies
(`as_of`/`believed_at`, "as-of view", "past standing reconstructed at a time") —
semantic convergence despite lexical disagreement, which is the strong signal.

## Probe 3 — reconstruction provenance. **Gap demonstrated. Row F.**

**The first draft of this probe was incoherent and tautological**, and both
faults are the ones this project keeps making, so both are recorded.

*Incoherent:* both worlds passed the same `contentHash`. Under S-9 the content
hash **is** artefact identity — `reproducibilityOf()` compares exactly that field
to decide `exact` versus `differing` — so a byte-identical "regeneration" is a
successful reproduction, not a distinct artefact. World A contradicted the rule
the probe's own comment cited.

*Tautological:* the two worlds were one builder differing in a free-text
argument, so asserting that non-text-derived outputs matched asserted only that
the same code returns the same result. **PJ-021 removed a row F boundary test for
exactly this, and it was rebuilt here.**

Rewritten as a single-world fact about the **write** surface, which is where the
gap actually lives: `reproducibilityOf()` takes the historical parts as
*arguments* — the caller must already know the answer — and persists nothing. No
field of any report names what a rebuilt artefact was an attempt to reconstruct.

Required by Designer 2, which named a durable reconstruction attempt whose
remembered fields include its historical target. PJ-021 stated this gap in almost
the same words and correctly refused to let it earn anything without a
demonstration. This is the demonstration.

## Probe 4 — attribution. **Gap demonstrated, and it is the strongest. Row S.**

**Ranked right, argued wrong in the first draft.** Inexpressible-on-write is
genuinely more severe than unreadable, so the ranking stands. But the *pairing*
contributes nothing: `closure`, `answer` and `open` match because both worlds ran
the same code. The severity comes from the **write** surface, and the
load-bearing assertion is a single-world fact.

`closeEnquiry` takes `{ enquiry, answeredBy? }`. No verb on the surface accepts an
actor. So a researcher who wants the record to say who closed a question has
exactly one route — write the name into a finding's prose. The probe does that,
and then shows what it buys: `closure`, `answer` and `open` are identical across
the two worlds; only `evidence` differs, because the two worlds have literally
different sentences in them.

The name is unreachable *as attribution*. A caller can only recover it by parsing
evidence prose and guessing which parenthetical is a person. Attribution is
currently **only wording**, and nothing knows it is there.

Required by all three designers, distributed across four unanimous clusters
rather than forming one — which is why the blinded synthesis never gave it a
heading and a heading-only reading would have scored the prediction refuted.

## What the probes are not allowed to do

`tests/consumer/` may not import `src/db` — a new dependency-cruiser **error**,
verified by making it fire and then restoring. The reasoning is specific to this
exercise: a probe with graph access could answer from the graph directly and
report a distinction no consumer could ever make. That is the one result this
file must be unable to fake.

The clock is fixed at a constant for the same reason. A read that tells two
worlds apart only because wall-clock time moved between them has distinguished
the test runs, not the research states.

> **The limitation this originally claimed is withdrawn.** It said a harness
> with a pinned clock *structurally* cannot evaluate whether row Z's ordering
> derives from durable state. Wrong twice: a constant function is a frozen value
> rather than a clock, and the limit was the fixture's, not the harness's.
> `tests/helpers/clock.ts` winds, probe 5 uses it, and the paired-world probes
> keep the frozen one because they need it. **Row Z is narrower than this entry
> said** — see probe 5.

**Natural-id ordering is the third channel** and is not closed by either measure —
see probe 2. It is demonstrated rather than blocked, because a consumer *could*
read it and must be told not to.

**Passing tells you almost nothing here.** Probes 2, 3 and 4 pass *by
construction* — that is the finding — so 192/0 carries very little information
about the claims under review. The detector-injection table above is what carries
it.

## Probe 5 — what a wound clock reaches. **Row Z, narrowed.**

Added after review, and it corrects this entry rather than extending it.

Of the six places a write verb reads the clock, **exactly one reaches the
graph**: `evaluateCriterion`, stamping `CriterionEvaluation.evaluated_at`. The
other five — `reverify`, `acceptAsUnresolved`, `amendDesign`, `replaceAnalysis`,
`reinterpret` — stamp only the event stream, which CLAUDE.md excludes from "what
is true now".

The probe winds sixty days across an evaluation and a closure. The evaluation
keeps its instant, and it is the wound one rather than the start, so the clock
genuinely drives durable state there. The closure keeps nothing: sixty days left
no durable trace of when the programme came to believe the thing.

So the accurate statement of row Z is **not** "the record has no time in it".
It is **evaluations are ordered; decisions are not** — and `Decision` is the node
carrying closure, deferral, amendment, promotion and withdrawal, which is to say
every act by which belief moves. A frozen clock could not have shown this,
because every stamp was identical.

That narrowing is the useful part: it says where to look first, and it says a
`decided_at` would be a smaller change than "add time to the model" implied.
Still bar 4, still nothing built.

## Standing

| Probe | Contract need | Clears §5? | Clears bar 4? | Detector flips? | Ledger |
| --- | --- | --- | --- | --- | --- |
| Orientation / why | strong | — | — (answers) | n/a | — |
| Historical survey | strong | **no** | **yes** | yes | Z |
| Reconstruction target | strong | **no** | **yes** | yes | F |
| Attribution | strong | **no** | **yes** | yes | S |

Three gaps established at **bar 4**, against running code, each with a detector
that fails when the gap closes. **None clears PJ-011 §5**, so none licenses a
model change and the one-wrong-answer-at-a-time rule is not engaged.

## What happens next, and what must not

The change bar is unchanged and no rung has been climbed:

> **reader semantics → existing relationships → new relationship, property or
> reference → a new noun only if unavoidable.**

Rows P and F are the cautionary pair. P looked like missing structure across two
builds and was resolved in the query. F looked like a missing edge and was
answered by a refusal. **Do not open by adding `Actor`, a timestamp, or an
artefact-lineage edge.**

The order I would take them, cheapest first:

1. **Row Z** — try reader semantics. A survey read that accepts a time needs
   *some* ordering, but `Decision` already has `closed_at` and the event stream
   already carries stamps; whether a durable ordering can be derived rather than
   stored is untested and is the first thing to test.
2. **Row F** — try an existing relationship before a new one. The question is
   whether a reconstruction can be recorded as an *act* with a target using verbs
   that already exist, which is what S-9 declined to invent and what Designer 2
   independently required.
3. **Row S** — last, and deliberately. It is the only one of the three that is
   inexpressible rather than unreadable, so it is the most likely to need a real
   noun, and the most expensive to get wrong. It is also **write-side**, which
   this read-only contract could never validate — the requirement is real, the
   shape is not yet earned.
