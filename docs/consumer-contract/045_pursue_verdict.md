# `pursue` — verdict: clean, and predicted correctly for once

**2026-08-22.** Predictions in `044`. Fourth verb off PJ-028's inferred pile.

## Predictions

| Prediction | Outcome |
| --- | --- |
| Clean, on the unreachability clause | **held** |
| The orphan enquiry has no inbound edge, so `whatDependsOn` cannot surface it | **held** |
| `openEnquiry` interrupted the same way is also clean — question reported `untested`, which is true | **held** |
| No retry route: two enquiries on one question are legitimate by design | **held** |
| No transaction | **held** |
| The wrong answer I expected to write: calling it clean *because `sharpen` was* | **avoided** — demonstrated on its own terms |

**Every prediction held, including the mechanisms.** That is the first time in this
pile, and it is worth naming as the exception rather than the norm: `042` got the
verdict right and both mechanisms wrong.

## Why it is clean

`pursued()` writes the `LineOfEnquiry` node and then `MOTIVATES` — **reachability
edge last.** An interruption leaves an orphan enquiry, and nothing can derive an
answer from it:

- `enquiryStatus` matches by `natural_id`, and the caller never received one
  because the verb threw;
- every survey traversal enters through `Question -[:MOTIVATES]->`;
- `whatDependsOn`'s bare `OPTIONAL MATCH (loe:LineOfEnquiry)` is saved only by
  requiring an inbound `REQUIRES`, which an orphan has none of.

No derivable answers, so none can be false. That is the trivial case of the rule,
and the demonstration confirms it rather than the reading asserting it.

**The third bullet is a tripwire, not a reassurance**, which is why the test
asserts the orphan has no inbound edge rather than describing it. `whatDependsOn`
enumerates `LineOfEnquiry` unconditionally and is protected by an accident of
write order. **If anything ever writes `REQUIRES` before `MOTIVATES`, `pursue`
needs the transaction that day**, and the test is what says so.

## Base rate

**Five routes examined, three defects.**

| verb / route | verdict |
| --- | --- |
| `sharpen` | clean |
| `evaluateCriterion` — window 3 | defect |
| `closeEnquiry` — interrupted retry | defect |
| `closeEnquiry` — double close (`labkit-dev`) | defect |
| `pursue` | clean |

Two clean of five, and both clean ones write their reachability edge **last**. All
three defects came from verbs that write it early. **Five is not enough to make
that a rule** — it is one confirmed correlation with a mechanism behind it, which
is exactly the shape that has been wrong twice already in this pile.

## Still open

`recordReview`, `planWork`, `stateCriterion`, `declareGate` — **undecided, not
cleared.** `stateCriterion` writes a single node and no edge at all, so it may not
have a partial state to have; that would be a third kind of answer rather than a
third clean one, and worth saying so if it turns out that way.
