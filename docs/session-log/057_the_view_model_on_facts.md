# 057: the view model, composed from named facts

**Session wrap, 2026-08-27, on `feat/view-model-facts`.** Not a decision record
— `src/domain/facts.ts`'s header carries the argument, and PR #72 carries the
evidence.

**057, not 055 or an update to 056.** 055 is on `feat/survey-consults-checks`,
open as draft PR #69 and superseded by this branch, so its number stays claimed
until Dan closes it. 056 is the spike, merged in PR #71; this is the
implementation, which is a different unit of work and gets its own entry rather
than growing that one.

## Goal

Dan, after merging the spike: re-implement the view model on the query builder,
off `main`, and see how far it gets. *"I bet you can ship it."*

## Changed

Four commits carried from PR #69 — S-19's scenario and prose, the glossary, the
five-bucket example — then two of this session's:

**`5413688`** — `src/domain/facts.ts` (machinery) and `src/domain/survey-facts.ts`
(the facts); `whatIsKnown` composed from them.
**`26bbfe6`** — `whySupported` selects by handle, and `checksMetFor` is deleted.

**`13c9551`** — `gateStatus` and the standard read one check fact; `checksFrom`
deleted, and the gate-scoped/criterion-scoped distinction becomes an argument
rather than a paragraph.
**`5faa307`** — the historical survey shares the selection.
**`c85ea7c`**, **`1dcc42d`** — three more one-sided traversals in
`whySupported`, and a refutation worth more than the fixes.
**`73714bf`** — the bearing becomes a parameter, closing the mirror-image
defect `labkit-review` found by reading.

## Verified

`bun run check` — all 18, at both commits. 175 scenarios green throughout.

**Both of `labkit-review`'s findings on PR #69 are closed**, and the first with
no code aimed at it:

| | before | after |
| --- | --- | --- |
| promoted **negative** result, check never run | `established` | `provisional` |
| `whySupported(A)` with a same-wording claim B | sees B's checks | sees only A's |

**The second was verified reachable before being fixed.** `labkit-review` said
plainly they had established it from the code and had not run it; two analyses
in one enquiry concluding the same sentence do produce two `Claim` nodes, and
the two verbs did contradict each other.

## Open

**Naming a fact fixed a defect nothing in the commit targeted, which is the
whole argument in one case.** AGE has no edge alternation, so reaching a claim
needs a `SUPPORTS` clause and a `CHALLENGES` clause; omitting the second is
**silent** — the row is absent and the reader concludes nothing is wrong.
Written once as `answeringClaim`, the hole closed for every reader at once.

The same constraint had already defeated the author of the fix: the spike
re-introduced the identical blindness twenty minutes later, in a file written to
demonstrate the problem.

**Two machinery bugs, both found by running rather than reading.** `compose`
silently omitted a clause whose variable another clause referenced — no error,
a column never returned, a fact folding to `null` for every subject; a leaf can
now declare the clauses it reads. And `empty: new Set()` was one shared mutable
instance, so one subject's rows leaked into the next subject's answer:
invisible with one subject, wrong with two.

**`checksMetFor` was found dead by biome**, not by me. It was the imperative
helper PR #69 added, and the facts subsumed it entirely — the cleanest available
confirmation that the fact version does the same job rather than a parallel one.

**The selection question was decided here, and `labkit-review` had said it
should not be decided by a PR about something else.** This one is about exactly
that, and the evidence is that all 175 scenarios pass unchanged — nothing in the
corpus depended on wording-based selection. That is weaker than a scenario
proving handle-selection *right*, and it is what there is.

**An existential type is encoded as `any`.** `Fact` is contravariant in its
result, so a heterogeneous list needs *some* `T`, which TypeScript cannot spell.
Confined to one alias with the reason on it.

**Six instances of one defect, four of them found here rather than in review.**
Sweeping for the pattern — a hand-written anchor naming one bearing — turned up
the survey's checks, `whySupported`'s standard, its promotion (a promoted claim
reading `exploratory`), its `restingOn` (empty), the spike, and the historical
survey. All the same cause: AGE has no edge alternation, so naming one edge is
**silent**. The third instance was in an anchor written *after* the fact existed,
in the commit that fixed the second — which is why `checksAnchor` is a function
now and not a template a caller fills in.

**The promotion query needed no traversal at all.** A promotion is an edge on
the claim; reaching it through evidence was the footgun, and deleting the walk
removed it rather than handling it.

**The most valuable result is a refutation.** Everything in `whySupported` now
selects by handle, so unifying findings and `restingOn` the same way looked
obviously right. Both are wrong: findings by handle turns **13 scenarios red**,
S-10's *"the re-run reads as independent confirmation"* among them, and
`restingOn` by handle empties it for a two-stage pipeline in
`tests/subject-identity.test.ts`.

So the two selections differ **on purpose**, which neither `labkit-review` nor I
had stated: a re-run concluding the same sentence **corroborates**, so findings
aggregate over the proposition — but a prespecified check **belongs to** the
analysis held to it. Same nodes, two questions, two answers. Both exceptions are
documented where the query is, with what refuted them.

**`labkit-review` found the mirror image of the defect being fixed, and found
it by reading.** A promoted negative result whose prespecified check *ran and
passed* could never reach `established`. `checksOf` collected criteria from both
bearings into `crit` and `crit2`; the **grain** read `crit`. Two places knew
there were two paths and one was updated.

Their four-cell probe reproduced here cell for cell before anything was
touched, including that `challenges + never-run` was passing **accidentally** —
a dropped row and an unmet check land in the same bucket, so the new scenario
had a right conclusion sitting on wrong reasoning. That is PJ-029's shape, and
the case that could have been positive and was not is `challenges + passed`. It
is now a test, with a negative control: restricted to `SUPPORTS`, it goes red.

**The one-liner was declined.** `crit ?? crit2` fixes the instance and leaves
the class — two places would still know. The bearing is a parameter now, one
query per bearing merged by the caller, so downstream there is one `answering`
and one `crit` and the second name does not exist to be forgotten.

**`WITH coalesce(…)` was measured before choosing, and it works on AGE** —
`UNION` too. It was rejected anyway: `WITH` collapses the query, so every later
clause would have to be projected forward by hand. The constraint is
composition's, not AGE's, and it is written down so nobody reaches for it
expecting a shortcut.

**That is six occurrences of one defect, four of them mine, two written after
the fix for the previous one.** The strongest evidence for the approach and the
least flattering way to make the case.

**And the reviewer's method is the result worth keeping.** They predicted the
bug from four lines — the grain definitions — and only then ran a probe. Dan's
observation on it: *"you were able to construct solid predictions from reading
the code without running it… because the code tells you how it is."* That
prediction was unavailable while the fact lived in whichever loop you were
inside; it became available because this change gave it a name.

**Not done: 39 raw queries across 13 verbs**, and the shape of that work is now
the open question rather than its size. Most produce no classification and no
shared selection — `pursuitsOf` is `MATCH → RETURN ids`. Whether every query
goes behind `compose` for uniformity, or only those carrying a classification
with the rest explicitly invalidated, is Dan's call and was put to him.

**The write side stays raw Cypher**, on Dan's reasoning that it is the reference
documentation for *why* the graph is shaped as it is.

## Next

**PR #72 is not ready for review**, by Dan's own bar: it ships when the whole
read side is ported or explicitly invalidated. Four verbs are ported and the
rest are surveyed.

Waiting on one decision — every query behind `compose`, or only the ones
carrying a classification. That decides whether the remainder is an hour or
several.
