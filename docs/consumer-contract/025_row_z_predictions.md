# Row Z — predictions, recorded before the build

**Written 2026-08-21 against `9d41c0e`, before a line of test or source.**

Recorded first so a refutation survives as a result rather than being edited into
hindsight. Five of the last six builds had at least one prediction refuted, and
the refutations have been worth more than the hits.

## Row Z's own condition has fired

The ledger entry closes:

> neither a durable event sink nor a `decided_at` property is earned by a
> question nobody has yet been unable to answer

Someone has now been unable to answer it. Three cold designers required
historical ordering independently, in three vocabularies (cluster 21), and probe
5 demonstrated the gap against running code. **That is the row's own stated
trigger, met on its own terms** — the second time in this project a condition
recorded years-deep in a document has fired and had to be noticed by someone
re-reading it, row K being the first.

## What probe 5 already established

Of the six places a write verb reads the clock, exactly one reaches durable
state: `evaluateCriterion` → `CriterionEvaluation.evaluated_at`. The other five
stamp the event stream only. `Decision` — closure, deferral, amendment,
promotion, withdrawal, which is every act by which belief moves — carries no
instant. `closed_at` exists but only on *closed* decisions, guarded by a
biconditional, so it cannot order two open ones.

So the question is narrow: **can belief-ordering be derived from `evaluated_at`
plus edges, or does `Decision` need an instant?**

## Predictions

| Question | Prediction |
| --- | --- |
| **Rung 1 — query semantics alone** | **Fails, and demonstrably rather than arguably.** A partial order is derivable — a decision citing a finding whose criterion was evaluated at *T* is no earlier than *T* — but it is a **lower bound, not an order**. Most closures cite findings with no evaluated criterion at all, so the common case yields no bound. Predicting an as-of read built on this returns the *same* answer for probe 2's two worlds, i.e. the gap unfixed |
| **Rung 2 — an existing or new relationship** | **Not needed, and would be wrong.** Sequence is a property of each act, not a relation between two. An `AFTER` edge would need writing at every decision against every prior decision, and the reader would still be reconstructing a total order from pairs |
| **Rung 3 — a property** | **`Decision.decided_at`, one string, six creation sites.** Predicting **no migration**: AGE nodes are schemaless agtype maps, and this project has twenty-four journal entries and zero migrations for node properties |
| **Which temporal reading** | `024` warned that a single timestamp "would look like a fix while silently choosing one reading". Predicting the honest one is **record time** — when the act was recorded — because that is what the clock at the verb knows. Belief time is D1's bitemporality, demoted in `023` to candidate-extension because no source obligation requires it. Predicting I must say so in the property's own comment or the next reader assumes otherwise |
| **The wrong answer I expect to write** | **Current state leaking into a historical view.** A survey keyed on `Claim.kind` will report a question `established` at *T1* when the `promote()` that made it confirmatory happened at *T2 > T1*. Same shape as reading "what is true now" from a query meant to answer "what was true then" |
| **Second-order risk** | An as-of read that answers confidently about questions with **no** decisions before *T*. "Not resolved by *T*" is correct; "untested at *T*" is not, if observations existed. Predicting the three-state survey needs its states recomputed as-of, not filtered after the fact |
| **What would refute all of this** | An as-of read built on `evaluated_at` and edges alone that separates probe 2's two worlds correctly. Then no property is earned and rung 1 was enough |

## The bar this has to clear

Bar 4 (contract necessity) is already met — `023` scored it strong, three
designers, and probe 5 is the demonstration. What is **not** yet met is the
change bar's own sequence, and this build exists to walk it in order:

> reader semantics → existing relationships → new relationship, property or
> reference → a new noun only if unavoidable.

**Rung 1 gets built and shown to fail before rung 3 is written.** Rows P and F
are why: P looked like missing structure for two builds and was resolved in the
query; F looked like a missing edge and was answered by a refusal. A property
added without walking the rungs would be indistinguishable from a guess that
happened to work.

## Success and failure, stated now

**Success:** two worlds settling the same two questions in opposite orders return
*different* as-of answers, each correct, from durable state — with the event log
empty beside it, as S-1 established.

**Failure that still counts as a result:** rung 1 turns out sufficient, and
`decided_at` is not earned. That refutes the central prediction and is the
cheaper outcome for the model.

**Failure that does not count:** an as-of read that works only because the test
kept a reference the caller would not have. `scenario.current()` opens a second
reader for exactly this reason.
