# `pursue` — predictions

**2026-08-22, against `5921647`, before a line of test.** Fourth verb off PJ-028's
inferred pile, and **chosen because it is the one most likely to be clean.** Four
routes examined, three defects; a rate built only on positives says nothing about
how often reading is wrong in the other direction.

## Predictions

`pursued()` writes the `LineOfEnquiry` node, then `MOTIVATES` — **the reachability
edge last**, which is `sharpen`'s arrangement and not `evaluateCriterion`'s.

| | |
| --- | --- |
| **Clean, on the unreachability clause** | Interrupt before `MOTIVATES` and an orphan `LineOfEnquiry` survives. Predicting no reader can reach it: `enquiryStatus` matches by `natural_id`, and the caller never received one because the verb threw; `whatDependsOn`'s `(loe)-[:REQUIRES]->(e)` needs a `REQUIRES` edge an orphan has none of; every other traversal enters through `Question -[:MOTIVATES]->`. No answers derivable, so none can be false |
| **`openEnquiry` interrupted the same way is also clean** | It composes `posed` + `pursued`, so the failure leaves a `Question` with no enquiry — reported `untested`, which is **true**: it is on the books and nothing has been run against it. Identical to `sharpen`'s second window |
| **No retry route either** | `closeEnquiry`'s second defect came from a retry producing two `RESOLVES`. Predicting `pursue` has no analogue, because two enquiries pursuing one question is **legitimate by design** — the docstring says so outright, and `enquiryStatus` is keyed by enquiry rather than picking among them |
| **Therefore no transaction** | Predicting the output is a negative result and a test that pins the unreachability, as `sharpen` got |
| **What would refute it** | Any reader that enumerates `LineOfEnquiry` without an id or an inbound edge. One exists in shape — `whatDependsOn`'s `OPTIONAL MATCH (loe:LineOfEnquiry)` — and is saved only by requiring `REQUIRES`. If anything ever writes `REQUIRES` before `MOTIVATES`, this flips |
| **The wrong answer I expect to write** | Calling it clean *because `sharpen` was*. Same trap as `042`, where matching `evaluateCriterion`'s shape got the verdict right and both mechanisms wrong. The arrangement says where to look, never what is there |

## Constraint

Demonstrate either way. **A clean result is the point of this one**, and reporting
it as such is what makes the base rate mean anything.
