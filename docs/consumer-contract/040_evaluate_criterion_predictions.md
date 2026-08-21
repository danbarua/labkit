# `evaluateCriterion` and the reachability rule — predictions

**Written 2026-08-22 against `d1bd931`, before a line of test**, and before any
run at all: `labkit-dev` asked for a quiet machine for a paired A/B, so this is
orientation only. The demonstration waits.

Second item off PJ-028's inferred pile. The first (`sharpen`, `039`) came back
**not a defect**, so the base rate is one-for-one on "reading is not evidence".

## Why this one is a real test of the rule rather than a repeat

`039` established: *a partial state is acceptable exactly when some other verb
could legitimately have produced it, or when no reader can reach it at all.*

`sharpen` cleared it on the second clause — its reachability edge (`MOTIVATES`)
is written **last**, so an interruption leaves nothing a reader can walk to.

**`evaluateCriterion` writes its reachability edge second, not last.** Order is:
validate → `createNode(CriterionEvaluation)` → `EVALUATED_AS` → `TRIGGERS` (if a
gate) → `BASED_ON` (if citing). So from the third write onward the evaluation *is*
reachable, and the later edges are the ones that say what it means.

That is the opposite arrangement, which is why this is a genuine test.

## What the two readers actually require

Read, not run — and this is the load-bearing observation:

| reader | traversal | needs `TRIGGERS`? |
| --- | --- | --- |
| `checks` / `state` / `unmet` | `(c)-[:EVALUATED_AS]->(ev)-[:TRIGGERS]->(g)` | **yes** |
| `everFailed` | `(c)-[:EVALUATED_AS]->(ev)` | **no** |

## Predictions

| | |
| --- | --- |
| **Window 1 — interrupted before `EVALUATED_AS`** | An orphan `CriterionEvaluation` with no edges. Both readers start from `Criterion`, so nothing reaches it. Predicting **absence, not a defect** — the same clause `sharpen` cleared on |
| **Window 2 — interrupted before `TRIGGERS`** | Predicting a **report that contradicts itself**: the gate shows the check `never-run` (it is absent from `checks`) while `everFailed` is `true`, from one interrupted call. Predicting I will *not* be able to call this a defect, because the same state is produced legitimately by the no-gate S-3b path, and `everFailed` is documented as *"deliberately unfiltered by gate"*. Contradictory-looking, and intended |
| **Window 3 — interrupted before `BASED_ON`** | The sharper one. The verdict reads as **asserted rather than measured** — row W's distinction — and, because `isWithdrawn` is `cited > 0 && standing === 0`, it becomes a verdict that **can never be withdrawn**, even when the evidence it actually rested on is retracted. Legitimately reachable (call without `citing`), so the rule says acceptable; but the record now makes a claim about *how* the verdict was reached that is false for this call |
| **Therefore, my actual prediction** | **Not a defect under the rule as stated, and window 3 exposes a gap in the rule.** "Legitimately reachable" and "says something true" are not the same test. Predicting the useful output here is a **refinement of the rule**, not a transaction |
| **What would refute this** | A reader that distinguishes "no basis because none was cited" from "no basis because the write was interrupted". If one exists, window 3 is a demonstrated wrong answer and `evaluateCriterion` becomes transactional |
| **The wrong answer I expect to write** | Calling window 2 a defect because the report *looks* self-contradictory. A contradiction a reader can construct is not the same as a false statement, and `everFailed`'s comment says the unfiltered scope is deliberate. If I reach for the transaction on window 2, I have stopped applying the rule and started pattern-matching on ugliness |

## Constraint

No noun, edge or property. Demonstrate before concluding — and if the answer is
"not a defect, but the rule needs a clause", say that rather than manufacturing a
fix to justify the reading.

## Held

No `bun test` until `labkit-dev` releases the machine. Predictions are recorded
first precisely so the demonstration cannot be tuned to them afterwards.

---

## Addendum — a competing rule, recorded before the run

**Added after the predictions above were committed and still before any run.**
`labkit-dev` proposed a reformulation, and it is better than mine for a reason I
had not seen: **my two clauses are not parallel.**

Clause 2 (*no reader can reach it*) is about **answers** — an unreachable state
produces none, so none can be false. Clause 1 (*another verb could legitimately
have produced it*) is about **shapes**, and a shape has no truth value. Two
identical shapes can differ in truth because the histories that produced them
differ. So clause 1 cannot see window 3, where a verdict with no `BASED_ON` is
true when nothing was cited and false when the write was interrupted.

Their rule, which subsumes both:

> **A partial state is acceptable exactly when every answer a reader can derive
> from it is true.**

Unreachability stops being a clause and becomes the trivial case: no readers, no
answers, nothing to be false. "Another verb could have produced it" stops being a
test and becomes *evidence* — good when the reachable state carries no claim about
how it arose, worthless when it does.

### This changes the predicted verdict, which is the point of writing it down

The two rules **disagree on window 3**, and that disagreement is now on the record
before the demonstration:

| | window 3 verdict |
| --- | --- |
| my rule (`039`) | **acceptable** — the state is legitimately reachable by calling without `citing` |
| the reformulation | **defect** — if the caller cited and the write was interrupted, a reader derives claims that are false |

One run discriminates between two rules instead of confirming one. That is a
better experiment than the one `040` was written for, and it arrived by someone
reading the rule rather than the code.

**What I will look for, stated now so it cannot be chosen afterwards:** whether
any derived answer is *positively false* rather than merely empty. `basis: []` is
an empty result, and PJ-011 §5 says an empty result is not a wrong answer. But
`isWithdrawn` is `cited > 0 && standing === 0`, so an evaluation that cited
nothing can **never** be withdrawn — and a reader therefore derives *"this verdict
still stands"* after its real basis has been invalidated. That is a positive claim,
and if it is false, window 3 is a defect and the reformulation wins.

If instead the only derivable answers are empty ones, my rule wins and the
reformulation is over-strict. **I do not know which**, and the honest position
before running is that the reformulation looks right and its own best test is the
one I am about to run against it.
