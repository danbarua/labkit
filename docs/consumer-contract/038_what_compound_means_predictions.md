# What "compound" means — predictions before the demonstration

**Written 2026-08-22 against `d8f2515`, before a line of test.** First item off the
PJ-028 sweep's *inferred* pile, which is read and not run. The point of taking it
one at a time is to establish the base rate of "looked wrong on reading, was fine",
so a negative result here is worth as much as a positive one.

`write.ts:9` says *"A compound verb runs inside `graph.inTransaction()`"*. Six
emitting verbs write more than once and do not: `pose`, `pursue`, `openEnquiry`,
`sharpen`, `recordReview`, `closeEnquiry`, `planWork`, `stateCriterion`,
`declareGate`, `evaluateCriterion`.

## Neither offered reading is right

`labkit-dev` framed it as two options — the comment is wrong about the code, or
"compound" is narrower than it reads. Orientation says **both are wrong, because
both assume one answer covers all six verbs**, and this project has never worked
that way: CLAUDE.md says the rule was earned *"by negative test in each case"*.

Predicting the discriminator is neither "writes twice" nor "composes other verbs":

> **A partial state is acceptable exactly when some other verb could legitimately
> have produced it.**

That is PJ-011 §5 applied to interruption. An unreachable leftover is an absence;
a state that *misreports* is a wrong answer.

## Predictions

| | |
| --- | --- |
| **`openEnquiry` needs no transaction, and this is the interesting half** | It is CLAUDE.md's archetypal *composed* verb, so the naive reading condemns it. But a failure between `posed()` and `pursued()` leaves a Question with no enquiry — **precisely what `pose()` legitimately produces**, and what S-1 depends on existing to report a question as untested. Predicting the partial state is legal, reachable, and not a defect |
| **`sharpen` does need one** | `originOf()` returns `knownAtTheTime` from the decision's `BASED_ON` edges with no completeness check, and `NARROWS` has exactly one writer. So a failure inside the `BASED_ON` loop leaves a sharpening decision that reports a **subset** of what was standing, as if it were the whole. No other verb can produce that. Predicting a demonstrated wrong answer, not an absence |
| **The remedy is the transaction, and also the sentence** | Predicting the comment needs rewriting under *every* outcome, because "compound" already means something else two paragraphs away in CLAUDE.md — where `openEnquiry` is named as the composed verb. One word, two meanings, in the header of the file being audited: PJ-027's shape |
| **What I expect to be unable to settle here** | Whether `pursue`, `recordReview`, `closeEnquiry`, `planWork`, `stateCriterion`, `declareGate` need one. Each needs its own argument under the discriminator and none is demonstrated by `sharpen`. `evaluateCriterion` is the strongest next candidate — its own comment calls the partial state "durable nonsense" — and it is a separate demonstration |
| **The wrong answer I expect to write** | **Wrapping all six because one demonstration landed.** That is the sweep-driven edit this whole method exists to prevent, and it is worse than the comment: wrapping a verb whose partial state is legal buys nothing and costs a transaction. If I catch myself reaching for the other five, the answer is to stop and demonstrate |
| **What would refute the discriminator** | A verb whose partial state is legally reachable *and* still produces a wrong answer, or `sharpen`'s partial state turning out to be reachable some other way. Either kills the rule as stated |

## Constraint

No noun, edge or property. One verb demonstrated, then stop and report — including
if the answer is "not a defect", which is the outcome that makes the base rate
worth having.

## Demonstration shape

Deterministic injection, following `recordObservations`'s negative test
(`tests/domain-session.test.ts`): make `createEdge` throw on the **second**
`BASED_ON` edge, with two findings standing. Pre-fix, read back through
`originOf()` and show `knownAtTheTime` reporting one of two. Post-fix, same
injection, nothing survives.
