# `evaluateCriterion` — verdict: a defect, and the rule that saw it was not mine

**2026-08-22.** Predictions in `040`, including the competing rule, both committed
before any run. Second item off PJ-028's inferred pile.

## Predictions

| Prediction | Outcome |
| --- | --- |
| Window 1 (before `EVALUATED_AS`) is an absence — orphan node, no reader reaches it | **held** |
| Window 2 (before `TRIGGERS`) makes one gate report `never-run` **and** `everFailed: true` | **held**, and it is **not** a defect — the no-gate path produces it legitimately |
| Window 3 (before `BASED_ON`) leaves a verdict that can never be withdrawn | **held** |
| **My rule says window 3 is acceptable** | **refuted** |
| **`labkit-dev`'s reformulation says it is a defect** | **held** |
| The wrong answer I expected to write: calling window 2 a defect because the report *looks* self-contradictory | **avoided** |

## The demonstration

Injected at each edge in turn, deterministic, no racing.

Window 3, before the fix. The verdict is reachable and reports `basis: []`:

```
WINDOW3 withdrawn: undefined
WINDOW3 check state: failed
WINDOW3 gate state: blocked
```

That is after retracting — by review and `replaceAnalysis` — the very evidence the
verdict was reached against. **The gate is blocked by a `fail` whose basis has
been withdrawn, and the record says the verdict still stands.**

The mechanism is one line: `isWithdrawn` is `cited > 0 && standing === 0`, so a
verdict that cited nothing can never be withdrawn. Losing `BASED_ON` sets
`cited = 0` permanently. The comment on that predicate says it is what keeps row
W's asserted-versus-measured distinction "from becoming a loophole" — and an
interrupted write walks straight through it.

## Why my rule missed it and the reformulation did not

`039` said: *acceptable when some other verb could legitimately have produced it,
or when no reader can reach it.* Window 3 satisfies the first clause — calling
`evaluateCriterion` without `citing` produces a verdict with no `BASED_ON`. My
rule therefore called it acceptable.

`labkit-dev` found the flaw by reading the rule rather than the code: **the two
clauses are not parallel.** Clause 2 is about *answers* — an unreachable state
produces none, so none can be false. Clause 1 is about *shapes*, and a shape has
no truth value. Two identical shapes differ in truth when the histories that
produced them differ.

> **A partial state is acceptable exactly when every answer a reader can derive
> from it is true.**

Unreachability stops being a clause and becomes the trivial case. "Another verb
could have produced it" stops being a test and becomes *evidence* — good when the
state carries no claim about how it arose, worthless when it does.

Window 3 is exactly where that matters. `basis: []` is an empty result, and
PJ-011 §5 says an empty result is not a wrong answer — which is why the shape
looks acceptable. But *"this verdict still stands"* is a positive claim, derived
from the same state, and it is false.

**The criterion was recorded in `040` before the run**, so it was not chosen to fit
the result: *a derived answer that is positively false rather than merely empty.*

## Window 2, which is startling and not a defect

One gate, one call, two answers: the check is `never-run`, and `everFailed` is
`true`. The readers disagree by design — `checks` requires `TRIGGERS`,
`everFailed` deliberately does not, because *"has this check ever been shown able
to fail"* is a question about the check and not about the gate.

Both answers are individually true. A contradiction a reader can *construct* is
not a false statement, and treating it as one would have been the wrong answer
`040` named in advance. Recorded here so the next reader does not re-open it.

## What changed

`evaluateCriterion` is transactional. No noun, no edge, no property — the
constraint held. Its docstring already argued against exactly one durable state
and guarded it on the caller-error path only; **interruption was the other side of
the same operation**, which is PJ-027's asymmetry in the verb the sweep flagged
for it.

Four tests: three asserting that an interruption at any edge writes no verdict at
all, and one asserting the property the transaction protects — that retracting the
evidence a verdict rested on *does* withdraw it, and the gate stops being blocked.

## Base rate

**Two examined, one defect.** `sharpen` was not; this is. That is the number worth
having: reading found both, and demonstration separated them. Neither could have
been settled from the sweep's report.

Note the asymmetry that decided it, since it is the useful heuristic: `sharpen`
writes its reachability edge **last**, `evaluateCriterion` writes it **second**.
Everything after a reachability edge is a claim about a record readers can already
see.

## Still open

`pursue`, `recordReview`, `closeEnquiry`, `planWork`, `stateCriterion`,
`declareGate` remain **undecided, not cleared**. Under the reformulated rule the
question for each is the same: order the writes, find the reachability edge, and
ask what a reader can derive from the state between it and the end.
