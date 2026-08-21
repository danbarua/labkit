# Row F — predictions, recorded before the build

**Written 2026-08-21 against `2ca30d7`, before a line of test or source.**

Recorded first so a refutation survives as a result rather than being edited
into hindsight. Row Z's predictions were the cleanest sweep in the project and
`026` says why that made them *weaker* evidence, not stronger: they were written
downstream of probe 5's measurement. These are written upstream of anything.

## What row F is, stated narrowly

Not "there is no `Artefact → Artefact` edge". That is the row's title, and `024`
is explicit that a row's title is not its solution. The gap is:

> A reader holding only a regenerated artefact cannot answer *what was this
> reconstructing?*

S-9 half-settled the row and the half it settled is **identity**: two artefacts
may legitimately share a `logical_name`, refusing an ambiguous name stops the
regenerated one inheriting the historical one's dependants, and that needed no
edge. What it did not settle is **direction**, and PJ-021's first write-up
claimed otherwise on the grounds that *"direction is in the act: a regeneration
knows what it regenerates."* External review found there is no such act: the
regenerated part is written by an ordinary `recordObservations()` naming nothing
historical, and `reproducibilityOf()` is a read taking the historical parts as
*arguments* and persisting nothing.

Designer 2 then independently required a durable reconstruction attempt whose
remembered fields include its historical target — cold, with no access to S-9,
row F or this repository. That is bar 4 met (`023`). **Bar 4 is not §5**, and the
distance between them is this build's whole problem.

## The trap, named before walking into it

Row F has already been answered by a refusal once. `whatDependsOn()` declines an
ambiguous name rather than answering about the union, and S-9 recorded that as
sufficient. PJ-019 established the matching rule from the other side: **a refusal
needs something real to refuse**, and inventing a verb in order to reject its
arguments manufactures a refusal exactly as a missing feature manufactures an
empty result.

So the failure mode for this build is not adding an unearned edge. It is
building a rung-1 read that answers *what was this reconstructing?* from
`logical_name`, watching it produce nonsense, and calling that a demonstrated
wrong answer. It would be a wrong answer produced by a query I wrote badly, on
purpose, knowing the answer it needed to give.

## Predictions

| Question | Prediction |
| --- | --- |
| **Rung 1 — reader semantics** | **Fails, and by refusal rather than by a wrong answer.** The only route from durable state to a reconstruction target is `logical_name`, and S-9 already established that name is not identity. A read built on it must either refuse when the name is ambiguous — which is correct, unhelpful, and *unanswerable* under PJ-011 §5 — or guess. Predicting the honest rung-1 outcome is a refusal, and that **a refusal does not clear §5** |
| **Where F actually bites** | **Not on the artefact side. On the question side.** Predicting the confidently wrong answer is `whatIsKnown()` reporting *"what generated the historical random control?"* as `untested` — nobody has ever run anything against it — after a researcher has attempted a reconstruction and failed. That is populated, positive, and false, from a read that already exists and that S-9's Afterward 4 already asserts on. Same shape as `DEFERS`: a state token naming a condition the writer could not produce |
| **Rung 2 — an existing relationship** | **`reverify()` refuses, correctly, and no other edge fits.** A reconstruction concludes nothing the historical analysis concluded, so `findingFor` returns nothing and `reverify` throws. `REVERIFIES` is `Evidence → Evidence` and means *re-checked that finding*; a regeneration re-makes an artefact and checks nothing. Predicting no existing edge carries it |
| **Rung 3 — a property or reference** | **If the question-side wrong answer materialises, the remedy is not on the artefact.** Predicting it is about which enquiry the reconstruction is recorded against — and therefore that it may need **no model change at all**, the way row P was answered in the query. Predicting specifically that I will reach for `reconstructs` on the artefact first and that it will be the wrong rung |
| **Rung 4 — a new noun** | **Not needed.** Designer 2's *reconstruction attempt* is that designer's vocabulary. Fifteen scenarios, a consumer probe and a closed row have left the noun inventory at thirteen; predicting it stays there |
| **The wrong answer I expect to write** | **Keying the reconstruction target on `logical_name`** — identity-is-never-wording, reaching a seventh region. Six regions have had to decide this and three got it right only because someone asked at the time. Asking now |
| **Second-order risk** | Recording the attempt against the *original* enquiry rather than the question about the control's provenance, which would make the reconstruction look like work on the accelerated-path question and leave the provenance question still reading `untested`. Predicting that is a scenario-level finding about the verbs' ergonomics rather than a gap in the model, and that it is easy to mistake for the latter |
| **What would refute all of this** | A derivation from existing durable state, independent of wording, that recovers the target correctly. Then rung 1 suffices and nothing is earned |

## The bar, and the outcome that would still be a result

Bar 4 was met before this build started. **§5 has never been met for row F** and
may not be met by this build either.

**Success:** an existing read returns a confident, populated, incorrect answer
about a reconstruction — asserted twice, from durable state, with the event log
empty beside it — and the cheapest rung that fixes it is climbed in order.

**Failure that still counts as a result, and is the more likely one:** every
route yields a refusal or an absence rather than a wrong answer. Row F would
then have been answered by refusal **three times** — S-9, probe 3, and this — and
the honest conclusion is that it is a `boundary` row rather than an open one:
a characterised limit of the model with no claim that it should be fixed. Rows
Y and AA are the precedent. **Saying so would be a bigger result than an edge**,
because it converts the oldest unowned row in the ledger from a standing debt
into a decision.

**Failure that does not count:** a wrong answer produced by a read written to
produce it. See "The trap" above. Any rung-1 read built here has to be one a
consumer would plausibly have asked for on its own terms.
