# Row O — outcomes

**Built 2026-08-21, `d33734a`.** `tests/scenarios/s11b_which_review_retracted_it.test.ts`,
three tests. 210 pass / 1 fail (the known `leader-election` flake, which passed
twice on isolated re-runs), typecheck clean, depcruise 0 errors.

**Row O is closed.** One new edge label, one endpoint pair, no new noun, no
migration.

## Predictions

| Prediction | Outcome |
| --- | --- |
| Row O clears §5: the confirming verdict is reported as a reason for retraction | **held**, and more cleanly than expected — it is reported in *both* worlds |
| A second wrong answer: `superseded` duplicates, one row per review | **held**, and it was the less confident of the two |
| The reviewer's own discriminator cannot be built as stated | **held** — `invalidated` is an `Artefact` property, `ReviewProps` is `{ verdict }`, and nothing can invalidate a `Review` |
| Rung 1 removes the wrong answer and cannot restore the right one | **held**, and demonstrated rather than argued — built, run, both worlds still identical |
| Rung 2: no existing edge fits | **held** |
| Rung 3: a new endpoint pair on an **existing** label, not a new label | **refuted** — see below, and the refutation is the most useful line in this build |
| Row T loses its only named owner | **held** |
| The wrong answer I expect to write: reaching for `SUPERSEDES` | **avoided** |
| Refutation: the query happens to prefer the causal review | not met |

Seven held, one refuted, and the refuted one changed the design.

## The refuted prediction, which is the useful one

`031` predicted rung 3 would be **a new endpoint pair on an existing label**,
on the general principle that this project adds labels reluctantly. `BASED_ON:
["Artefact", "Review"]` reads almost perfectly — *the invalidation rested on this
review* is exactly what `BASED_ON` means.

**That is the trap, and row AA is why.** AA is a live `boundary` recording that
`BASED_ON` already carries two senses — *this evidence informed this decision*
and *this is what was known when the decision was taken*. A third sense would
have **widened a boundary row while closing an open one**, which is the exact
situation CLAUDE.md's nomination rule exists to catch: *a row whose severity is
widened by the change that cleared another row is nominated too*. Reusing the
label would have made the rule fire on the same commit that closed row O.

So the cheap-looking move was the expensive one, and the general principle —
prefer an existing label — is subordinate to a specific fact recorded four
scenarios earlier by someone who was not going to be present for this build.
That is PJ-025's thesis arriving in a build rather than in a journal entry.

`EVALUATES` failed for the neighbouring reason. `Review -> Evidence` exists and
means *this was reviewed*; using it for *this caused the retraction* is one edge
with two readings, which is what `PROMOTES` was split from `CHANGES` to avoid.

## The row's shape was weaker than its own cell

The cell says: *"with several reviews of one unit the causal one is ambiguous."*

Ambiguity was not the problem. `replaceAnalysis()` validated `because` and wrote
it nowhere, so **the causal review was absent with one review, not ambiguous with
two.** Two reviews are what make the absence *visible* — with one, the arbitrary
pick happens to be right and nothing looks wrong.

That matters for how the deferral survived eleven scenarios: every scenario
before this one had at most one review per analysis, so the read was correct by
coincidence in every world the corpus contained.

## Rung 1 was built and shown insufficient, not argued past

Dedupe, plus reporting `"its analysis was replaced"` instead of a verdict.

It removes the wrong answer completely — no approval presented as a retraction,
no double-reporting. And both worlds still return the same thing, so a reader
still cannot separate a retraction on sound grounds from one on no grounds. The
record becomes honest and stays uninformative.

The argument for going further is **not** that the query was ugly. It is that
`because` was supplied by the caller, checked against the analysis, and thrown
away — row AB's shape, a consequential act recording what it acted on and not
what caused it. Information that existed and was discarded is a different case
from information that was never there, and only the first earns structure.

**The dedupe stayed** when the edge arrived. Attribution and multiplicity were
two defects sharing one line, and the edge fixes only the first.

## What the challenge got wrong, and what it got right

Row O was taken up on an external challenge, and a challenge is a prediction
with a different author — scored the same way, which means saying precisely what
it got wrong.

**Wrong on its discriminator.** It proposed: retire an analysis on a review, then
invalidate *that review*, and ask whether the retirement still reads as resting
on valid grounds. **It cannot be built.** `invalidated` is a property of
`Artefact` alone and `ReviewProps` is `{ verdict }` — nothing in the model can
invalidate a review. The scenario as described has no executable form.

**Right on its substance, and decisively.** The challenge's actual claim was that
the cell contradicts itself: it defers to the event model on the grounds that
this describes *why state changed*, while its own verified-state line describes a
present-tense question about what is true now. That was correct, and it is what
unblocked a row that had been deferred for eleven scenarios on reasoning nobody
had re-read.

**Also right, and unprompted, that half the row was already closed.**
`replaceAnalysis()` requires a review *of the analysis being replaced*, which
kills the manufactured-reason case the cell describes as its other half.

The useful summary is that the challenge was **wrong about the experiment and
right about the reasoning**, and the reasoning is the part that could not have
been recovered by running anything.

## Row T is orphaned, as predicted

Row T says edges cannot carry properties. Its only named owner was row O.
`INVALIDATED_BY` is a plain edge with no properties, so **T contributed nothing
to O's remedy and now has no named owner at all.** That was predicted in `031`
and in `TASKS.md` before the build. Its cell says so rather than being handed the
event-sink phase as a substitute owner.

## Standing after this build

| Row | Status |
| --- | --- |
| Z — historical ordering | closed (one property) |
| AD — observation-only work reads as no work | closed (one node, two edges) |
| **O — withdrawal reason under-determined** | **closed (one edge label)** |
| F — reconstruction target | open, discriminator built, ladder at rung 3 |
| S — attribution | open, and now the only row with a live consumer requirement |
| T — edges cannot carry properties | open, **unowned and orphaned** |

Three rows closed in two days. Node labels unmoved at thirteen; edge labels
24 → 25. Still zero migrations.
