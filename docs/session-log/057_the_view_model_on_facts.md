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
**`94b364a`** — the bearing sweep checked mechanically and closed; one
confusable helper renamed.
**`b0c45f0`** — the prose catches up: CLAUDE.md gains a section on the fact
graph, S-19 gains its fourth case, and ledger row **AL** gains a glossary
entry.
**`dd34e40`** — the last fact holding two names for one subject takes the
bearing too.

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

**The defect class is closed on the read side, checked mechanically rather
than by eye.** Every query reaching a claim through a bearing edge names both
or takes the bearing as a parameter. Two remain one-sided and both are
deliberate with the reason already written where they are: `enquiryStatus`
fetches only the challenging side because polarity is *no* when something
challenges and *yes* otherwise, and `reproductionOf` asks *whether* evidence
challenges, which is single-bearing by construction.

**`labkit-review` proposed a third answer to Dan's open question, better than
either option he offered: compose facts with more than one reader.** Not "every
query" and not "carries a classification". The defect is *written once and
forgotten the second time*, which requires a second time — a single-reader query
cannot have it, whatever it computes. Carrying a classification is a proxy; what
predicts the bug is **a rule that must agree with another reader**, and all six
occurrences were that.

Measured rather than accepted: 33 queries remain, 13 edges have more than one
reading verb, and only about six traversals reach *the same answer about the
same subject*. Edge-sharing badly overstates it — six verbs walk `PRODUCES` for
six different purposes. `DEFERS` has three readers and they agree, which is the
shape that drifts rather than one that has.

**They also withdrew half of their #69 finding**, publicly on the PR rather than
by editing it, on the grounds that the reasoning is worth more than the
conclusion. Their proposal would have collapsed the very distinction S-10 needs,
and what settled it was running it rather than accepting a plausible argument
from someone who had just been right about something adjacent.

**The write side stays raw Cypher**, on Dan's reasoning that it is the reference
documentation for *why* the graph is shaped as it is.

## Next

**PR #72 is not ready for review**, by Dan's own bar: it ships when the whole
read side is ported or explicitly invalidated. Four verbs are ported and the
rest are surveyed.

**Three parties reproduced the same four-cell table from the same code** — Dan,
`labkit-review` and this session, independently. That is the property the change
was arguing for, demonstrated on the change itself.

**The residual Dan spotted was safe for a bad reason.** `standingAsOf` still
held `supported`/`challenged` in one clause, with a fold reading both. Correct,
and *the exact shape that failed*: `checksOf` held two names and its **grain**
read one. This one survived because its consumer was the fold in the same
object rather than a separate function — safe by **proximity, not by
construction**, and the next fact written beside it would inherit a pattern one
refactor from wrong. Parameterised, so no code in the file holds two names for
one subject.

**A second, independent argument for the line arrived from `exo-ledger` via
`labkit-review`, and was measured here rather than accepted.** Mine was
correctness — spell it once and readers cannot disagree. Theirs is testability:
spell it once and **one mutation exercises every reader**.

| mutation | readers that go red |
| --- | --- |
| `checkState` loses the retraction rule | 4, spanning findings-qualifying *and* work-gating |
| only the `SUPPORTS` bearing is ever walked | 3, across S-18b and S-19 |

The second row is the one that matters: **the defect class that took six
separate discoveries is now reachable by mutating two lines.** Spelled
per-query, there was no single place to point a mutation at.

It sharpens the line rather than widening it — mutation coverage only
multiplies where a fact has more than one reader, so a single-reader query costs
one mutation either way, and the recommendation is unchanged with two
justifications instead of one.

**`labkit-review` mutated S-19's new case expecting to find it vacuous, and
reported that it was not.** `checksMet` is `every(... === "passed")`, and `every`
over an empty set is true — so a dropped challenges arm might have passed
silently. It does not: `checksMet` is itself per-bearing and merged, so a branch
that loses its checks fails to contribute rather than passing. Reproduced here.
Worth recording because they expected the opposite and published the negative
result, and because what saved it was the design rather than the test.

**A sharper severity test than the one in use here**, also from `exo-ledger`:

> A query that returns **too little** makes someone look again. A query that
> re-asks a **settled question** makes someone act.

Better than empty-versus-wrong for deciding where to spend attention. Ours was
the second kind: `established` is not a smaller answer than `provisional`, it is
a prompt to build on something. Not yet written anywhere durable.

**PR #72 is ready.** Dan accepted the more-than-one-reader line — his words
for it were better than mine: *"can't find a way to shrink one line of code into
less than one line."* `pursuitsOf` is `MATCH → RETURN ids`, and facts pay where
a rule is duplicated, not where it is not.

Verified at the end: up to date with `main`, `bun run check` 18/18, 176
scenarios, 17 commits, `read.ts` 162 lines lighter net while gaining
correctness.

**One idea of Dan's deferred with a reason rather than declined**: a
`queryBuilder.add("raw clause")` escape hatch, so every read goes through one
machinery and raw clauses visibly flag themselves. Today the raw form already
announces itself — a different function, a template literal, hand-written
decoders. It earns its place when the machinery grows something *every* read
should get: tracing, a row-count guard, a tenant assertion. That reason does not
exist yet.

**The sentence that wanted a durable home has one.** *Findings aggregate over a
proposition; a prespecified check belongs to the one analysis held to it* is
ledger row **AL** and a glossary entry, not a doc comment on one query.

**The prose was imported from #69 and adapted rather than copied**, which is the
part that took judgement. Three things changed on the way:

- **CLAUDE.md gained a section it did not have.** `src/domain/facts.ts` is a new
  architectural module and the architecture document did not mention it — the
  gap was invisible because nothing checks for it.
- **S-19's prose gained a fourth case and an admission.** The first three tests
  were passing partly by luck: a dropped criterion reads as *no checks*, which
  is vacuously met, so the never-run case landed in the right bucket for the
  wrong reason. PJ-029's shape inside the scenario written to demonstrate the
  fix.
- **`WITH coalesce(…)` is recorded as a limit of composition, not of AGE.** It
  parses, which is exactly why someone will reach for it; every clause appended
  after it would have to be projected forward by hand.

**Left alone deliberately:** the session logs and PJ-008's S-3c predictions
still name `checksFrom`, which no longer exists. They are dated records and say
what was true when written; correcting them is what the exemption exists to
prevent.
