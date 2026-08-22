# The inferred pile, closed — nine verbs, three defects

**2026-08-22.** Predictions in `046`. This closes the transaction-boundary thread
of PJ-028's inferred pile: every non-transactional write verb in `src/domain/` has
now been examined by demonstration.

## Predictions

| Prediction | Outcome |
| --- | --- |
| `stateCriterion` and `planWork` have **no interruption window** — a third kind of answer | **held** — zero edges written by either |
| `recordReview` clean, `EVALUATES` last | **held** |
| `declareGate` clean, but by a **weaker** guarantee — unreachable by handle, not by structure | **held** |
| `declareGate` is the one that could refute me | **it did not**, and it remains the one to watch |
| The wrong answer I expected: declaring the pile clean because four verdicts landed together | **avoided** — each was injected separately, and `declareGate`'s readers were enumerated rather than assumed |

## The full result

| verb / route | verdict | why |
| --- | --- | --- |
| `sharpen` | clean | reachability edge (`MOTIVATES`) last |
| `evaluateCriterion` — before `BASED_ON` | **defect** | verdict could never be withdrawn; gate stayed blocked by a retracted `fail` |
| `closeEnquiry` — interrupted retry | **defect** | two `RESOLVES`, arbitrary pick, answer erased |
| `closeEnquiry` — double close | **defect** | same erasure, **no interruption at all** (`labkit-dev`) |
| `pursue` | clean | `MOTIVATES` last |
| `recordReview` | clean | `EVALUATES` last |
| `declareGate` | clean | every `Gate` reader keyed by `natural_id`; caller holds none |
| `stateCriterion` | **no partial state** | one node, no edge |
| `planWork` | **no partial state** | one node, no edge |

**Seven routes had an interruption window. Three were defects.**

Reported that way rather than "six clean of nine", which would overstate the
testing: two verbs were never at risk, and one of the three defects needed no
interruption to reach.

## What the pile taught, beyond the fixes

**Reading is not evidence, quantified.** Six agents produced 28 candidates by
looking for one shape. Of the nine things demonstrated here, the reading was right
about *which* to suspect more often than about *why*: `042` got `closeEnquiry`'s
verdict right and both its mechanisms wrong, and `039`'s rule called
`evaluateCriterion` acceptable until `labkit-dev` found the rule itself was
malformed.

**The rule that survived**, after one correction:

> A partial state is acceptable exactly when every answer a reader can derive from
> it is true.

Unreachability is its trivial case. *"Another verb could legitimately have produced
it"* is evidence and not a test — a shape has no truth value, and two identical
shapes differ in truth when the histories that produced them differ.

**The write-order tell**, which is a lead and not a rule: everything written after
a reachability edge is a claim about a record readers can already see. All three
defects came from verbs writing that edge early; all four clean ones write it last
or are unreachable by handle. **Seven routes is not enough to promote that**, and
the same reasoning has been wrong twice in this pile.

**Two guarantees are weaker than they look, and are now asserted rather than
described.** `pursue` is safe because `whatDependsOn` requires an inbound
`REQUIRES` an orphan lacks — an accident of write order. `declareGate` is safe
because nothing enumerates gates — true today, and one new reader away from false.
Both have tests that fail the day those stop holding.

## Still open, and not from this thread

`originOf` and `whySupported` carry unguarded `rows[0]`/`.find()` picks, argued
safe on the premise that the write side cannot produce two. `closeEnquiry` showed
that premise fails when the writer can be interrupted and retried. **Each needs its
own answer to "who can write two of these, and can they fail halfway?"** —
`labkit-dev`'s `RESOLVES` argument covers only `RESOLVES`, and neither of these has
been examined.
