# The last four verbs — predictions

**2026-08-22, against `81c6ea5`, before a line of test.** `recordReview`,
`planWork`, `stateCriterion`, `declareGate` — everything left of PJ-028's inferred
pile. Five routes examined so far, three defects.

One document rather than four, because the method is settled and the orientation
was one grep each. **Each still gets its own demonstration**; batching the
predictions is not batching the evidence.

## Three shapes, not four

| verb | writes | shape |
| --- | --- | --- |
| `stateCriterion` | `Criterion` node. **No edge.** | nothing to interrupt |
| `planWork` | `Task` node. **No edge.** | nothing to interrupt |
| `recordReview` | `Review` node → `EVALUATES` | reachability edge **last** |
| `declareGate` | `Gate` node → `GOVERNS`×n → `GATES`×n | reachability edges **after**, but every reader is id-keyed |

## Predictions

| | |
| --- | --- |
| **`stateCriterion` and `planWork` have no partial state at all** | A single `createNode` either commits or does not. There is no window between two writes because there is only one write. Predicting this is **a third kind of answer**, not a third and fourth clean result — the pile assumed every verb has an interruption window, and two do not. Worth reporting as a category the method did not anticipate |
| **`recordReview` is clean** | `EVALUATES` last, so an interrupted review is an orphan `Review` node. Predicting no reader reaches it — same argument as `pursue`, and to be checked the same way rather than assumed from the shape |
| **`declareGate` is clean, for a different reason** | Its edges come *after* the node, which is `evaluateCriterion`'s dangerous arrangement. But **every `Gate` reader is keyed by `natural_id`** — nine traversals checked, all of them — and the caller never receives one because the verb threw. Predicting unreachable-by-handle rather than unreachable-by-structure, which is a weaker guarantee and worth saying so |
| **The one that could refute me** | `declareGate`. If any reader walks `Criterion -[:GOVERNS]->` forward without pinning the gate, a half-built gate surfaces as a real gate governed by a subset of its criteria — and `gateStatus` computes `never-evaluated` / `incomplete` from exactly that set. That would be a wrong answer of the `evaluateCriterion` kind |
| **The wrong answer I expect to write** | Declaring the pile clean because four verdicts land together. Four results arriving in one batch is not four confirmations — it is one sitting where the last three defects were found by looking at each separately. If I stop checking `declareGate`'s readers carefully because the first three were easy, that is the sweep behaviour this pile exists to replace |

## Constraint

Demonstrate each. Report the no-partial-state pair as its own category rather than
folding it into the clean column, because **"five clean of nine" would overstate
what was tested** — two of them were never at risk.
